import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type pg from "pg";
import type { SessionRecord } from "@jarvis/identity";
import { RecordCipher } from "@jarvis/security";
import { PostgresIdentityRepository } from "@jarvis/storage";

function sessionFixture(tokenHash = "a".repeat(64)): SessionRecord {
    return {
        id: randomUUID(),
        tokenHash,
        ownerId: `owner_${randomUUID()}`,
        deviceId: `device_${randomUUID()}`,
        assurance: "A2",
        createdAt: 1,
        lastActivity: 1,
        expiresAt: 10_000,
        epoch: 1,
        revoked: false,
        risk: "normal",
        contextHash: "context",
        scopes: ["identity.self"],
    };
}

type Row = { id: string; payload: string };

function fakePool(seedSessions: Row[] = []) {
    const inserts: Array<{ id: string; payload: string }> = [];
    const deletes: string[] = [];
    const client = {
        async query(sql: string, params: unknown[] = []) {
            if (sql.startsWith("SELECT id,payload FROM identity.root_owner"))
                return { rows: [], rowCount: 0 };
            if (sql === "SELECT id,payload FROM identity.sessions")
                return { rows: seedSessions, rowCount: seedSessions.length };
            if (sql.startsWith("SELECT id,payload FROM identity."))
                return { rows: [], rowCount: 0 };
            if (sql.startsWith("SELECT payload FROM security.governance_state"))
                return { rows: [], rowCount: 0 };
            if (sql.startsWith("INSERT INTO identity.sessions")) {
                inserts.push({
                    id: String(params[0]),
                    payload: String(params[1]),
                });
                return { rows: [], rowCount: 1 };
            }
            if (sql.startsWith("DELETE FROM identity.sessions")) {
                deletes.push(String(params[0]));
                return { rows: [], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        },
        release() {},
    };
    return {
        pool: { connect: async () => client } as unknown as pg.Pool,
        inserts,
        deletes,
    };
}

describe("J1.13 remote identity session storage", () => {
    it(
        "persists a new identity session under its stable session id while keeping the runtime map keyed by token hash",
        async () => {
            const cipher = new RecordCipher(randomBytes(32));
            const fake = fakePool();
            const repository = new PostgresIdentityRepository(fake.pool, cipher);
            const session = sessionFixture();

            await repository.transaction(async (state) => {
                state.sessions[session.tokenHash] = session;
            });

            expect(fake.inserts).toHaveLength(1);
            expect(fake.inserts[0]?.id).toBe(session.id);
            expect(fake.inserts[0]?.id).not.toBe(session.tokenHash);
        },
    );

    it(
        "rewrites a legacy token-hash primary key to the stable session id without changing the in-memory lookup key",
        async () => {
            const cipher = new RecordCipher(randomBytes(32));
            const session = sessionFixture("b".repeat(64));
            const legacyPayload = cipher.encrypt(
                session,
                `identity:development:sessions:${session.tokenHash}`,
            );
            const fake = fakePool([
                { id: session.tokenHash, payload: legacyPayload },
            ]);
            const repository = new PostgresIdentityRepository(fake.pool, cipher);

            const resolved = await repository.transaction(async (state) =>
                state.sessions[session.tokenHash],
            );

            expect(resolved?.id).toBe(session.id);
            expect(
                fake.inserts.some((entry) => entry.id === session.id),
            ).toBe(true);
            expect(fake.deletes).toContain(session.tokenHash);
        },
    );
});
