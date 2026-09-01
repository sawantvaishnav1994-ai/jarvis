import { homedir } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig, requireDevelopment } from "@jarvis/config";
import { FileSecretManager, RecordCipher } from "@jarvis/security";
import { Redis, Worker, FoundationJobSchema, queueName } from "@jarvis/events";
import {
    databasePool,
    verifyMigrations,
    PostgresEventPublisher,
} from "@jarvis/storage";
import { operationalLogger } from "@jarvis/shared";
import { createServer } from "node:http";
const log = operationalLogger("worker");
async function main() {
    const config = await loadConfig(
        process.env.JARVIS_CONFIG ?? "config/development.json",
    );
    requireDevelopment(config);
    const actor = {
        version: 1 as const,
        id: "jarvis-worker",
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
            config.storage.encryptionKeyRef,
        ]),
    );
    const dbLease = await vault.lease(
        config.storage.postgres.passwordRef,
        actor,
    );
    const redisLease = await vault.lease(config.events.passwordRef, actor);
    const keyLease = await vault.lease(config.storage.encryptionKeyRef, actor);
    const pool = databasePool(
        config.storage.postgres,
        dbLease.value.toString("utf8"),
    );
    const connection = {
        host: config.events.host,
        port: config.events.port,
        password: redisLease.value.toString("utf8"),
        maxRetriesPerRequest: null,
    };
    const redis = new Redis({
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 1500,
    });
    const events = new PostgresEventPublisher(
        pool,
        new RecordCipher(Buffer.from(keyLease.value.toString("utf8"), "hex")),
    );
    dbLease.destroy();
    redisLease.destroy();
    keyLease.destroy();
    redis.on("error", () => {});
    const worker = new Worker(
        queueName(config.environment),
        async (job) => {
            const input = FoundationJobSchema.parse(job.data);
            if (job.name !== "foundation.ping")
                throw new Error("JOB_TYPE_DENIED");
            await pool.query("SELECT 1");
            await events.publish({
                version: 1,
                id: randomUUID(),
                type: "foundation.ping.completed",
                source: "jarvis.worker",
                timestamp: new Date().toISOString(),
                actor,
                environment: config.environment,
                data: {},
                sensitivity: "local-only",
                correlationId: input.correlationId,
            });
            log("job.completed");
            return { ok: true, correlationId: input.correlationId };
        },
        { connection, concurrency: config.worker.concurrency },
    );
    worker.on("error", () =>
        log("dependency.unavailable", { code: "QUEUE_UNAVAILABLE" }),
    );
    worker.on("failed", () => log("job.failed", { code: "JOB_REJECTED" }));
    const heartbeat = async () => {
        try {
            if (
                await verifyMigrations(
                    pool,
                    resolve("infrastructure/migrations"),
                )
            )
                await redis.set(
                    "jarvis:development:worker-heartbeat",
                    String(Date.now()),
                    "EX",
                    15,
                );
        } catch {
            /* readiness exposes outage */
        }
    };
    await heartbeat();
    const timer = setInterval(() => {
        void heartbeat();
    }, 3000);
    const server = createServer(async (req, res) => {
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        if (
            req.method !== "GET" ||
            !["/health/live", "/health/ready"].includes(req.url ?? "")
        ) {
            res.writeHead(404);
            res.end('{"error":"NOT_FOUND"}');
            return;
        }
        const checks =
            req.url === "/health/live"
                ? { process: true }
                : {
                      database: await verifyMigrations(
                          pool,
                          resolve("infrastructure/migrations"),
                      ),
                      queue: await redis.ping().then(
                          (v) => v === "PONG",
                          () => false,
                      ),
                  };
        const status = Object.values(checks).every(Boolean)
            ? "ok"
            : "unavailable";
        res.writeHead(status === "ok" ? 200 : 503);
        res.end(
            JSON.stringify({
                service: "worker",
                status,
                version: "0.3.0",
                environment: config.environment,
                checks,
            }),
        );
    });
    server.headersTimeout = 5000;
    server.requestTimeout = 5000;
    await new Promise<void>((ok, bad) => {
        server.once("error", bad);
        server.listen(config.worker.port, config.worker.host, ok);
    });
    log("service.started");
    const stop = async () => {
        clearInterval(timer);
        server.close();
        server.closeAllConnections();
        await worker.close();
        await redis.del("jarvis:development:worker-heartbeat").catch(() => {});
        redis.disconnect();
        await pool.end();
    };
    process.once("SIGTERM", () => {
        void stop();
    });
    process.once("SIGINT", () => {
        void stop();
    });
}
main().catch(() => {
    log("configuration.invalid", { code: "WORKER_START_FAILED" });
    process.exitCode = 1;
});
