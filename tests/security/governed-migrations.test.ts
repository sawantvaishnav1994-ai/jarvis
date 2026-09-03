import { expect, it } from "vitest";
import { GovernedMigrations, StorageRecovery, destructiveMigrationHash, DestructiveMigrationRequestSchema } from "@jarvis/storage";
import type { AuthorizationV3 } from "@jarvis/security";
const definition = { version: 1, id: "reviewed.test", affectedTables: ["recovery.migration_probe"], statements: ["DELETE FROM recovery.migration_probe WHERE owner_id=$1"], verificationQuery: "SELECT true AS verified WHERE $1 IS NOT NULL" };
it("hashes all reviewed migration statements and rejects request-supplied SQL", () => {
    expect(destructiveMigrationHash(definition)).not.toBe(destructiveMigrationHash({ ...definition, statements: ["DELETE FROM recovery.migration_probe WHERE owner_id<>$1"] }));
    expect(() => DestructiveMigrationRequestSchema.parse({ version: 1, migrationId: definition.id, migrationHash: destructiveMigrationHash(definition), backupId: "00000000-0000-4000-8000-000000000000", sql: "DROP TABLE memory.records" })).toThrow();
});
it("rejects transaction control, duplicate definitions and unbacked domains", () => {
    const recovery = {} as StorageRecovery;
    expect(() => new GovernedMigrations(recovery, [definition, definition])).toThrow();
    expect(() => new GovernedMigrations(recovery, [{ ...definition, statements: ["COMMIT"] }])).toThrow();
    expect(() => new GovernedMigrations(recovery, [{ ...definition, affectedTables: ["unreviewed.private"] }])).toThrow();
});
it("cannot execute a destructive migration outside the authenticated storage transaction", async () => {
    await expect(new GovernedMigrations({} as StorageRecovery, [definition]).execute({} as AuthorizationV3, {})).rejects.toThrow("AUTHENTICATED_TRANSACTION_REQUIRED");
});
