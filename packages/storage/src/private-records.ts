import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
    BoundaryError,
    StorageRecordSchema,
    RetentionChangeSchema,
    RetentionCleanupPlanSchema,
    type StorageRecord,
    type StorageDomain,
} from "@jarvis/shared";
import { canonical } from "@jarvis/identity";
import {
    EnvelopeCipher,
    EnvelopeBindingSchema,
    rejectGenericSecrets,
    type AuthorizationV3,
    type EnvelopeBinding,
} from "@jarvis/security";
import { currentDataTransaction } from "./transaction.js";
import { retireObjects } from "./object-deletion.js";
import { linkBackupDeletion } from "./backup-retention.js";
import { validateRecordRetention, validateRetentionUpdate } from "./retention.js";

const U = z.uuid(),
    T = z.string().max(16000),
    I = z.string().min(1).max(128);
const Payloads = {
    conversation: z.strictObject({
        title: T,
        participants: z.array(I).min(1).max(20),
        archived: z.boolean(),
    }),
    message: z.strictObject({
        conversationId: U,
        authorId: I,
        content: T,
        contentType: z.enum(["text/plain", "text/markdown"]),
        model: z.strictObject({ provider: I, model: I }).nullable(),
    }),
    memory: z.strictObject({
        kind: z.enum([
            "working",
            "episodic",
            "semantic",
            "project",
            "preference",
            "procedural",
            "relationship",
            "device",
        ]),
        subject: I,
        content: T,
        confidence: z.number().min(0).max(1),
        lastVerifiedAt: z.number().int().nonnegative().nullable(),
    }),
    embedding: z
        .strictObject({
            memoryId: U,
            provider: I,
            model: I,
            dimensions: z.number().int().min(1).max(2048),
            values: z.array(z.number().finite()).min(1).max(2048),
            sourceVersion: z.number().int().positive(),
        })
        .refine(
            (x) => x.values.length === x.dimensions,
            "Embedding dimensions mismatch",
        ),
    entity: z.strictObject({ type: I, name: T, aliases: z.array(T).max(20) }),
    relationship: z.strictObject({
        sourceEntity: U,
        targetEntity: U,
        relation: I,
        confidence: z.number().min(0).max(1),
    }),
    evidence: z.strictObject({ relationshipId: U, description: T }),
    attachment: z.strictObject({ messageId: U, objectId: U }),
    project: z.strictObject({ name: T, description: T }),
    setting: z.strictObject({ name: I, value: T }),
};
const tables: Record<StorageDomain, string> = {
    conversation: "conversations.conversations",
    message: "conversations.messages",
    attachment: "conversations.attachments",
    memory: "memory.records",
    embedding: "memory.embeddings",
    entity: "knowledge.entities",
    relationship: "knowledge.relationships",
    evidence: "knowledge.relationship_evidence",
    project: "projects.records",
    setting: "settings.owner_records",
};
const domains: Record<StorageDomain, EnvelopeBinding["domain"]> = {
    conversation: "conversations",
    message: "conversations",
    attachment: "files",
    memory: "memory",
    embedding: "memory",
    entity: "knowledge",
    relationship: "knowledge",
    evidence: "knowledge",
    project: "projects",
    setting: "settings",
};
type Catalog = {
    id: string;
    owner_id: string;
    domain: StorageDomain;
    revision: number;
    data_class: string;
    deleted: boolean;
};
export class PrivateRecords {
    constructor(
        private readonly cipher: (ownerId: string) => Promise<EnvelopeCipher>,
        private readonly clock: () => number = Date.now,
    ) {}
    private bound(auth: AuthorizationV3, record: StorageRecord) {
        if (
            record.ownerId !== auth.ownerId ||
            record.actorId !== auth.actorId ||
            auth.environment !== "development"
        )
            throw new BoundaryError("DATA_OWNER_BINDING_DENIED");
    }
    private binding(record: StorageRecord): EnvelopeBinding {
        return EnvelopeBindingSchema.parse({
            version: 1,
            ownerId: record.ownerId,
            environment: "development",
            domain: domains[record.domain],
            recordId: record.id,
            recordVersion: record.revision,
            policy: record.policy,
        });
    }
    async catalog(ownerId: string, id: string): Promise<Catalog> {
        U.parse(id);
        const row = (
            await currentDataTransaction().query<Catalog>(
                "SELECT * FROM storage.record_catalog WHERE owner_id=$1 AND id=$2 AND deleted=false",
                [ownerId, id],
            )
        ).rows[0];
        if (!row) throw new BoundaryError("DATA_NOT_FOUND");
        return row;
    }
    async put(
        auth: AuthorizationV3,
        input: unknown,
    ): Promise<{ id: string; revision: number; stored: boolean }> {
        const record = StorageRecordSchema.parse(input);
        this.bound(auth, record);
        Payloads[record.domain].parse(record.payload);
        // Metadata is also durable owner data, not a bypass for credentials.
        rejectGenericSecrets(record);
        validateRecordRetention(record);
        const now = this.clock();
        if (record.createdAt > now || record.updatedAt > now)
            throw new BoundaryError("DATA_TIME_INVALID");
        if (
            record.retention.mode === "NEVER_STORE" ||
            record.policy.retention.mode === "never-store"
        )
            return { id: record.id, revision: record.revision, stored: false };
        if (
            record.retention.mode === "DELETE_AFTER_SESSION" ||
            record.policy.retention.mode === "session"
        )
            throw new BoundaryError("SESSION_DATA_MUST_REMAIN_TRANSIENT");
        if (
            record.retention.expiresAt !== null &&
            record.retention.expiresAt <= now
        )
            throw new BoundaryError("DATA_EXPIRED");
        if (
            (["conversation", "message"].includes(record.domain) &&
                !record.policy.consent.storeConversation) ||
            (record.domain === "memory" &&
                !record.policy.consent.createMemory) ||
            (["entity", "relationship", "evidence"].includes(record.domain) &&
                !record.policy.consent.projectKnowledge) ||
            (record.domain === "attachment" &&
                !record.policy.consent.keepAttachments)
        )
            throw new BoundaryError("DATA_CONSENT_REQUIRED");
        const tx = currentDataTransaction(),
            table = tables[record.domain];
        if (
            (
                await tx.query("SELECT 1 FROM storage.objects WHERE id=$1", [
                    record.id,
                ])
            ).rowCount
        )
            throw new BoundaryError("DATA_ID_CONFLICT");
        const existing = (
            await tx.query<Catalog>(
                "SELECT * FROM storage.record_catalog WHERE id=$1",
                [record.id],
            )
        ).rows[0];
        if (
            existing &&
            (existing.owner_id !== auth.ownerId ||
                existing.deleted ||
                existing.domain !== record.domain ||
                existing.revision !== record.previousRevision)
        )
            throw new BoundaryError("DATA_VERSION_OR_OWNER_CONFLICT");
        if (!existing && record.revision !== 1)
            throw new BoundaryError("DATA_VERSION_CONFLICT");
        if (existing)
            validateRetentionUpdate(await this.read(auth.ownerId, record.id), record, auth, now);
        if (
            existing &&
            Number(record.policy.classification.slice(1)) <
                Number(existing.data_class.slice(1))
        )
            throw new BoundaryError("DATA_CLASS_DOWNGRADE_DENIED");
        const sourceIds = new Set(record.sources);
        if (
            existing &&
            (
                await tx.query(
                    "SELECT 1 FROM storage.data_lineage WHERE owner_id=$1 AND source_id=$2 LIMIT 1",
                    [auth.ownerId, record.id],
                )
            ).rowCount
        )
            throw new BoundaryError(
                "SOURCE_REVISION_REQUIRES_DERIVED_INVALIDATION",
            );
        const required: Record<string, string[]> = {
            message: ["conversationId"],
            embedding: ["memoryId"],
            relationship: ["sourceEntity", "targetEntity"],
            evidence: ["relationshipId"],
            attachment: ["messageId"],
        };
        for (const field of required[record.domain] ?? [])
            sourceIds.add(String(record.payload[field]));
        if (sourceIds.size && record.policy.consent.externalAI)
            throw new BoundaryError(
                "DERIVED_EXTERNAL_REQUIRES_OWNER_RECLASSIFICATION",
            );
        if (record.domain === "attachment") {
            const object = (
                await tx.query<{ data_class: string }>(
                    "SELECT data_class FROM storage.objects WHERE owner_id=$1 AND id=$2 AND deleted=false",
                    [auth.ownerId, record.payload.objectId],
                )
            ).rows[0];
            if (
                !object ||
                Number(object.data_class.slice(1)) >
                    Number(record.policy.classification.slice(1))
            )
                throw new BoundaryError("ATTACHMENT_SCOPE_OR_CLASS_DENIED");
        }
        if (existing && sourceIds.size)
            throw new BoundaryError("DERIVED_REVISION_REQUIRES_RECOMPUTE");
        for (const sourceId of sourceIds) {
            const source = await this.catalog(auth.ownerId, sourceId);
            const expected =
                record.domain === "message"
                    ? "conversation"
                    : record.domain === "relationship"
                      ? "entity"
                      : record.domain === "evidence"
                        ? "relationship"
                        : record.domain === "attachment"
                          ? "message"
                          : null;
            if (
                expected &&
                (required[record.domain] ?? []).some(
                    (field) => record.payload[field] === sourceId,
                ) &&
                source.domain !== expected
            )
                throw new BoundaryError("SOURCE_DOMAIN_MISMATCH");
            if (
                Number(source.data_class.slice(1)) >
                Number(record.policy.classification.slice(1))
            )
                throw new BoundaryError("LINEAGE_CLASS_DOWNGRADE_DENIED");
            if (
                record.domain === "embedding" &&
                (source.domain !== "memory" ||
                    source.revision !== record.payload.sourceVersion)
            )
                throw new BoundaryError("EMBEDDING_SOURCE_VERSION_MISMATCH");
        }
        record.sources = [...sourceIds];
        const binding = this.binding(record),
            envelope = await (
                await this.cipher(auth.ownerId)
            ).encrypt(record, binding),
            metadata = JSON.stringify(binding),
            payload = JSON.stringify(envelope);
        await tx.query(
            "INSERT INTO storage.record_catalog(id,owner_id,domain,revision,data_class) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET revision=EXCLUDED.revision,data_class=EXCLUDED.data_class",
            [
                record.id,
                auth.ownerId,
                record.domain,
                record.revision,
                record.policy.classification,
            ],
        );
        if (record.domain === "memory")
            await tx.query(
                "INSERT INTO memory.records(id,owner_id,project_id,version,payload,created_at,storage_metadata) VALUES($1,$2,$3,1,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,storage_metadata=EXCLUDED.storage_metadata",
                [
                    record.id,
                    auth.ownerId,
                    record.projectId ?? "default",
                    payload,
                    new Date(record.createdAt),
                    metadata,
                ],
            );
        else if (record.domain === "embedding") {
            const p = Payloads.embedding.parse(record.payload),
                native =
                    record.policy.classification === "D0"
                        ? JSON.stringify(p.values)
                        : null;
            await tx.query(
                "INSERT INTO memory.embeddings(id,memory_id,provider,dimensions,embedding,owner_id,encrypted_payload,storage_metadata) VALUES($1,$2,$3,$4,$5::vector,$6,$7,$8)",
                [
                    record.id,
                    p.memoryId,
                    p.provider,
                    p.dimensions,
                    native,
                    auth.ownerId,
                    payload,
                    metadata,
                ],
            );
        } else
            await tx.query(
                `INSERT INTO ${table}(id,owner_id,payload,metadata) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,metadata=EXCLUDED.metadata`,
                [record.id, auth.ownerId, payload, metadata],
            );
        await tx.query(
            "INSERT INTO storage.record_versions(owner_id,record_id,revision,payload,metadata) VALUES($1,$2,$3,$4,$5)",
            [auth.ownerId, record.id, record.revision, payload, metadata],
        );
        if (record.domain === "attachment")
            await tx.query(
                "INSERT INTO storage.attachment_objects(owner_id,attachment_id,object_id) VALUES($1,$2,$3)",
                [auth.ownerId, record.id, record.payload.objectId],
            );
        for (const sourceId of sourceIds) {
            const source = await this.catalog(auth.ownerId, sourceId);
            await tx.query(
                "INSERT INTO storage.data_lineage(owner_id,source_id,derived_id,source_version,on_delete) VALUES($1,$2,$3,$4,'cascade')",
                [auth.ownerId, sourceId, record.id, source.revision],
            );
            await tx.query(
                "INSERT INTO memory.sources(owner_id,record_id,source_id) VALUES($1,$2,$3)",
                [auth.ownerId, record.id, sourceId],
            );
        }
        return { id: record.id, revision: record.revision, stored: true };
    }
    private async load(ownerId: string, id: string): Promise<StorageRecord> {
        const c = await this.catalog(ownerId, id),
            table = tables[c.domain],
            payloadColumn =
                c.domain === "embedding" ? "encrypted_payload" : "payload",
            metaColumn = ["memory", "embedding"].includes(c.domain)
                ? "storage_metadata"
                : "metadata";
        const row = (
            await currentDataTransaction().query<{
                payload: string;
                metadata: unknown;
            }>(
                `SELECT ${payloadColumn} AS payload,${metaColumn} AS metadata FROM ${table} WHERE owner_id=$1 AND id=$2`,
                [ownerId, id],
            )
        ).rows[0];
        if (!row) throw new BoundaryError("DATA_PAYLOAD_MISSING");
        const b = EnvelopeBindingSchema.parse(row.metadata);
        if (
            b.ownerId !== ownerId ||
            b.recordId !== id ||
            b.recordVersion !== c.revision ||
            b.domain !== domains[c.domain] ||
            b.policy.classification !== c.data_class
        )
            throw new BoundaryError("DATA_BINDING_MISMATCH");
        const record = StorageRecordSchema.parse(
            await (
                await this.cipher(ownerId)
            ).decrypt(JSON.parse(row.payload), b),
        );
        if (
            record.ownerId !== ownerId ||
            record.id !== id ||
            record.domain !== c.domain ||
            record.revision !== c.revision
        )
            throw new BoundaryError("DATA_BINDING_MISMATCH");
        validateRecordRetention(record);
        return record;
    }
    async read(ownerId: string, id: string): Promise<StorageRecord> {
        const record = await this.load(ownerId, id);
        if (
            record.retention.expiresAt !== null &&
            record.retention.expiresAt <= this.clock()
        )
            throw new BoundaryError("DATA_EXPIRED");
        return record;
    }
    private retentionAuthority(auth: AuthorizationV3, capability: string) {
        if (auth.capability !== capability || !auth.approvalId ||
            auth.assurance !== "A3" || auth.zone !== "Z4" ||
            auth.environment !== "development")
            throw new BoundaryError("RETENTION_OWNER_APPROVAL_REQUIRED");
    }
    async changeRetention(auth: AuthorizationV3, id: string, input: unknown) {
        this.retentionAuthority(auth, "data.retention.modify");
        const change = RetentionChangeSchema.parse(input),
            record = await this.read(auth.ownerId, id),
            retention = change.retention;
        if (record.revision !== change.expectedRevision ||
            retention.id !== record.retention.id ||
            retention.revision !== record.retention.revision + 1)
            throw new BoundaryError("RETENTION_VERSION_CONFLICT");
        // NEVER_STORE is a processing mode, not a way to leave old content behind.
        if (retention.mode === "NEVER_STORE" || retention.mode === "DELETE_AFTER_SESSION")
            throw new BoundaryError("RETENTION_CHANGE_REQUIRES_FORGET");
        return this.put(auth, {
            ...record,
            actorId: auth.actorId,
            revision: record.revision + 1,
            previousRevision: record.revision,
            updatedAt: this.clock(),
            reason: "owner-authorized retention change",
            retention,
            policy: { ...record.policy, retention: retention.expiresAt === null
                ? { mode: "keep" }
                : { mode: "until", expiresAt: new Date(retention.expiresAt).toISOString() } },
        });
    }
    private async cleanupPlan(auth: AuthorizationV3, id: string, plannedAt: number) {
        const record = await this.load(auth.ownerId, id),
            expiry = record.retention.expiresAt;
        if (expiry === null || expiry > this.clock() ||
            !["KEEP_UNTIL_DATE", "KEEP_FOR_DURATION"].includes(record.retention.mode))
            throw new BoundaryError("RETENTION_NOT_DUE");
        const { rows, objectIds } = await this.deletionScope(auth, id);
        return RetentionCleanupPlanSchema.parse({
            version: 1, ownerId: auth.ownerId, recordId: id,
            recordRevision: record.revision, retentionId: record.retention.id,
            retentionRevision: record.retention.revision, expiresAt: expiry,
            plannedAt, validUntil: plannedAt + 300000,
            affected: rows.map(r => ({ id: r.id, domain: r.domain,
                revision: r.revision, classification: r.data_class }))
                .sort((a,b) => a.id.localeCompare(b.id)),
            objectIds: objectIds.sort(), backupExpiryRequired: true,
        });
    }
    async planRetention(auth: AuthorizationV3, id: string) {
        this.retentionAuthority(auth, "data.read");
        return this.cleanupPlan(auth, id, this.clock());
    }
    async executeRetention(auth: AuthorizationV3, id: string, input: unknown) {
        this.retentionAuthority(auth, "data.delete");
        const plan = RetentionCleanupPlanSchema.parse(input);
        if (plan.ownerId !== auth.ownerId || plan.recordId !== id ||
            plan.plannedAt > this.clock() || this.clock() >= plan.validUntil)
            throw new BoundaryError("RETENTION_PLAN_BINDING_OR_EXPIRY_INVALID");
        const current = await this.cleanupPlan(auth, id, plan.plannedAt);
        if (canonical(current) !== canonical(plan))
            throw new BoundaryError("RETENTION_PLAN_STALE");
        // Same identity transaction and storage savepoint as permit consumption/audit.
        return this.forget(auth, id);
    }
    async lineage(ownerId: string, id: string) {
        await this.catalog(ownerId, id);
        return (
            await currentDataTransaction().query(
                "SELECT source_id,derived_id,source_version,on_delete FROM storage.data_lineage WHERE owner_id=$1 AND (source_id=$2 OR derived_id=$2)",
                [ownerId, id],
            )
        ).rows;
    }
    async inventory(ownerId: string) {
        return (
            await currentDataTransaction().query(
                "SELECT domain,data_class,count(*)::integer AS count FROM storage.record_catalog WHERE owner_id=$1 AND deleted=false GROUP BY domain,data_class ORDER BY domain,data_class",
                [ownerId],
            )
        ).rows;
    }
    private async deletionScope(auth: AuthorizationV3, id: string) {
        const tx = currentDataTransaction();
        await this.catalog(auth.ownerId, id);
        const rows = (
            await tx.query<Catalog>(
                "WITH RECURSIVE affected(id) AS (SELECT id FROM storage.record_catalog WHERE owner_id=$1 AND id=$2 UNION SELECT l.derived_id FROM storage.data_lineage l JOIN affected a ON l.source_id=a.id WHERE l.owner_id=$1) SELECT c.* FROM storage.record_catalog c JOIN affected a ON c.id=a.id WHERE c.owner_id=$1",
                [auth.ownerId, id],
            )
        ).rows;
        if (rows.length > 100)
            throw new BoundaryError("DELETION_SCOPE_TOO_LARGE");
        if (
            rows.some(
                (row) =>
                    Number(row.data_class.slice(1)) >
                    Number(auth.zone.slice(1)),
            )
        )
            throw new BoundaryError("DERIVED_DELETE_ZONE_UNDERSTATED");
        const ids = rows.map((r) => r.id);
        const attachmentIds = rows
            .filter((r) => r.domain === "attachment")
            .map((r) => r.id);
        const links = (
            await tx.query<{ attachment_id: string; object_id: string }>(
                "SELECT attachment_id,object_id FROM storage.attachment_objects WHERE owner_id=$1 AND attachment_id=ANY($2::uuid[])",
                [auth.ownerId, attachmentIds],
            )
        ).rows;
        if (links.length !== attachmentIds.length)
            throw new BoundaryError("ATTACHMENT_LINKAGE_MIGRATION_REQUIRED");
        for (const link of links) {
            // Lifecycle indexes must agree with authenticated canonical ciphertext.
            // Internal load permits expiry cleanup without returning expired content.
            const attachment = await this.load(auth.ownerId, link.attachment_id);
            if (Payloads.attachment.parse(attachment.payload).objectId !== link.object_id)
                throw new BoundaryError("ATTACHMENT_LINKAGE_MISMATCH");
        }
        const candidates = [...new Set(links.map((r) => r.object_id))];
        // Reference rows, not caller-supplied counts, determine final ownership.
        // The identity transaction serializes writes; retireObjects rechecks before purge.
        const shared = new Set((await tx.query<{ object_id: string }>(
            "SELECT DISTINCT object_id FROM storage.attachment_objects WHERE owner_id=$1 AND object_id=ANY($2::uuid[]) AND NOT(attachment_id=ANY($3::uuid[]))",
            [auth.ownerId, candidates, attachmentIds],
        )).rows.map(row => row.object_id));
        const objectIds = candidates.filter(objectId => !shared.has(objectId));
        return { rows, ids, attachmentIds, objectIds };
    }
    async reconcileAttachment(auth: AuthorizationV3, id: string) {
        if (auth.capability !== "data.write" || !auth.approvalId || auth.assurance !== "A3" || auth.zone !== "Z4")
            throw new BoundaryError("ATTACHMENT_RECONCILIATION_APPROVAL_REQUIRED");
        const record = await this.read(auth.ownerId, id);
        if (record.domain !== "attachment") throw new BoundaryError("ATTACHMENT_REQUIRED");
        const payload = Payloads.attachment.parse(record.payload);
        const parent = await this.read(auth.ownerId, payload.messageId);
        if (parent.domain !== "message") throw new BoundaryError("ATTACHMENT_PARENT_INVALID");
        const tx = currentDataTransaction();
        const object = (await tx.query<{ data_class: string }>(
            "SELECT data_class FROM storage.objects WHERE owner_id=$1 AND id=$2 AND deleted=false FOR UPDATE",
            [auth.ownerId, payload.objectId],
        )).rows[0];
        if (!object || Number(object.data_class.slice(1)) > Number(record.policy.classification.slice(1)))
            throw new BoundaryError("ATTACHMENT_SCOPE_OR_CLASS_DENIED");
        if (!(await tx.query(
            "SELECT 1 FROM storage.data_lineage WHERE owner_id=$1 AND source_id=$2 AND derived_id=$3",
            [auth.ownerId, payload.messageId, id],
        )).rowCount) throw new BoundaryError("ATTACHMENT_PROVENANCE_INVALID");
        const prior = (await tx.query<{ object_id: string }>(
            "SELECT object_id FROM storage.attachment_objects WHERE owner_id=$1 AND attachment_id=$2",
            [auth.ownerId, id],
        )).rows[0];
        if (prior && prior.object_id !== payload.objectId) throw new BoundaryError("ATTACHMENT_LINKAGE_MISMATCH");
        await tx.query(
            "INSERT INTO storage.attachment_objects(owner_id,attachment_id,object_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [auth.ownerId, id, payload.objectId],
        );
        return { id, objectId: payload.objectId, reconciled: true };
    }
    async forget(auth: AuthorizationV3, id: string) {
        const tx = currentDataTransaction(),
            { rows, ids, attachmentIds, objectIds } = await this.deletionScope(auth, id),
            deletionId = randomUUID();
        await tx.query(
            "DELETE FROM storage.attachment_objects WHERE owner_id=$1 AND attachment_id=ANY($2::uuid[])",
            [auth.ownerId, attachmentIds],
        );
        // Child vectors first, preserving the original memory foreign key.
        rows.sort(
            (a, b) =>
                Number(b.domain === "embedding") -
                Number(a.domain === "embedding"),
        );
        for (const row of rows) {
            await tx.query(
                `DELETE FROM ${tables[row.domain]} WHERE owner_id=$1 AND id=$2`,
                [auth.ownerId, row.id],
            );
            await tx.query(
                "DELETE FROM storage.record_versions WHERE owner_id=$1 AND record_id=$2",
                [auth.ownerId, row.id],
            );
            await tx.query(
                "INSERT INTO storage.deletion_tombstones(owner_id,record_id,deleted_at,deletion_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
                [auth.ownerId, row.id, new Date(this.clock()), deletionId],
            );
        }
        await tx.query(
            "DELETE FROM storage.data_lineage WHERE owner_id=$1 AND (source_id=ANY($2::uuid[]) OR derived_id=ANY($2::uuid[]))",
            [auth.ownerId, ids],
        );
        await tx.query(
            "DELETE FROM memory.sources WHERE owner_id=$1 AND (record_id=ANY($2::uuid[]) OR source_id=ANY($2::uuid[]))",
            [auth.ownerId, ids],
        );
        await tx.query(
            "UPDATE storage.record_catalog SET deleted=true WHERE owner_id=$1 AND id=ANY($2::uuid[])",
            [auth.ownerId, ids],
        );
        const result = {
            version: 1,
            id: deletionId,
            ownerId: auth.ownerId,
            targetId: id,
            authorizationId: auth.id,
            createdAt: this.clock(),
            state: objectIds.length ? "DELETING" : "PURGED",
            affectedIds: [...ids, ...objectIds],
            backupExpiryRequired: true,
        };
        // Contains only IDs/state, never deleted content. Backup expiry is explicitly separate.
        await tx.query(
            "INSERT INTO storage.deletion_requests(id,owner_id,payload) VALUES($1,$2,$3)",
            [deletionId, auth.ownerId, JSON.stringify(result)],
        );
        await retireObjects(auth, deletionId, objectIds);
        await linkBackupDeletion(auth.ownerId, deletionId, [...ids, ...objectIds], this.clock());
        return result;
    }
}
