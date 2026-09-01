import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig, requireDevelopment } from "@jarvis/config";
import { FileSecretManager } from "@jarvis/security";
import { Redis } from "@jarvis/events";
import { databasePool, verifyMigrations } from "@jarvis/storage";
import { operationalLogger } from "@jarvis/shared";
import { healthServer } from "./health.js";
const log = operationalLogger("api");
async function main() {
    const config = await loadConfig(
        process.env.JARVIS_CONFIG ?? "config/development.json",
    );
    requireDevelopment(config);
    const actor = {
        version: 1 as const,
        id: "jarvis-api",
        kind: "service" as const,
        environment: config.environment,
    };
    const vault = new FileSecretManager(
        process.env.JARVIS_VAULT_FILE ?? ".jarvis/development/vault.json",
        process.env.JARVIS_MASTER_KEY_FILE ??
            resolve(
                homedir(),
                ".config/jarvis/typescript/development/master.key",
            ),
        config.environment,
        actor.id,
        new Set([
            config.storage.postgres.passwordRef,
            config.events.passwordRef,
        ]),
    );
    const dbLease = await vault.lease(
        config.storage.postgres.passwordRef,
        actor,
    );
    const redisLease = await vault.lease(config.events.passwordRef, actor);
    const pool = databasePool(
        config.storage.postgres,
        dbLease.value.toString("utf8"),
    );
    const redis = new Redis({
        host: config.events.host,
        port: config.events.port,
        password: redisLease.value.toString("utf8"),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 1500,
        retryStrategy: () => 500,
    });
    dbLease.destroy();
    redisLease.destroy();
    redis.on("error", () => {});
    const server = healthServer(
        "api",
        async () => {
            const [database, migrations, queue, worker] = await Promise.all([
                pool.query("SELECT 1").then(
                    () => true,
                    () => false,
                ),
                verifyMigrations(pool, resolve("infrastructure/migrations")),
                redis.ping().then(
                    (v) => v === "PONG",
                    () => false,
                ),
                redis.get("jarvis:development:worker-heartbeat").then(
                    (v) => v !== null && Date.now() - Number(v) < 15000,
                    () => false,
                ),
            ]);
            return { database, migrations, queue, worker };
        },
        config.rateLimits.requestsPerMinute,
    );
    await new Promise<void>((ok, bad) => {
        server.once("error", bad);
        server.listen(config.api.port, config.api.host, ok);
    });
    log("service.started");
    const stop = () => {
        server.close(() => {
            void pool.end().finally(() => {
                redis.disconnect();
                process.exitCode = 0;
            });
        });
        server.closeAllConnections();
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
}
main().catch(() => {
    log("configuration.invalid", { code: "API_START_FAILED" });
    process.exitCode = 1;
});
