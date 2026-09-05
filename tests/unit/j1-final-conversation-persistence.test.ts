import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
    ConversationHistoryService,
    ConversationSessionEngine,
    J112ConversationPersistenceCoordinator,
    type ConversationHistoryRepository,
    type ConversationSession,
    type ConversationSessionRepository,
    type ConversationTurn,
} from "@jarvis/core";

const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");

function fixture() {
    const ownerId = "owner-test";
    const identitySessionId = "identity-session-test";
    const conversationSessionId = randomUUID();
    const conversationId = randomUUID();
    const inputMessageId = randomUUID();
    const responseMessageId = randomUUID();
    const order: string[] = [];
    let session: ConversationSession = {
        id: conversationSessionId,
        ownerId,
        actorId: ownerId,
        deviceId: "device-test",
        identitySessionId,
        securityEpoch: 7,
        operatingMode: "assistant",
        state: "ACTIVE",
        version: 1,
    };
    let turn: ConversationTurn | null = null;
    const sessionRepo: ConversationSessionRepository = {
        createSession: async (value) => value,
        getSession: async (_ownerId, id) =>
            id === session.id ? session : null,
        updateSessionState: async (_ownerId, _id, _version, state) => {
            session = { ...session, state, version: session.version + 1 };
            return session;
        },
        createTurn: async (value) => {
            order.push("turn.create");
            turn = value;
            return value;
        },
        getTurn: async () => turn,
        transitionTurn: async (_owner, _id, _version, state, reasonCode) => {
            if (!turn) throw new Error("turn missing");
            turn = { ...turn, state, reasonCode, version: turn.version + 1 };
            return turn;
        },
    };
    const historyRepo: ConversationHistoryRepository = {
        registerConversation: vi.fn(async (input) => {
            order.push("history.conversation");
            return {
                ...input,
                state: "ACTIVE" as const,
                createdAt: new Date(0).toISOString(),
                updatedAt: new Date(0).toISOString(),
                archivedAt: null,
                version: 1,
            };
        }),
        archiveConversation: vi.fn(),
        appendMessage: vi.fn(async (input) => {
            order.push(`history.message:${input.role}`);
            return {
                ...input,
                ordinal: order.filter((value) =>
                    value.startsWith("history.message:"),
                ).length,
                createdAt: new Date(0).toISOString(),
            };
        }),
        listConversations: vi.fn(async () => []),
        listMessages: vi.fn(async () => []),
        persistTurnResult: vi.fn(async (input) => {
            order.push("history.result");
            return { ...input, completedAt: new Date(0).toISOString() };
        }),
        getTurnResult: vi.fn(async () => null),
    };
    const records = {
        persistConversation: vi.fn(async (input: { conversationId: string }) => {
            order.push("record.conversation");
            return { id: input.conversationId, stored: true };
        }),
        persistMessage: vi.fn(
            async (input: { messageId: string; role: string }) => {
                order.push(`record.message:${input.role}`);
                return { id: input.messageId, stored: true };
            },
        ),
    };
    const sessions = new ConversationSessionEngine(
        sessionRepo,
        async () => true,
        randomUUID,
    );
    const history = new ConversationHistoryService(historyRepo, digest);
    const coordinator = new J112ConversationPersistenceCoordinator(
        records,
        sessions,
        history,
    );
    const authority = {
        ownerId,
        actorId: ownerId,
        deviceId: "device-test",
        identitySessionId,
        securityEpoch: 7,
        operatingMode: "assistant" as const,
    };
    return {
        authority,
        conversationSessionId,
        conversationId,
        inputMessageId,
        responseMessageId,
        order,
        records,
        historyRepo,
        coordinator,
    };
}

describe("J1.12 governed durable conversation persistence", () => {
    it("creates governed records before J1 turn/history references and commits digests after response storage", async () => {
        const f = fixture();
        const begun = await f.coordinator.beginDurableTurn({
            authority: f.authority,
            conversationSessionId: f.conversationSessionId,
            conversationId: f.conversationId,
            inputMessageId: f.inputMessageId,
            message: "hello",
            projectId: "jarvis",
            classification: "D2",
            idempotencyKey: "j112-durable-turn",
            correlationId: "j112-correlation",
        });
        expect(f.order).toEqual([
            "record.conversation",
            "history.conversation",
            "record.message:user",
            "turn.create",
            "history.message:user",
        ]);

        await f.coordinator.commitDurableTurn({
            durableTurn: begun,
            authority: f.authority,
            responseMessageId: f.responseMessageId,
            response: "world",
            terminalState: "COMPLETED",
            inputDigest: digest("hello"),
            contextDigest: digest("context"),
            modelDigest: digest("model"),
            responseDigest: digest("world"),
            model: { provider: "synthetic-ui", model: "j1.12" },
            classification: "D2",
        });
        expect(f.order.slice(-3)).toEqual([
            "record.message:assistant",
            "history.message:assistant",
            "history.result",
        ]);
    });

    it("fails closed before turn creation when the governed writer refuses durable storage", async () => {
        const f = fixture();
        f.records.persistConversation.mockResolvedValueOnce({
            id: f.conversationId,
            stored: false,
        });
        await expect(
            f.coordinator.beginDurableTurn({
                authority: f.authority,
                conversationSessionId: f.conversationSessionId,
                conversationId: f.conversationId,
                inputMessageId: f.inputMessageId,
                message: "hello",
                projectId: null,
                classification: "D2",
                idempotencyKey: "j112-refused",
                correlationId: "j112-refused-correlation",
            }),
        ).rejects.toThrow("J112_CONVERSATION_NOT_DURABLE");
        expect(f.order).toEqual(["record.conversation"]);
    });

    it("rejects a response commit when the J1 session binding is confused with the Foundation session", async () => {
        const f = fixture();
        const begun = await f.coordinator.beginDurableTurn({
            authority: f.authority,
            conversationSessionId: f.conversationSessionId,
            conversationId: f.conversationId,
            inputMessageId: f.inputMessageId,
            message: "hello",
            projectId: null,
            classification: "D2",
            idempotencyKey: "j112-binding",
            correlationId: "j112-binding-correlation",
        });
        await expect(
            f.coordinator.commitDurableTurn({
                durableTurn: {
                    ...begun,
                    conversationSessionId: f.authority.identitySessionId,
                },
                authority: f.authority,
                responseMessageId: null,
                response: null,
                terminalState: "FAILED",
                inputDigest: digest("hello"),
                contextDigest: null,
                modelDigest: null,
                responseDigest: null,
                model: null,
                classification: "D2",
            }),
        ).rejects.toThrow("J112_PERSISTENCE_BINDING_INVALID");
    });
});
