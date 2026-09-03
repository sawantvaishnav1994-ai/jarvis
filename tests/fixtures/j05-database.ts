import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig, requireDevelopment } from "@jarvis/config";
import { FileSecretManager, RecordCipher } from "@jarvis/security";
import {
    databasePool,
    migrate,
    PostgresIdentityRepository,
    type DatabasePool,
} from "@jarvis/storage";
import { fixture, root } from "./identity.js";

// Like the J0.2/J0.4 suites, J0.5 owns a generated database, never the
// development installation's singleton owner. No test may repair/delete that owner.
export async function isolatedMemoryDatabase() {
    const config = await loadConfig("config/development.json");
    requireDevelopment(config);
    if (config.storage.postgres.database !== "jarvis_development")
        throw new Error("TEST_INSTALLATION_DATABASE_REQUIRED");
    const database = "jarvis_memory_test_" + randomBytes(8).toString("hex");
    if (!/^jarvis_memory_test_[a-f0-9]{16}$/.test(database))
        throw new Error("UNSAFE_TEST_DATABASE");
    const actor = {
        version: 1 as const,
        id: "jarvis-memory-test",
        kind: "service" as const,
        environment: "development" as const,
    };
    const vault = new FileSecretManager(
        process.env.JARVIS_VAULT_FILE ?? ".jarvis/development/vault.json",
        process.env.JARVIS_MASTER_KEY_FILE ??
            resolve(homedir(), ".config/jarvis/typescript/development/master.key"),
        "development",
        actor.id,
        new Set([config.storage.postgres.passwordRef, config.storage.postgres.migratorPasswordRef]),
    );
    const runtime = await vault.lease(config.storage.postgres.passwordRef, actor);
    let admin: DatabasePool | undefined, testAdmin: DatabasePool | undefined,
        pool: DatabasePool | undefined, created = false, before: string | undefined;
    const key = randomBytes(32), cipher = new RecordCipher(key);
    const installationFingerprint = async () => {
        const rows = await admin!.query("SELECT id,payload FROM identity.root_owner ORDER BY id");
        return createHash("sha256").update(JSON.stringify(rows.rows)).digest("hex");
    };
    const close = async () => {
        try {
            await pool?.end();
            await testAdmin?.end();
            if (created) {
                await admin!.query(`DROP DATABASE ${database}`);
                created = false;
            }
            if (before !== undefined && before !== await installationFingerprint())
                throw new Error("TEST_CHANGED_INSTALLATION_IDENTITY");
        } finally {
            await admin?.end();
            key.fill(0);
        }
    };
    try {
        const migrator = await vault.lease(config.storage.postgres.migratorPasswordRef, actor);
        try {
            admin = databasePool(config.storage.postgres, migrator.value.toString(), true);
            before = await installationFingerprint();
            await admin.query(`CREATE DATABASE ${database}`);
            created = true;
            const isolated = { ...config.storage.postgres, database };
            testAdmin = databasePool(isolated, migrator.value.toString(), true);
            await migrate(testAdmin, "infrastructure/migrations", "development",
                config.storage.postgres.runtimeUser, runtime.value.toString());
            pool = databasePool(isolated, runtime.value.toString());
        } finally {
            migrator.destroy();
        }
        const repository = new PostgresIdentityRepository(pool, cipher);
        const identity = fixture(repository);
        const owner = await root(identity);
        return { database, pool, repository, identity, ownerId: owner.session.ownerId, close };
    } catch (error) {
        await close();
        throw error;
    } finally {
        runtime.destroy();
    }
}
