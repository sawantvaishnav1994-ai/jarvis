import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@jarvis/config";
import { ConversationHistoryService } from "@jarvis/core";
import { FileSecretManager } from "@jarvis/security";
import {
    databasePool,
    migrate,
    PostgresConversationHistoryRepository,
    PostgresConversationSessionRepository,
    type DatabasePool,
} from "@jarvis/storage";

const digestContent = (value: string) =>
    createHash("sha256").update(value, "utf8").digest("hex");
let admin: DatabasePool;
let migratorPool: DatabasePool;
let pool: DatabasePool;
const config = await loadConfig("config/development.json");
const actor = {
    version: 1 as const,
    id: "j1.5-integration",
    kind: "service" as const,
    environment: "development" as const,
};
const database = "jarvis_j15_test_" + randomBytes(8).toString("hex");
const ownerId = "j15-owner-" + randomUUID();
const otherOwnerId = "j15-owner-" + randomUUID();
const deviceId = "j15-device-" + randomUUID();
const identitySessionId = "j15-session-" + randomUUID();
const conversationId = randomUUID();
const userMessageId = randomUUID();
const assistantMessageId = randomUUID();

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
        if (!/^jarvis_j15_test_[a-f0-9]{16}$/.test(database))
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
    for (const [id, domain] of [
        [conversationId, "conversation"],
        [userMessageId, "message"],
        [assistantMessageId, "message"],
    ] as const) {
        await pool.query(
            "INSERT INTO storage.record_catalog(id,owner_id,domain,revision,data_class) VALUES($1,$2,$3,1,'D1')",
            [id, ownerId, domain],
        );
        await pool.query(
            `INSERT INTO conversations.${domain === "conversation" ? "conversations" : "messages"}(id,owner_id,payload,metadata) VALUES($1,$2,'encrypted-synthetic','{}')`,
            [id, ownerId],
        );
    }
}, 30000);

afterAll(async () => {
    await pool?.end();
    await migratorPool?.end();
    if (admin) {
        if (!/^jarvis_j15_test_[a-f0-9]{16}$/.test(database))
            throw new Error("UNSAFE_TEST_DATABASE");
        await admin.query(`DROP DATABASE ${database}`);
        await admin.end();
    }
});

describe("J1.5 PostgreSQL persistence and restart recovery", () => {
    it("persists ordered history and reconstructs it with a new repository instance", async () => {
        const repository = new PostgresConversationHistoryRepository(pool);
        const service = new ConversationHistoryService(
            repository,
            digestContent,
        );
        const conversation = await service.registerConversation({
            ownerId,
            conversationId,
            projectId: "project-j15",
            securityEpoch: 5,
        });
        const first = await service.appendMessage({
            ownerId,
            messageId: userMessageId,
            conversationId,
            role: "user",
            content: "user-content-not-stored-in-history-index",
        });
        expect(first.ordinal).toBe(1);

        const sessionRepository = new PostgresConversationSessionRepository(
            pool,
        );
        const session = await sessionRepository.createSession({
            id: randomUUID(),
            ownerId,
            actorId: ownerId,
            deviceId,
            identitySessionId,
            securityEpoch: 5,
            operatingMode: "assistant",
            state: "ACTIVE",
            version: 1,
        });
        const turn = await sessionRepository.createTurn({
            id: randomUUID(),
            ownerId,
            conversationId,
            sessionId: session.id,
            inputMessageId: userMessageId,
            state: "accepted",
            idempotencyKey: "j15-persist-key",
            correlationId: "j15-correlation",
            reasonCode: null,
            version: 1,
        });
        const second = await service.appendMessage({
            ownerId,
            messageId: assistantMessageId,
            conversationId,
            turnId: turn.id,
            role: "assistant",
            content: "assistant-content-not-stored-in-history-index",
        });
        expect(second.ordinal).toBe(2);
        const terminal = await service.persistTurnResult({
            ownerId,
            turnId: turn.id,
            responseMessageId: assistantMessageId,
            terminalState: "COMPLETED",
            inputDigest: "a".repeat(64),
            contextDigest: "b".repeat(64),
            modelDigest: "c".repeat(64),
            responseDigest: digestContent(
                "assistant-content-not-stored-in-history-index",
            ),
        });
        expect(terminal.terminalState).toBe("COMPLETED");

        const restarted = new ConversationHistoryService(
            new PostgresConversationHistoryRepository(pool),
            digestContent,
        );
        const history = await restarted.listMessages({
            ownerId,
            conversationId,
        });
        expect(history.map((row) => row.ordinal)).toEqual([1, 2]);
        expect(JSON.stringify(history)).not.toContain(
            "assistant-content-not-stored-in-history-index",
        );
        expect((await restarted.getTurnResult(ownerId, turn.id))?.turnId).toBe(
            turn.id,
        );
        expect(
            await restarted.listConversations({ ownerId: otherOwnerId }),
        ).toEqual([]);

        const archived = await restarted.archiveConversation({
            ownerId,
            conversationId,
            expectedVersion: conversation.version + 2,
        });
        expect(archived.state).toBe("ARCHIVED");
        await expect(
            restarted.appendMessage({
                ownerId,
                messageId: randomUUID(),
                conversationId,
                role: "user",
                content: "blocked",
            }),
        ).rejects.toThrow("J15_CONVERSATION_ARCHIVED");
        await expect(
            restarted.persistTurnResult({
                ownerId,
                turnId: turn.id,
                responseMessageId: assistantMessageId,
                terminalState: "FAILED",
                inputDigest: "a".repeat(64),
                contextDigest: "b".repeat(64),
                modelDigest: "c".repeat(64),
                responseDigest: terminal.responseDigest,
            }),
        ).rejects.toThrow("J15_TURN_RESULT_CONFLICT");
    });
});
