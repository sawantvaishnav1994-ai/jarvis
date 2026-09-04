import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@jarvis/config";
import { FileSecretManager } from "@jarvis/security";
import {
    databasePool,
    PostgresConversationSessionRepository,
    type DatabasePool,
} from "@jarvis/storage";

let pool: DatabasePool;
const config = await loadConfig("config/development.json");
const actor = {
    version: 1 as const,
    id: "j1.1-integration",
    kind: "service" as const,
    environment: "development" as const,
};
const deviceId = "j11-device-" + randomUUID();
const identitySessionId = "j11-session-" + randomUUID();
const conversationId = randomUUID();
let ownerId: string;
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
        new Set([config.storage.postgres.passwordRef]),
    );
    const lease = await manager.lease(
        config.storage.postgres.passwordRef,
        actor,
    );
    pool = databasePool(config.storage.postgres, lease.value.toString("utf8"));
    lease.destroy();
    ownerId = (
        await pool.query<{ id: string }>(
            "SELECT id FROM identity.root_owner LIMIT 1",
        )
    ).rows[0]!.id;
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
});
afterAll(async () => {
    if (!pool) return;
    await pool.query(
        "DELETE FROM conversations.turns WHERE owner_id=$1 AND conversation_id=$2",
        [ownerId, conversationId],
    );
    await pool.query(
        "DELETE FROM conversations.sessions WHERE owner_id=$1 AND device_id=$2",
        [ownerId, deviceId],
    );
    await pool.query("DELETE FROM conversations.conversations WHERE id=$1", [
        conversationId,
    ]);
    await pool.query("DELETE FROM storage.record_catalog WHERE id=$1", [
        conversationId,
    ]);
    await pool.query("DELETE FROM identity.sessions WHERE id=$1", [
        identitySessionId,
    ]);
    await pool.query("DELETE FROM identity.devices WHERE id=$1", [deviceId]);
    await pool.end();
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
