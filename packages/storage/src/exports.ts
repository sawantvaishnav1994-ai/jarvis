import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ExportManifestSchema, BoundaryError, StorageRecordSchema, ObjectMetadataSchema } from "@jarvis/shared";
import { canonical } from "@jarvis/identity";
import { RecordCipher, rejectGenericSecrets, type AuthorizationV3 } from "@jarvis/security";
import { currentDataTransaction } from "./transaction.js";
import { PrivateRecords } from "./private-records.js";
import { PrivateObjects } from "./private-objects.js";
import { storageHash } from "./objects.js";

export const PortableExportSchema = z.strictObject({
    manifest: ExportManifestSchema,
    files: z.record(z.string(), z.string()),
});
export function verifyPortableExport(raw: unknown) {
    const value = PortableExportSchema.parse(raw);
    if (
        new Set(value.manifest.items.map((i) => i.path)).size !==
            value.manifest.items.length ||
        Object.keys(value.files).length !== value.manifest.items.length
    )
        throw new BoundaryError("EXPORT_MANIFEST_MISMATCH");
    for (const item of value.manifest.items) {
        const bytes = value.files[item.path];
        if (
            bytes === undefined ||
            Buffer.byteLength(bytes) !== item.size ||
            storageHash(bytes) !== item.sha256
        )
            throw new BoundaryError("EXPORT_INTEGRITY_FAILED");
    }
    return value;
}
/** Portable reconstruction, not operational restore. Never restores credentials,
 * sessions, delegations or executable authority from an export package.
 */
