import { randomUUID } from "node:crypto";
import { StorageHealthSchema } from "@jarvis/shared";
import { DataKeys } from "./data-keys.js";
import { PrivateObjects } from "./private-objects.js";
import { StorageRecovery } from "./recovery.js";
import { currentDataTransaction } from "./transaction.js";
import { migrationFiles } from "./migrations.js";

/** Owner-authorized diagnostic. No private payload or key material is returned. */
export class StorageHealthService {
    constructor(
        private readonly keys: DataKeys,
        private readonly objects: PrivateObjects,
        private readonly recovery: StorageRecovery,
        private readonly migrationsDirectory: string,
    ) {}
    async inspect(ownerId: string) {
        const tx = currentDataTransaction();
        const probe = async (check: () => Promise<boolean>) => {
            await tx.query("SAVEPOINT storage_health_probe");
            try {
                const result = await check();
                await tx.query("RELEASE SAVEPOINT storage_health_probe");
                return result;
            } catch {
                await tx.query("ROLLBACK TO SAVEPOINT storage_health_probe");
                await tx.query("RELEASE SAVEPOINT storage_health_probe");
                return false;
            }
        };
        const postgres = await probe(
            async () => (await tx.query("SELECT 1")).rowCount === 1,
        );
        const migrations = await probe(async () => {
            const expected = await migrationFiles(this.migrationsDirectory);
            const current = (
                await tx.query(
                    "SELECT version,checksum FROM settings.schema_migrations ORDER BY version",
                )
            ).rows;
            return (
                current.length === expected.length &&
                current.every(
                    (r, i) =>
                        r.version === expected[i]?.version &&
                        r.checksum === expected[i]?.sha256,
                )
            );
        });
        const pgvector = await probe(
            async () =>
                (
                    await tx.query(
                        "SELECT vector_dims('[1,0,0]'::vector) AS dimensions",
                    )
                ).rows[0]?.dimensions === 3,
        );
        let availableBytes: number | null = null;
        const objects = await probe(async () => {
            await this.objects.store.list(ownerId);
            availableBytes = await this.objects.store.availableBytes();
            return true;
        });
        const keys = await probe(
            async () =>
                (await this.keys.metadata(ownerId)).filter(
                    (k) => k.state === "ACTIVE",
                ).length === 1,
        );
        const vault = await probe(async () => {
            const cipher = await this.keys.cipher(ownerId);
            const binding = {
                version: 1 as const,
                ownerId,
                environment: "development" as const,
                domain: "settings" as const,
                recordId: randomUUID(),
                recordVersion: 1,
                policy: {
                    version: 1 as const,
                    classification: "D0" as const,
                    privacy: "local-only" as const,
                    retention: { mode: "keep" as const },
                    consent: {
                        storeConversation: false,
                        createMemory: false,
                        projectKnowledge: false,
                        keepAttachments: false,
                        personalization: false,
                        externalAI: false,
                    },
                },
            };
            const encrypted = await cipher.encrypt({ probe: true }, binding);
            return (
                JSON.stringify(await cipher.decrypt(encrypted, binding)) ===
                '{"probe":true}'
            );
        });
        let backupFresh = false,
            backupIntegrity: "valid" | "invalid" | "none" = "none";
        const backupOk = await probe(async () => {
            const rows = (
                await tx.query<{ id: string }>(
                    "SELECT id FROM storage.backups WHERE owner_id=$1 LIMIT 101",
                    [ownerId],
                )
            ).rows;
            if (rows.length > 100) return false;
            for (const row of rows) {
                const { manifest } = await this.recovery.validate(
                    ownerId,
                    row.id,
                );
                backupFresh ||= Date.now() - manifest.createdAt < 86400000;
            }
            backupIntegrity = rows.length ? "valid" : "none";
            return true;
        });
        if (!backupOk) backupIntegrity = "invalid";
        return StorageHealthSchema.parse({
            version: 1,
            checkedAt: Date.now(),
            status:
                !postgres || !migrations || !keys || !vault
                    ? "unavailable"
                    : !objects || !pgvector || !backupFresh || !backupOk
                      ? "degraded"
                      : "healthy",
            postgres,
            migrations,
            pgvector,
            objects,
            vault,
            keys,
            backupFresh,
            backupIntegrity,
            availableBytes,
        });
    }
}
