import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { loadConfig, requireDevelopment } from "@jarvis/config";
import {
    FileSecretManager,
    RecordCipher,
    DeterministicPolicy,
    GovernanceEngine,
} from "@jarvis/security";
import { IdentityEngine, WebAuthnPasskeys, digest } from "@jarvis/identity";
import {
    PostgresIdentityRepository,
    PostgresAuditSink,
    DataKeys,
    PrivateRecords,
    PrivateObjects,
    LocalEncryptedObjects,
    PortableExports,
    StorageRecovery,
    StorageHealthService,
    PrivateDataGateway,
    SecretHandleExecutor,
    GovernedMigrations,
} from "@jarvis/storage";
import { identityHandler } from "./identity-http.js";
import { developmentToolGateway } from "./tool-runtime.js";
import { AuthorizedMockToolGateway } from "@jarvis/tools";
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
    const policy = new DeterministicPolicy(
        JSON.parse(
            await readFile(
                resolve(
                    dirname(
                        process.env.JARVIS_CONFIG ?? "config/development.json",
                    ),
                    "policy.development.json",
                ),
                "utf8",
            ),
        ),
    );
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
            config.storage.encryptionKeyRef,
            config.identity.bootstrapRef,
            config.identity.webTransportRef,
            "development/storage/kek/k1",
            "development/storage/kek/k2",
            "development/storage/backup/key1",
            "development/tools/synthetic-credential",
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
    const keyLease = await vault.lease(config.storage.encryptionKeyRef, actor);
    const bootstrapLease = await vault.lease(
        config.identity.bootstrapRef,
        actor,
    );
    const transportLease = await vault.lease(
        config.identity.webTransportRef,
        actor,
    );
    const storageCipher = new RecordCipher(
        Buffer.from(keyLease.value.toString("utf8"), "hex"),
    );
    const backupLease = await vault.lease(
        "development/storage/backup/key1",
        actor,
    );
    const backupCipher = new RecordCipher(
        Buffer.from(backupLease.value.toString("utf8"), "hex"),
    );
    backupLease.destroy();
    const keys = new DataKeys(vault, actor.id, storageCipher);
    const records = new PrivateRecords((ownerId) => keys.cipher(ownerId));
    const objectStore = new LocalEncryptedObjects(
        resolve(".jarvis/development/objects"),
    );
    const objects = new PrivateObjects(
        objectStore,
        (ownerId) => keys.cipher(ownerId),
        storageCipher,
    );
    // Restores never acquire a target from request parameters. Until an isolated
    // target is provisioned by the operator, API restore attempts fail closed.
    const recovery = new StorageRecovery(
        new LocalEncryptedObjects(resolve(".jarvis/development/backups")),
        objectStore,
        backupCipher,
        null,
    );
    const dataGateway = new PrivateDataGateway(
        records,
        new AuthorizedMockToolGateway(),
        {
            keys,
            objects,
            recovery,
            secretExecutor: new SecretHandleExecutor(vault, actor.id),
            migrations: new GovernedMigrations(recovery),
            exports: new PortableExports(records, objects, storageCipher),
            health: new StorageHealthService(
                keys,
                objects,
                recovery,
                resolve("infrastructure/migrations"),
            ),
        },
    );
    const identity = new IdentityEngine(
        new PostgresIdentityRepository(pool, storageCipher),
        new WebAuthnPasskeys(config.identity.rpID, config.identity.origin),
        digest(bootstrapLease.value.toString("utf8")),
        Date.now,
        new GovernanceEngine(dataGateway).handle,
    );
    const transportKey = Buffer.from(
        transportLease.value.toString("utf8"),
        "hex",
    );
    keyLease.destroy();
    bootstrapLease.destroy();
    transportLease.destroy();
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
        identityHandler(
            identity,
            transportKey,
            developmentToolGateway(policy, new PostgresAuditSink(pool)),
        ),
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
