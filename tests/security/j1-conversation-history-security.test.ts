import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    ConversationHistoryService,
    type ConversationHistoryRepository,
    type ConversationTurnResult,
} from "@jarvis/core";

type RegisterInput = Parameters<ConversationHistoryRepository["registerConversation"]>[0];
type AppendInput = Parameters<ConversationHistoryRepository["appendMessage"]>[0];
type PersistInput = Parameters<ConversationHistoryRepository["persistTurnResult"]>[0];
const digestContent = (value: string) =>
    createHash("sha256").update(value, "utf8").digest("hex");

class SpyRepository implements ConversationHistoryRepository {
    calls: unknown[] = [];
    registerConversation = async (input: RegisterInput) => ({
        ...input,
        state: "ACTIVE" as const,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        archivedAt: null,
        version: 1,
    });
    archiveConversation: ConversationHistoryRepository["archiveConversation"] = async () => {
        throw new Error("unused");
    };
    appendMessage = async (input: AppendInput) => {
        this.calls.push(input);
        return {
            ...input,
            ordinal: 1,
            createdAt: new Date(0).toISOString(),
        };
    };
    listConversations: ConversationHistoryRepository["listConversations"] = async () => [];
    listMessages: ConversationHistoryRepository["listMessages"] = async () => [];
    persistTurnResult = async (input: PersistInput): Promise<ConversationTurnResult> => {
        this.calls.push(input);
        return { ...input, completedAt: new Date(0).toISOString() };
    };
    getTurnResult: ConversationHistoryRepository["getTurnResult"] = async () => null;
}

const ownerId = "owner-j15-security";
const conversationId = "11111111-1111-4111-8111-111111111111";
const turnId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";

describe("J1.5 conversation history security boundaries", () => {
    it("rejects malformed protected digests before repository persistence", async () => {
        const repo = new SpyRepository();
        const service = new ConversationHistoryService(repo, digestContent);
        await expect(
            service.persistTurnResult({
                ownerId,
                turnId,
                terminalState: "COMPLETED",
                inputDigest: "not-a-digest",
            }),
        ).rejects.toThrow("J15_HISTORY_INPUT_INVALID");
        expect(repo.calls).toHaveLength(0);
    });

    it("rejects cross-owner J1.4 pipeline binding before persistence", async () => {
        const repo = new SpyRepository();
        const service = new ConversationHistoryService(repo, digestContent);
        await expect(
            service.persistPipelineResult({
                ownerId,
                pipelineInput: {
                    authority: { ownerId: "different-owner" },
                    conversationId,
                    turnId,
                    inputDigest: "a".repeat(64),
                    contextDigest: "b".repeat(64),
                    modelOperationDigest: "c".repeat(64),
                } as unknown as import("@jarvis/core").J14TurnPipelineInput,
                pipelineResult: {
                    conversationId,
                    turnId,
                    state: "COMPLETED",
                    response: "content",
                } as unknown as import("@jarvis/core").J14TurnPipelineResult,
            }),
        ).rejects.toThrow("J15_PIPELINE_BINDING_INVALID");
        expect(repo.calls).toHaveLength(0);
    });

    it("never forwards message or response plaintext to history metadata", async () => {
        const repo = new SpyRepository();
        const service = new ConversationHistoryService(repo, digestContent);
        const messageMarker = "j15-sensitive-message-marker";
        const responseMarker = "j15-sensitive-response-marker";
        await service.appendMessage({
            ownerId,
            conversationId,
            messageId,
            role: "user",
            content: messageMarker,
        });
        await service.persistPipelineResult({
            ownerId,
            pipelineInput: {
                authority: { ownerId },
                conversationId,
                turnId,
                inputDigest: "a".repeat(64),
                contextDigest: "b".repeat(64),
                modelOperationDigest: "c".repeat(64),
            } as unknown as import("@jarvis/core").J14TurnPipelineInput,
            pipelineResult: {
                conversationId,
                turnId,
                state: "COMPLETED",
                response: responseMarker,
            } as unknown as import("@jarvis/core").J14TurnPipelineResult,
        });
        const persisted = JSON.stringify(repo.calls);
        expect(persisted).not.toContain(messageMarker);
        expect(persisted).not.toContain(responseMarker);
    });
});
