import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ExportManifestSchema, BoundaryError } from "@jarvis/shared";
import { canonical } from "@jarvis/identity";
import { RecordCipher, type AuthorizationV3 } from "@jarvis/security";
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
