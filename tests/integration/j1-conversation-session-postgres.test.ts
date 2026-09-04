import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@jarvis/config";
import { FileSecretManager } from "@jarvis/security";
import {
    databasePool,
    migrate,
    PostgresConversationSessionRepository,
    type DatabasePool,
} from "@jarvis/storage";

let admin: DatabasePool;
let migratorPool: DatabasePool;
let pool: DatabasePool;
const config = await loadConfig("config/development.json");
const actor = {
    version: 1 as const,
    id: "j1.1-integration",
    kind: "service" as const,
    environment: "development" as const,
};
const database = "jarvis_j11_test_" + randomBytes(8).toString("hex");
const ownerId = "j11-owner-" + randomUUID();
const deviceId = "j11-device-" + randomUUID();
const identitySessionId = "j11-session-" + randomUUID();
const conversationId = randomUUID();

beforeAll(async () => {
    const manager = new FileSecretManager(
        process.env.JARVIS_VAULT_FILE ?? ".jarvis/development/vault.json",
        process.env.JARVIS_MASTER_KEY_FILE ??
            resolve(
                homedir(),
                ".config/jarvis/typescript/development/master.key",
            ),
        "development",
        actor.id,
        new Set([
            config.storage.postgres.passwordRef,
            config.storage.postgres.migratorPasswordRef,
        ]),
    );
    const runtime = await manager.lease(
        config.storage.postgres.passwordRef,
        actor,
    );
    const migrator = await manager.lease(
        config.storage.postgres.migratorPasswordRef,
        actor,
    );
    try {
        if (!/^jarvis_j11_test_[a-f0-9]{16}$/.test(database))
            throw new Error("UNSAFE_TEST_DATABASE");
        admin = databasePool(
            config.storage.postgres,
            migrator.value.toString("utf8"),
            true,
        );
        await admin.query(`CREATE DATABASE ${database}`);
        migratorPool = databasePool(
            { ...config.storage.postgres, database },
            migrator.value.toString("utf8"),
            true,
        );
        await migrate(
            migratorPool,
            "infrastructure/migrations",
            "development",
            config.storage.postgres.runtimeUser,
            runtime.value.toString("utf8"),
        );
        pool = databasePool(
            { ...config.storage.postgres, database },
            runtime.value.toString("utf8"),
        );
    } finally {
        runtime.destroy();
        migrator.destroy();
    }

    await pool.query(
        "INSERT INTO identity.root_owner(singleton,id,payload) VALUES(true,$1,'synthetic')",
        [ownerId],
    );
    await pool.query(
        "INSERT INTO identity.devices(id,payload) VALUES($1,'synthetic')",
        [deviceId],
    );
    await pool.query(
        "INSERT INTO identity.sessions(id,payload) VALUES($1,'synthetic')",
        [identitySessionId],
    );
    await pool.query(
        "INSERT INTO storage.record_catalog(id,owner_id,domain,revision,data_class) VALUES($1,$2,'conversation',1,'D1')",
        [conversationId, ownerId],
    );
    await pool.query(
        "INSERT INTO conversations.conversations(id,owner_id,payload,metadata) VALUES($1,$2,'synthetic','{}')",
        [conversationId, ownerId],
    );
}, 30000);

afterAll(async () => {
    await pool?.end();
    await migratorPool?.end();
    if (admin) {
        if (!/^jarvis_j11_test_[a-f0-9]{16}$/.test(database))
            throw new Error("UNSAFE_TEST_DATABASE");
        await admin.query(`DROP DATABASE ${database}`);
        await admin.end();
    }
});

describe("J1.1 PostgreSQL conversation coordination", () => {
    it("persists session binding, prevents duplicate idempotency and enforces terminal monotonicity", async () => {
        const repo = new PostgresConversationSessionRepository(pool);
        const session = await repo.createSession({
            id: randomUUID(),
            ownerId,
            actorId: ownerId,
            deviceId,
            identitySessionId,
            securityEpoch: 1,
            operatingMode: "assistant",
            state: "ACTIVE",
            version: 1,
        });
        const turn = await repo.createTurn({
            id: randomUUID(),
            ownerId,
            conversationId,
            sessionId: session.id,
            inputMessageId: null,
            state: "accepted",
            idempotencyKey: "same-key",
            correlationId: "corr-1",
            reasonCode: null,
            version: 1,
        });
        await expect(
            repo.createTurn({ ...turn, id: randomUUID() }),
        ).rejects.toThrow();
        const cancelled = await repo.transitionTurn(
            ownerId,
            turn.id,
            1,
            "cancelled",
            "OWNER_CANCELLED",
        );
        expect(cancelled.state).toBe("cancelled");
        await expect(
            repo.transitionTurn(ownerId, turn.id, 2, "streaming", null),
        ).rejects.toThrow();
    });
});
