import { describe, expect, it } from "vitest";
import {
    ConversationSessionEngine,
    assertTurnTransition,
    type ConversationSession,
    type ConversationTurn,
} from "@jarvis/core";

class Repo {
    sessions = new Map<string, ConversationSession>();
    turns = new Map<string, ConversationTurn>();
    async createSession(s: ConversationSession) {
        this.sessions.set(s.id, s);
        return s;
    }
    async getSession(ownerId: string, id: string) {
        const s = this.sessions.get(id);
        return s?.ownerId === ownerId ? s : null;
    }
    async updateSessionState(
        ownerId: string,
        id: string,
        version: number,
        state: ConversationSession["state"],
    ) {
        const s = await this.getSession(ownerId, id);
        if (!s || s.version !== version) throw new Error("conflict");
        const next = { ...s, state, version: s.version + 1 };
        this.sessions.set(id, next);
        return next;
    }
    async createTurn(t: ConversationTurn) {
        if (
            [...this.turns.values()].some(
                (x) =>
                    x.ownerId === t.ownerId &&
                    x.sessionId === t.sessionId &&
                    x.idempotencyKey === t.idempotencyKey,
            )
        )
            throw new Error("duplicate");
        this.turns.set(t.id, t);
        return t;
    }
    async getTurn(ownerId: string, id: string) {
        const t = this.turns.get(id);
        return t?.ownerId === ownerId ? t : null;
    }
    async transitionTurn(
        ownerId: string,
        id: string,
        version: number,
        state: ConversationTurn["state"],
        reasonCode: string | null,
    ) {
        const t = await this.getTurn(ownerId, id);
        if (!t || t.version !== version) throw new Error("conflict");
        assertTurnTransition(t.state, state);
        const next = { ...t, state, reasonCode, version: t.version + 1 };
        this.turns.set(id, next);
        return next;
    }
}
const authority = {
    ownerId: "owner-1",
    actorId: "owner-1",
    deviceId: "device-1",
    identitySessionId: "identity-session-1",
    securityEpoch: 7,
    operatingMode: "assistant" as const,
};
const newId = () => crypto.randomUUID();
describe("J1.1 conversation session engine", () => {
    it("binds turns to current owner/device/session/epoch authority", async () => {
        const repo = new Repo();
        const engine = new ConversationSessionEngine(
            repo,
            async (a) => a.securityEpoch === 7,
            newId,
        );
        const session = await engine.openSession(authority);
        const turn = await engine.acceptTurn({
            authority,
            sessionId: session.id,
            conversationId: crypto.randomUUID(),
            idempotencyKey: "k1",
            correlationId: "c1",
        });
        expect(turn.state).toBe("accepted");
        await expect(
            engine.transition(
                { ...authority, securityEpoch: 8 },
                turn.id,
                "assembling_context",
            ),
        ).rejects.toThrow();
    });
    it("enforces lifecycle and monotonic cancellation", async () => {
        const repo = new Repo();
        const engine = new ConversationSessionEngine(repo, async () => true, newId);
        const session = await engine.openSession(authority);
        let turn = await engine.acceptTurn({
            authority,
            sessionId: session.id,
            conversationId: crypto.randomUUID(),
            idempotencyKey: "k2",
            correlationId: "c2",
        });
        turn = await engine.transition(
            authority,
            turn.id,
            "assembling_context",
        );
        turn = await engine.cancel(authority, turn.id);
        expect(turn.state).toBe("cancelled");
        expect((await engine.cancel(authority, turn.id)).version).toBe(
            turn.version,
        );
        expect(() => assertTurnTransition("completed", "streaming")).toThrow();
    });
    it("rejects invalid authority before creating a session", async () => {
        const repo = new Repo();
        const engine = new ConversationSessionEngine(repo, async () => false, newId);
        await expect(engine.openSession(authority)).rejects.toThrow();
        expect(repo.sessions.size).toBe(0);
    });
});
