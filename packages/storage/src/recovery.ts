import { randomUUID } from "node:crypto";
import { z } from "zod";
import type pg from "pg";
import { BackupManifestSchema, BoundaryError } from "@jarvis/shared";
import { canonical } from "@jarvis/identity";
import { RecordCipher, type AuthorizationV3 } from "@jarvis/security";
import { currentDataTransaction } from "./transaction.js";
import { storageHash, type ObjectStorage } from "./objects.js";

// Fixed repository-owned tables; no SQL identifiers are accepted from an artifact.
export const recoveryTables = [
    "identity.root_owner",
    "identity.devices",
    "identity.passkeys",
    "identity.sessions",
    "identity.subjects",
    "identity.delegations",
    "identity.challenges",
    "identity.approvals",
    "identity.replays",
    "security.governance_state",
    "storage.record_catalog",
    "conversations.conversations",
    "conversations.messages",
    "conversations.attachments",
    "memory.records",
    "memory.embeddings",
    "memory.sources",
    "knowledge.entities",
    "knowledge.relationships",
    "knowledge.relationship_evidence",
    "projects.records",
    "settings.owner_records",
    "storage.objects",
    "storage.object_versions",
    "storage.record_versions",
    "storage.retention_policies",
    "storage.deletion_requests",
    "storage.deletion_tombstones",
    "storage.data_lineage",
    "security.key_metadata",
    "security.secret_metadata",
    "security.data_access_events",
    "audit.identity_events",
    "audit.entries",
    "audit.policy_entries",
    "events.envelopes",
    "storage.exports",
    "storage.export_items",
    "recovery.migration_probe",
] as const;
const Snapshot = z.strictObject({
    version: z.literal(1),
    ownerId: z.string(),
    schemaHash: z.string(),
    tables: z.record(z.string(), z.array(z.json())),
    objects: z.record(z.string(), z.string()),
});
export type RecoverySnapshot = z.infer<typeof Snapshot>;
export interface IsolatedRestoreTarget {
    readonly id: string;
    restore(snapshot: RecoverySnapshot): Promise<void>;
}
async function schemaHash(client: pg.PoolClient) {
    return storageHash(
        canonical(
            (
                await client.query(
                    "SELECT version,checksum FROM settings.schema_migrations ORDER BY version",
                )
            ).rows,
        ),
    );
}
export class StorageRecovery {
    constructor(
        private readonly backupStore: ObjectStorage,
        private readonly liveObjects: ObjectStorage,
        private readonly backupCipher: RecordCipher,
        private readonly target: IsolatedRestoreTarget | null,
    ) {}
    async create(auth: AuthorizationV3) {
        if (
            auth.capability !== "storage.backup.create" ||
            !auth.approvalId ||
            auth.assurance !== "A3"
        )
            throw new BoundaryError("BACKUP_APPROVAL_REQUIRED");
        const tx = currentDataTransaction(),
            tables: RecoverySnapshot["tables"] = {};
        for (const table of recoveryTables) {
            const rows = (
                await tx.query(
                    `SELECT to_jsonb(t) AS row FROM ${table} t LIMIT 2001`,
                )
            ).rows;
            if (rows.length > 2000) throw new BoundaryError("BACKUP_ROW_LIMIT");
            tables[table] = rows.map((r) => r.row);
        }
        const objects: Record<string, string> = {};
        for (const r of (
            await tx.query<{ object_key: string }>(
                "SELECT object_key FROM storage.objects WHERE owner_id=$1 AND deleted=false",
                [auth.ownerId],
            )
        ).rows)
            objects[r.object_key] = (
                await this.liveObjects.get(auth.ownerId, r.object_key)
            ).toString("base64");
        const snapshot = Snapshot.parse({
                version: 1,
                ownerId: auth.ownerId,
                schemaHash: await schemaHash(tx),
                tables,
                objects,
            }),
            encoded = Buffer.from(canonical(snapshot));
        if (encoded.length > 10000000)
            throw new BoundaryError("BACKUP_SIZE_LIMIT");
        const id = randomUUID();
        const items: { path: string; sha256: string; size: number }[] = [];
        for (let offset = 0; offset < encoded.length; offset += 40000) {
            const data = encoded
                    .subarray(offset, offset + 40000)
                    .toString("base64"),
                box = Buffer.from(
                    this.backupCipher.encrypt(
                        { data },
                        `backup:${auth.ownerId}:${id}:${items.length}`,
                    ),
                ),
                key = await this.backupStore.put(auth.ownerId, box);
            items.push({
                path: `chunks/${key}`,
                sha256: key,
                size: box.length,
            });
        }
        const manifest = BackupManifestSchema.parse({
            version: 1,
            id,
            ownerId: auth.ownerId,
            createdAt: Date.now(),
            sourceVersion: "j0.4",
            schemaHash: snapshot.schemaHash,
            domains: Object.keys(tables),
            objectCount: Object.keys(objects).length,
            keyId: "backup-key1",
            items,
            state: "PENDING",
            validatedAt: null,
        });
        await this.readSnapshot(manifest);
        manifest.state = "VALID";
        manifest.validatedAt = Date.now();
        await tx.query(
            "INSERT INTO storage.backups(id,owner_id,payload) VALUES($1,$2,$3)",
            [
                id,
                auth.ownerId,
                this.backupCipher.encrypt(manifest, "backup:manifest:" + id),
            ],
        );
        for (const item of items)
            await tx.query(
                "INSERT INTO storage.backup_items(backup_id,owner_id,item_id,checksum) VALUES($1,$2,$3,$4)",
                [id, auth.ownerId, item.path, item.sha256],
            );
        return manifest;
    }
    private async readSnapshot(manifest: z.infer<typeof BackupManifestSchema>) {
        if (
            manifest.keyId !== "backup-key1" ||
            !manifest.items.length ||
            manifest.items.length > 400
        )
            throw new BoundaryError("BACKUP_KEY_OR_SIZE_INVALID");
        const chunks: Buffer[] = [];
        for (const [index, item] of manifest.items.entries()) {
            if (item.path !== `chunks/${item.sha256}`)
                throw new BoundaryError("BACKUP_MANIFEST_INVALID");
            const bytes = await this.backupStore.get(
                manifest.ownerId,
                item.sha256,
            );
            if (
                bytes.length !== item.size ||
                storageHash(bytes) !== item.sha256
            )
                throw new BoundaryError("BACKUP_CHECKSUM_FAILED");
            const decoded = z
                .strictObject({ data: z.string().max(55000) })
                .parse(
                    this.backupCipher.decrypt(
                        bytes.toString("utf8"),
                        `backup:${manifest.ownerId}:${manifest.id}:${index}`,
                    ),
                );
            chunks.push(Buffer.from(decoded.data, "base64"));
        }
        const value = Snapshot.parse(
            JSON.parse(Buffer.concat(chunks).toString("utf8")),
        );
        if (
            value.ownerId !== manifest.ownerId ||
            value.schemaHash !== manifest.schemaHash ||
            Object.keys(value.tables).sort().join() !==
                [...recoveryTables].sort().join() ||
            Object.keys(value.objects).length !== manifest.objectCount
        )
            throw new BoundaryError("BACKUP_SNAPSHOT_MISMATCH");
        for (const [key, encoded] of Object.entries(value.objects))
            if (storageHash(Buffer.from(encoded, "base64")) !== key)
                throw new BoundaryError("BACKUP_OBJECT_CORRUPT");
        return value;
    }
    async validate(ownerId: string, id: string) {
        z.uuid().parse(id);
        const row = (
            await currentDataTransaction().query<{ payload: string }>(
                "SELECT payload FROM storage.backups WHERE id=$1 AND owner_id=$2",
                [id, ownerId],
            )
        ).rows[0];
        if (!row) throw new BoundaryError("BACKUP_NOT_FOUND");
        const manifest = BackupManifestSchema.parse(
            this.backupCipher.decrypt(row.payload, "backup:manifest:" + id),
        );
        if (
            manifest.ownerId !== ownerId ||
            manifest.id !== id ||
            manifest.state !== "VALID" ||
            manifest.validatedAt === null
        )
            throw new BoundaryError("BACKUP_NOT_VALIDATED");
        return { manifest, snapshot: await this.readSnapshot(manifest) };
    }
    async restore(auth: AuthorizationV3, id: string) {
        if (
            auth.capability !== "storage.backup.restore" ||
            !auth.approvalId ||
            auth.assurance !== "A3" ||
            !this.target
        )
            throw new BoundaryError("ISOLATED_RESTORE_APPROVAL_REQUIRED");
        const { snapshot } = await this.validate(auth.ownerId, id);
        if (
            snapshot.schemaHash !== (await schemaHash(currentDataTransaction()))
        )
            throw new BoundaryError("RESTORE_SCHEMA_MISMATCH");
        await this.target.restore(snapshot);
        const job = {
            version: 1,
            id: randomUUID(),
            backupId: id,
            ownerId: auth.ownerId,
            target: this.target.id,
            authorizationId: auth.id,
            createdAt: Date.now(),
            state: "VERIFIED",
        };
        await currentDataTransaction().query(
            "INSERT INTO storage.restore_jobs(id,owner_id,payload) VALUES($1,$2,$3)",
            [
                job.id,
                auth.ownerId,
                this.backupCipher.encrypt(job, "restore:" + job.id),
            ],
        );
        return job;
    }
    async destructiveProbe(auth: AuthorizationV3, backupId: string) {
        if (
            auth.capability !== "storage.migration.execute" ||
            !auth.approvalId ||
            auth.assurance !== "A3"
        )
            throw new BoundaryError("MIGRATION_APPROVAL_REQUIRED");
        const { manifest, snapshot } = await this.validate(
                auth.ownerId,
                backupId,
            ),
            tx = currentDataTransaction(),
            current = (
                await tx.query(
                    "SELECT to_jsonb(t) AS row FROM recovery.migration_probe t ORDER BY id",
                )
            ).rows.map((r) => r.row);
        if (
            Date.now() - manifest.createdAt > 300000 ||
            snapshot.schemaHash !== (await schemaHash(tx)) ||
            canonical(current) !==
                canonical(snapshot.tables["recovery.migration_probe"])
        )
            throw new BoundaryError("CURRENT_RECOVERY_EVIDENCE_REQUIRED");
        await tx.query(
            "DELETE FROM recovery.migration_probe WHERE owner_id=$1",
            [auth.ownerId],
        );
        if (
            (
                await tx.query(
                    "SELECT 1 FROM recovery.migration_probe WHERE owner_id=$1",
                    [auth.ownerId],
                )
            ).rowCount !== 0
        )
            throw new BoundaryError("MIGRATION_VERIFICATION_FAILED");
        return {
            verified: true,
            backupId,
            affectedTable: "recovery.migration_probe",
            migration: "delete-owner-probe-v1",
        };
    }
}
/** Provisioned empty test database only. No runtime-created destination or production overwrite. */
export class PostgresIsolatedRestore implements IsolatedRestoreTarget {
    constructor(
        readonly id: string,
        private readonly pool: pg.Pool,
        private readonly objects: ObjectStorage,
        private readonly identityCipher: RecordCipher,
    ) {
        if (!/^jarvis_restore_test_[a-f0-9]{16}$/.test(id))
            throw new BoundaryError("RESTORE_TARGET_NOT_ISOLATED");
    }
    async restore(snapshot: RecoverySnapshot) {
        Snapshot.parse(snapshot);
        const tx = await this.pool.connect();
        try {
            await tx.query("BEGIN");
            await tx.query("SELECT pg_advisory_xact_lock(7247662)");
            if (
                (await tx.query("SELECT current_database() AS name")).rows[0]
                    ?.name !== this.id
            )
                throw new BoundaryError("RESTORE_TARGET_MISMATCH");
            if (snapshot.schemaHash !== (await schemaHash(tx)))
                throw new BoundaryError("RESTORE_SCHEMA_MISMATCH");
            for (const table of recoveryTables)
                if ((await tx.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount)
                    throw new BoundaryError("RESTORE_TARGET_NOT_EMPTY");
            for (const table of recoveryTables) {
                let rows = snapshot.tables[table]!;
                // A backup is not permission to resurrect old sessions or executable capabilities.
                if (
                    [
                        "identity.sessions",
                        "identity.delegations",
                        "identity.challenges",
                        "identity.approvals",
                        "identity.replays",
                        "security.governance_state",
                    ].includes(table)
                )
                    rows = [];
                if (table === "identity.root_owner")
                    rows = rows.map((raw) => {
                        const row = raw as Record<string, unknown>,
                            owner = this.identityCipher.decrypt(
                                String(row.payload),
                                "identity:development:owner:" + row.id,
                            ) as { epoch: number };
                        owner.epoch++;
                        return {
                            ...row,
                            payload: this.identityCipher.encrypt(
                                owner,
                                "identity:development:owner:" + row.id,
                            ),
                        };
                    });
                if (rows.length)
                    await tx.query(
                        `INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`,
                        [JSON.stringify(rows)],
                    );
            }
            for (const [key, value] of Object.entries(snapshot.objects))
                if (
                    (await this.objects.put(
                        snapshot.ownerId,
                        Buffer.from(value, "base64"),
                    )) !== key
                )
                    throw new BoundaryError("RESTORE_OBJECT_HASH_MISMATCH");
            await tx.query(
                "SELECT setval('audit.identity_events_sequence_seq',GREATEST(COALESCE((SELECT max(sequence) FROM audit.identity_events),0),1))",
            );
            await tx.query("COMMIT");
        } catch (error) {
            await tx.query("ROLLBACK");
            throw error;
        } finally {
            tx.release();
        }
    }
}