export function reconstructPortableExport(raw: unknown) {
    const value = verifyPortableExport(raw), ownerId = value.manifest.ownerId;
    const tombstones = z.array(z.strictObject({ owner_id: z.string(), record_id: z.uuid(), deleted_at: z.string(), deletion_id: z.uuid() }))
        .parse(JSON.parse(value.files["deletion/tombstones.json"] ?? "[]"));
    if (tombstones.some(row => row.owner_id !== ownerId)) throw new BoundaryError("EXPORT_OWNER_MISMATCH");
    const deleted = new Set(tombstones.map(row => row.record_id));
    const records = new Map<string, z.infer<typeof StorageRecordSchema>>();
    const objects = new Map<string, { metadata: z.infer<typeof ObjectMetadataSchema>; contentBase64: string }>();
    for (const [path, content] of Object.entries(value.files)) {
        if (/^(conversation|message|attachment|memory|embedding|entity|relationship|evidence|project|setting)\//.test(path)) {
            const record = StorageRecordSchema.parse(JSON.parse(content));
            if (record.ownerId !== ownerId || deleted.has(record.id) || records.has(record.id) || path !== `${record.domain}/${record.id}.json`)
                throw new BoundaryError("EXPORT_RECORD_BINDING_INVALID");
            rejectGenericSecrets(record);
            records.set(record.id, record);
        } else if (path.startsWith("files/")) {
            const object = z.strictObject({ metadata: ObjectMetadataSchema, contentBase64: z.string() }).parse(JSON.parse(content));
            const bytes = Buffer.from(object.contentBase64, "base64");
            if (object.metadata.ownerId !== ownerId || deleted.has(object.metadata.id) || objects.has(object.metadata.id) ||
                path !== `files/${object.metadata.id}.json` || bytes.toString("base64") !== object.contentBase64 ||
                bytes.length !== object.metadata.size || storageHash(bytes) !== object.metadata.contentHash)
                throw new BoundaryError("EXPORT_OBJECT_BINDING_INVALID");
            objects.set(object.metadata.id, object);
        }
    }
    for (const record of records.values()) {
        if (record.sources.some(id => !records.has(id))) throw new BoundaryError("EXPORT_SOURCE_MISSING");
        if (record.domain === "attachment" && (!objects.has(String(record.payload.objectId)) || !records.has(String(record.payload.messageId))))
            throw new BoundaryError("EXPORT_ATTACHMENT_MISSING");
    }
    return { ownerId, records, objects, deleted };
}
export class PortableExports {
    constructor(
        private readonly records: PrivateRecords,
        private readonly objects: PrivateObjects,
        private readonly metadataCipher: RecordCipher,
    ) {}
    async create(auth: AuthorizationV3) {
        if (
            auth.capability !== "data.export" ||
            auth.assurance !== "A3" ||
            !auth.approvalId
        )
            throw new BoundaryError("EXPORT_OWNER_APPROVAL_REQUIRED");
        const tx = currentDataTransaction(),
            files: Record<string, string> = {};
        const rows = (
            await tx.query<{ id: string; domain: string }>(
                "SELECT id,domain FROM storage.record_catalog WHERE owner_id=$1 AND deleted=false ORDER BY id LIMIT 129",
                [auth.ownerId],
            )
        ).rows;
        if (rows.length > 128) throw new BoundaryError("EXPORT_SIZE_LIMIT");
        for (const row of rows)
            files[`${row.domain}/${row.id}.json`] = canonical(
                await this.records.read(auth.ownerId, row.id),
            );
        const metadataQueries = {
            "lineage/links.json": "SELECT owner_id,source_id,derived_id,source_version,on_delete FROM storage.data_lineage WHERE owner_id=$1 ORDER BY source_id,derived_id LIMIT 1001",
            "deletion/tombstones.json": "SELECT owner_id,record_id,deleted_at,deletion_id FROM storage.deletion_tombstones WHERE owner_id=$1 ORDER BY record_id LIMIT 1001",
            "attachments/links.json": "SELECT owner_id,attachment_id,object_id FROM storage.attachment_objects WHERE owner_id=$1 ORDER BY attachment_id LIMIT 1001",
        } as const;
        for (const [path, sql] of Object.entries(metadataQueries)) {
            const values = (await tx.query(sql, [auth.ownerId])).rows;
            if (values.length > 1000) throw new BoundaryError("EXPORT_SIZE_LIMIT");
            files[path] = canonical(JSON.parse(JSON.stringify(values)));
        }
        files["provenance/records.json"] = canonical(rows.map(row => {
            const record = StorageRecordSchema.parse(JSON.parse(files[`${row.domain}/${row.id}.json`]!));
            return { id: record.id, provenance: record.provenance, sources: record.sources };
        }));
        files["retention/records.json"] = canonical(rows.map(row => {
            const record = StorageRecordSchema.parse(JSON.parse(files[`${row.domain}/${row.id}.json`]!));
            return { id: record.id, retention: record.retention, external: record.external };
        }));
        const subjects = (await tx.query<{ id: string; payload: string }>("SELECT id,payload FROM identity.subjects ORDER BY id LIMIT 1001")).rows;
        if (subjects.length > 1000) throw new BoundaryError("EXPORT_SIZE_LIMIT");
        const definitions = [];
        for (const row of subjects) {
            const subject = z.object({ id: z.string(), ownerId: z.string(), kind: z.enum(["agent","service","tool","integration","human"]), role: z.enum(["restricted","guest"]), name: z.string(), scopes: z.array(z.string()), resources: z.array(z.string()), revoked: z.boolean(), createdAt: z.number().int().nonnegative() })
                .parse(this.metadataCipher.decrypt(row.payload, "identity:development:subjects:" + row.id));
            if (subject.id !== row.id) throw new BoundaryError("EXPORT_SUBJECT_BINDING_INVALID");
            if (subject.ownerId === auth.ownerId && subject.kind !== "human") {
                rejectGenericSecrets(subject);
                definitions.push(subject);
            }
        }
        files["agent-definitions/definitions.json"] = canonical(definitions);
        const objects = (
            await tx.query<{ id: string; data_class: string }>(
                "SELECT id,data_class FROM storage.objects WHERE owner_id=$1 AND deleted=false ORDER BY id LIMIT 129",
                [auth.ownerId],
            )
        ).rows;
        if (objects.length > 128) throw new BoundaryError("EXPORT_SIZE_LIMIT");
        for (const row of objects)
            files[`files/${row.id}.json`] = canonical(
                await this.objects.get(auth, row.id, row.data_class),
            );
        files["schema/storage.json"] = canonical({
            version: 1,
            format: "jarvis-portable-export",
            secrets: "separate-recovery-only",
            migrations: (await tx.query("SELECT version,checksum FROM settings.schema_migrations ORDER BY version")).rows,
        });
        files["audit-metadata/storage.json"] = canonical(
            (
                await tx.query(
                    "SELECT record FROM security.data_access_events WHERE record->>'ownerId'=$1 ORDER BY id LIMIT 1000",
                    [auth.ownerId],
                )
            ).rows,
        );
        const manifest = ExportManifestSchema.parse({
            version: 1,
            id: randomUUID(),
            ownerId: auth.ownerId,
            generatedAt: Date.now(),
            domains: [
                ...new Set(rows.map((x) => x.domain)),
                "files",
                "audit-metadata",
                "schema",
                "lineage", "deletion", "attachments", "provenance", "retention", "agent-definitions",
            ],
            encryption: "owner-plaintext-export",
            schemaVersions: { storage: 1 },
            secretsIncluded: false,
            items: Object.entries(files).map(([path, bytes]) => ({
                path,
                sha256: storageHash(bytes),
                size: Buffer.byteLength(bytes),
            })),
        });
        const result = verifyPortableExport({ manifest, files });
        reconstructPortableExport(result);
        await tx.query(
            "INSERT INTO storage.exports(id,owner_id,payload) VALUES($1,$2,$3)",
            [
                manifest.id,
                auth.ownerId,
                this.metadataCipher.encrypt(
                    manifest,
                    `storage:export:${auth.ownerId}:${manifest.id}`,
                ),
            ],
        );
        for (const item of manifest.items)
            await tx.query(
                "INSERT INTO storage.export_items(export_id,owner_id,item_id,checksum) VALUES($1,$2,$3,$4)",
                [manifest.id, auth.ownerId, item.path, item.sha256],
            );
        return result;
    }
}
