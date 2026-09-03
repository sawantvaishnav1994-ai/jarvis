import { describe, expect, it } from "vitest";
import {
    ContextBudgetSchema,
    ContextRequestSchema,
    MemoryCandidateSchema,
    MemoryConflictSchema,
    MemoryRevisionSchema,
} from "@jarvis/memory";

const timestamp = "2026-09-03T10:00:00.000Z";
const policy = {
    version: 1 as const,
    classification: "D2" as const,
    privacy: "private-cloud" as const,
    retention: { mode: "keep" as const },
    consent: {
        storeConversation: true,
        createMemory: true,
        projectKnowledge: true,
        keepAttachments: false,
        personalization: true,
        externalAI: false,
    },
};

describe("J0.5 memory and context contracts", () => {
    it("rejects inverted temporal validity", () => {
        expect(() =>
            MemoryCandidateSchema.parse({
                version: 1,
                candidateId: "11111111-1111-4111-8111-111111111111",
                ownerId: "owner:test",
                projectId: "project:jarvis",
                kind: "semantic",
                subject: "subject:owner",
                content: "fact",
                assertion: "OWNER_ASSERTED",
                confidence: 1,
                policy,
                provenance: [
                    {
                        kind: "owner-stated",
                        source: { kind: "conversation", id: "conversation:test", version: 1 },
                        capturedAt: timestamp,
                        confidence: 1,
                        verifiedAt: timestamp,
                    },
                ],
                derivedFrom: [],
                temporal: {
                    capturedAt: timestamp,
                    observedAt: timestamp,
                    validFrom: "2026-09-04T00:00:00.000Z",
                    validUntil: "2026-09-03T00:00:00.000Z",
                    verifiedAt: timestamp,
                    supersededAt: null,
                },
                semanticKey: "owner.fact",
            }),
        ).toThrow();
    });

    it("requires a valid revision content hash", () => {
        expect(() =>
            MemoryRevisionSchema.parse({
                version: 1,
                id: "33333333-3333-4333-8333-333333333333",
                memoryId: "22222222-2222-4222-8222-222222222222",
                ownerId: "owner:test",
                recordVersion: 1,
                lifecycle: "ACTIVE",
                assertion: "OWNER_ASSERTED",
                contentHash: "short",
                changedAt: timestamp,
                reason: "initial",
                supersedesRevisionId: null,
            }),
        ).toThrow();
    });

    it("requires at least two memories for a conflict", () => {
        expect(() =>
            MemoryConflictSchema.parse({
                version: 1,
                id: "44444444-4444-4444-8444-444444444444",
                ownerId: "owner:test",
                projectId: "project:jarvis",
                memoryIds: ["22222222-2222-4222-8222-222222222222"],
                semanticKey: "owner.fact",
                state: "OPEN",
                resolution: null,
                createdAt: timestamp,
                resolvedAt: null,
            }),
        ).toThrow();
    });

    it("bounds context size and traversal depth", () => {
        expect(ContextBudgetSchema.safeParse({ maxMemories: 10, maxGraphFacts: 20, maxCharacters: 20000, maxRelationshipDepth: 2, maxAgeDays: 365 }).success).toBe(true);
        expect(ContextBudgetSchema.safeParse({ maxMemories: 101, maxGraphFacts: 20, maxCharacters: 20000, maxRelationshipDepth: 6, maxAgeDays: 365 }).success).toBe(false);
    });

    it("requires a provider id only when the caller selects a provider-specific target at service-policy time", () => {
        const request = ContextRequestSchema.parse({
            version: 1,
            ownerId: "owner:test",
            projectId: "project:jarvis",
            purpose: "answer owner question",
            query: "What do I prefer?",
            processingTarget: "LOCAL_ONLY",
            providerId: null,
            budget: { maxMemories: 10, maxGraphFacts: 20, maxCharacters: 20000, maxRelationshipDepth: 2, maxAgeDays: 365 },
        });
        expect(request.processingTarget).toBe("LOCAL_ONLY");
    });
});
