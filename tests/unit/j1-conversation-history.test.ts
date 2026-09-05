import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    ConversationHistoryService,
    type ConversationHistoryConversation,
    type ConversationHistoryCursor,
    type ConversationHistoryMessage,
    type ConversationHistoryRepository,
    type ConversationTurnResult,
} from "@jarvis/core";

const digestContent = (value: string) =>
    createHash("sha256").update(value, "utf8").digest("hex");

class MemoryHistoryRepository implements ConversationHistoryRepository {
    conversations = new Map<string, ConversationHistoryConversation>();
    messages = new Map<string, ConversationHistoryMessage>();
    results = new Map<string, ConversationTurnResult>();
    now = 0;

    private key(ownerId: string, id: string) {
        return `${ownerId}:${id}`;
    }
    async registerConversation(input: {
        ownerId: string;
        conversationId: string;
        projectId: string | null;
        securityEpoch: number;
    }) {
        const key = this.key(input.ownerId, input.conversationId);
        const existing = this.conversations.get(key);
        if (existing) return existing;
        const timestamp = new Date(++this.now * 1000).toISOString();
        const value: ConversationHistoryConversation = {
            ...input,
            state: "ACTIVE",
            createdAt: timestamp,
            updatedAt: timestamp,
            archivedAt: null,
            version: 1,
        };
        this.conversations.set(key, value);
        return value;
    }
    async archiveConversation(
        ownerId: string,
        conversationId: string,
        expectedVersion: number,
    ) {
        const key = this.key(ownerId, conversationId);
        const current = this.conversations.get(key)!;
        if (current.version !== expectedVersion) throw new Error("version");
        const timestamp = new Date(++this.now * 1000).toISOString();
        const updated = {
            ...current,
            state: "ARCHIVED" as const,
            archivedAt: timestamp,
            updatedAt: timestamp,
            version: current.version + 1,
        };
        this.conversations.set(key, updated);
        return updated;
    }
    async appendMessage(input: {
        ownerId: string;
        messageId: string;
        conversationId: string;
        turnId: string | null;
        role: "user" | "assistant" | "system" | "tool";
        contentDigest: string;
    }) {
        const rows = [...this.messages.values()].filter(
            (row) =>
                row.ownerId === input.ownerId &&
                row.conversationId === input.conversationId,
        );
        const value: ConversationHistoryMessage = {
            ...input,
            ordinal: rows.length + 1,
            createdAt: new Date(++this.now * 1000).toISOString(),
        };
        this.messages.set(this.key(input.ownerId, input.messageId), value);
        return value;
    }
    async listConversations(input: {
        ownerId: string;
        limit: number;
        cursor: ConversationHistoryCursor | null;
        includeArchived: boolean;
    }) {
        let rows = [...this.conversations.values()]
            .filter(
                (row) =>
                    row.ownerId === input.ownerId &&
                    (input.includeArchived || row.state === "ACTIVE"),
            )
            .sort((a, b) =>
                b.updatedAt.localeCompare(a.updatedAt) ||
                b.conversationId.localeCompare(a.conversationId),
            );
        if (input.cursor)
            rows = rows.filter(
                (row) =>
                    row.updatedAt < input.cursor!.updatedAt ||
                    (row.updatedAt === input.cursor!.updatedAt &&
                        row.conversationId < input.cursor!.conversationId),
            );
        return rows.slice(0, input.limit);
    }
    async listMessages(input: {
        ownerId: string;
        conversationId: string;
        afterOrdinal: number;
        limit: number;
    }) {
        return [...this.messages.values()]
            .filter(
                (row) =>
                    row.ownerId === input.ownerId &&
                    row.conversationId === input.conversationId &&
                    row.ordinal > input.afterOrdinal,
            )
            .sort((a, b) => a.ordinal - b.ordinal)
            .slice(0, input.limit);
    }
    async persistTurnResult(input: Omit<ConversationTurnResult, "completedAt">) {
        const value = {
            ...input,
            completedAt: new Date(++this.now * 1000).toISOString(),
        };
        this.results.set(this.key(input.ownerId, input.turnId), value);
        return value;
    }
    async getTurnResult(ownerId: string, turnId: string) {
        return this.results.get(this.key(ownerId, turnId)) ?? null;
    }
}

const ownerId = "owner-j15";
const conversationId = "11111111-1111-4111-8111-111111111111";
const turnId = "22222222-2222-4222-8222-222222222222";
const message1 = "33333333-3333-4333-8333-333333333333";
const message2 = "44444444-4444-4444-8444-444444444444";
const digest = "a".repeat(64);

describe("J1.5 conversation persistence and history", () => {
    it("registers, lists and archives owner-scoped conversations", async () => {
        const repo = new MemoryHistoryRepository();
        const service = new ConversationHistoryService(repo, digestContent);
        const conversation = await service.registerConversation({
            ownerId,
            conversationId,
            projectId: "project-j15",
            securityEpoch: 7,
        });
        expect((await service.listConversations({ ownerId }))[0]?.conversationId).toBe(
            conversationId,
        );
        const archived = await service.archiveConversation({
            ownerId,
            conversationId,
            expectedVersion: conversation.version,
        });
        expect(archived.state).toBe("ARCHIVED");
        expect(await service.listConversations({ ownerId })).toEqual([]);
        expect(
            await service.listConversations({ ownerId, includeArchived: true }),
        ).toHaveLength(1);
    });

    it("stores only content digests in the history index", async () => {
        const repo = new MemoryHistoryRepository();
        const service = new ConversationHistoryService(repo, digestContent);
        await service.registerConversation({ ownerId, conversationId, securityEpoch: 1 });
        const plaintext = "sensitive-history-marker";
        const row = await service.appendMessage({
            ownerId,
            conversationId,
            messageId: message1,
            role: "user",
            content: plaintext,
        });
        expect(row.contentDigest).toBe(digestContent(plaintext));
        expect(JSON.stringify(row)).not.toContain(plaintext);
    });

    it("provides deterministic ordered message pagination", async () => {
        const repo = new MemoryHistoryRepository();
        const service = new ConversationHistoryService(repo, digestContent);
        await service.registerConversation({ ownerId, conversationId, securityEpoch: 1 });
        await service.appendMessage({
            ownerId,
            conversationId,
            messageId: message1,
            role: "user",
            content: "one",
        });
        await service.appendMessage({
            ownerId,
            conversationId,
            messageId: message2,
            role: "assistant",
            content: "two",
        });
        const first = await service.listMessages({ ownerId, conversationId, limit: 1 });
        const second = await service.listMessages({
            ownerId,
            conversationId,
            afterOrdinal: first[0]!.ordinal,
            limit: 1,
        });
        expect(first[0]!.ordinal).toBe(1);
        expect(second[0]!.ordinal).toBe(2);
    });

    it("binds a terminal J1.4 result and hashes its response", async () => {
        const repo = new MemoryHistoryRepository();
        const service = new ConversationHistoryService(repo, digestContent);
        const response = "sensitive-response-marker";
        const result = await service.persistPipelineResult({
            ownerId,
            pipelineInput: {
                authority: { ownerId },
                conversationId,
                turnId,
                inputDigest: digest,
                contextDigest: "b".repeat(64),
                modelOperationDigest: "c".repeat(64),
            } as unknown as import("@jarvis/core").J14TurnPipelineInput,
            pipelineResult: {
                conversationId,
                turnId,
                state: "COMPLETED",
                response,
            } as unknown as import("@jarvis/core").J14TurnPipelineResult,
        });
        expect(result.responseDigest).toBe(digestContent(response));
        expect(JSON.stringify(result)).not.toContain(response);
    });
});
