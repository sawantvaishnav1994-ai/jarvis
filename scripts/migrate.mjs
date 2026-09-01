import { databasePool, migrate } from "@jarvis/storage";
import { resolve } from "node:path";
import { runtime, readSecret, root, fail } from "./runtime.mjs";
let pool;
try {
    const r = await runtime("jarvis-migrator", [
        "development/database/migrator",
        "development/database/runtime",
    ]);
    const admin = await readSecret(
        r.secrets,
        r.actor,
        r.config.storage.postgres.migratorPasswordRef,
    );
    const password = await readSecret(
        r.secrets,
        r.actor,
        r.config.storage.postgres.passwordRef,
    );
    pool = databasePool(r.config.storage.postgres, admin, true);
    await migrate(
        pool,
        resolve(root, "infrastructure/migrations"),
        r.config.environment,
        r.config.storage.postgres.runtimeUser,
        password,
    );
    console.log(
        JSON.stringify({
            migrations: "current",
            environment: r.config.environment,
        }),
    );
} catch {
    fail("MIGRATION_FAILED");
} finally {
    await pool?.end();
}
