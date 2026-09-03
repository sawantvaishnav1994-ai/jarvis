import { z } from "zod";
import { randomUUID } from "node:crypto";
import { BoundaryError } from "@jarvis/shared";
import { canonical } from "@jarvis/identity";
import type { AuthorizationV3 } from "@jarvis/security";
import { currentDataTransaction } from "./transaction.js";
import { StorageRecovery, recoveryTables } from "./recovery.js";
import { storageHash } from "./objects.js";

export const DestructiveMigrationDefinitionSchema = z.strictObject({
    version: z.literal(1), id: z.string().regex(/^[a-z0-9.-]{1,100}$/),
    affectedTables: z.array(z.enum(recoveryTables)).min(1).max(20),
    statements: z.array(z.string().min(1).max(4000)).min(1).max(20),
    verificationQuery: z.string().min(1).max(4000),
});
export const DestructiveMigrationRequestSchema = z.strictObject({
    version: z.literal(1), backupId: z.uuid(),
    migrationId: z.string().regex(/^[a-z0-9.-]{1,100}$/),
    migrationHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export function destructiveMigrationHash(raw: unknown) {
    return storageHash(canonical(DestructiveMigrationDefinitionSchema.parse(raw)));
}
/** Repository-reviewed definitions only. Never populate this registry from a
 * request, export, model response or workflow payload. Default is empty/denied.
 * SQL executes with the existing restricted role, never an elevated connection.
 */
export class GovernedMigrations {
    private readonly definitions = new Map<string, z.infer<typeof DestructiveMigrationDefinitionSchema>>();
    constructor(private readonly recovery: StorageRecovery, definitions: readonly unknown[] = [], private readonly clock: () => number = Date.now) {
        for (const raw of definitions) {
            const d = DestructiveMigrationDefinitionSchema.parse(raw);
            if (this.definitions.has(d.id) || new Set(d.affectedTables).size !== d.affectedTables.length ||
                [...d.statements, d.verificationQuery].some(sql => /;|\b(?:COMMIT|ROLLBACK|BEGIN|GRANT|REVOKE|COPY|DO|CALL)\b/i.test(sql)) ||
                !/^SELECT\b/i.test(d.verificationQuery)) throw new BoundaryError("MIGRATION_DEFINITION_INVALID");
            this.definitions.set(d.id, structuredClone(d));
        }
    }
    async execute(auth: AuthorizationV3, raw: unknown) {
        const tx = currentDataTransaction(), request = DestructiveMigrationRequestSchema.parse(raw);
        if (auth.capability !== "storage.migration.execute" || auth.toolId !== "data.migration.execute" ||
            auth.permission !== "P4" || auth.zone !== "Z4" || auth.assurance !== "A3" || !auth.approvalId ||
            auth.status !== "consumed" || auth.uses !== 1 || auth.expiresAt <= this.clock() || auth.environment !== "development")
            throw new BoundaryError("MIGRATION_APPROVAL_REQUIRED");
        const definition = this.definitions.get(request.migrationId);
        if (!definition || request.migrationHash !== destructiveMigrationHash(definition))
            throw new BoundaryError("MIGRATION_DEFINITION_MISMATCH");
        const { manifest, snapshot } = await this.recovery.validate(auth.ownerId, request.backupId);
        const schema = (await tx.query("SELECT version,checksum FROM settings.schema_migrations ORDER BY version")).rows;
        if (manifest.createdAt > this.clock() || this.clock() - manifest.createdAt > 300000 ||
            snapshot.schemaHash !== storageHash(canonical(schema)))
            throw new BoundaryError("CURRENT_RECOVERY_EVIDENCE_REQUIRED");
        for (const table of definition.affectedTables) {
            await tx.query(`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE`);
            const current = (await tx.query(`SELECT to_jsonb(t) AS row FROM ${table} t LIMIT 2001`)).rows.map(row => row.row);
            const saved = snapshot.tables[table];
            if (current.length > 2000 || !saved || canonical(current.map(canonical).sort()) !== canonical(saved.map(canonical).sort()))
                throw new BoundaryError("CURRENT_RECOVERY_EVIDENCE_REQUIRED");
        }
        for (const sql of definition.statements) await tx.query(sql, [auth.ownerId]);
        const verification = await tx.query(definition.verificationQuery, [auth.ownerId]);
        if (verification.rowCount !== 1 || verification.rows[0].verified !== true)
            throw new BoundaryError("MIGRATION_VERIFICATION_FAILED");
        if ((await tx.query("SELECT 1")).rowCount !== 1 ||
            (await tx.query("SELECT vector_dims('[1,0,0]'::vector) AS dimensions")).rows[0]?.dimensions !== 3)
            throw new BoundaryError("MIGRATION_HEALTH_FAILED");
        const evidence = { version: 1, operation: "data.migration.verified", ownerId: auth.ownerId, actorId: auth.actorId,
            authorizationId: auth.id, policyVersions: auth.policyVersions, backupId: manifest.id,
            backupValidatedAt: manifest.validatedAt, migrationId: definition.id, migrationHash: request.migrationHash,
            affectedTables: definition.affectedTables, schemaHash: snapshot.schemaHash, timestamp: this.clock(), verified: true };
        await tx.query("INSERT INTO security.data_access_events(id,record) VALUES($1,$2)", [randomUUID(), JSON.stringify(evidence)]);
        return evidence;
    }
}
