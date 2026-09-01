import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { runtime, readSecret, run, fail } from "./runtime.mjs";
const { config, actor, secrets } = await runtime("jarvis-failure-drill", [
    "development/database/migrator",
    "development/redis/runtime",
]);
const env = {
    ...process.env,
    JARVIS_POSTGRES_PASSWORD: await readSecret(
        secrets,
        actor,
        config.storage.postgres.migratorPasswordRef,
    ),
    JARVIS_REDIS_PASSWORD: await readSecret(
        secrets,
        actor,
        config.events.passwordRef,
    ),
};
async function compose(args) {
    await run(
        "docker",
        ["compose", "-f", "infrastructure/docker/compose.dev.yml", ...args],
        { env },
    );
}
async function waitFor(status) {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
        try {
            const r = await fetch("http://127.0.0.1:4000/health/ready", {
                signal: AbortSignal.timeout(7000),
            });
            if (r.status === status) return;
        } catch {
            /* retry */
        }
        await delay(1000);
    }
    throw new Error("Readiness transition failed");
}
try {
    for (const service of ["redis", "postgres"]) {
        await compose(["stop", service]);
        try {
            await waitFor(503);
            assert.equal(
                (await fetch("http://127.0.0.1:4000/health/live")).status,
                200,
            );
        } finally {
            await compose(["up", "-d", "--wait", service]);
        }
        await waitFor(200);
    }
    console.log(
        "DEPENDENCY_FAILURE_DRILL_PASSED — outage and recovery for PostgreSQL and Redis",
    );
} catch {
    fail("FAILURE_DRILL_FAILED");
}
