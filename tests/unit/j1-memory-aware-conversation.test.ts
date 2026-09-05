import { describe, expect, it, vi } from "vitest";
import {
    ContextAssembler,
    MemoryAwareConversationError,
    MemoryAwareConversationService,
    type ContextAssemblyAuthority,
    type ContextAssemblyPolicy,
    type ContextCandidateSource,
    type ConversationMemoryAdmissionPort,
    type ConversationMemoryRetrievalPort,
} from "@jarvis/core";

const authority: ContextAssemblyAuthority = {
    ownerId: "owner:test",
    conversationId: "conversation:test",
    sessionId: "session:test",
    turnId: "turn:test",
    securityEpoch: 7,
    operatingMode: "assistant",
    projectId: "project:test",
};

const policy: ContextAssemblyPolicy = {
    disclosureTarget: "private",
    classificationCeiling: "D3",
    maximumSize: 1000,
    minimumFreshness: 1,
    allowUntrusted: false,
    now: 100,
};

const base: ContextCandidateSource = {
    sourceType: "conversation-history",
    sourceId: "message:test",
    ownerId: authority.ownerId,
    projectId: authority.projectId,
    provenance: "j1.5",
    classification: "D2",
    freshness: 10,
    retention: "keep",
    disclosureEligibility: true,
    digest: "a".repeat(64),
    trust: "trusted",
    priority: 100,
    size: 4,
    payload: "base",
};

function ports(overrides: Partial<{
    retrieval: ConversationMemoryRetrievalPort;
    admission: ConversationMemoryAdmissionPort;
}> = {}) {
    const retrieval: ConversationMemoryRetrievalPort = overrides.retrieval ?? {
        retrieve: vi.fn(async () => ({
            ownerId: authority.ownerId,
            projectId: authority.projectId ?? null,
            turnId: authority.turnId,
            securityEpoch: authority.securityEpoch,
            degraded: false,
            degradationReasons: [],
            items: [
                {
                    memoryId: "11111111-1111-4111-8111-111111111111",
                    ownerId: authority.ownerId,
                    projectId: authority.projectId ?? null,
                    provenance: "j0.5:owner-asserted",
                    classification: "D2",
                    freshness: 20,
                    retention: "keep",
                    disclosureEligibility: true,
                    digest: "b".repeat(64),
                    trust: "trusted",
                    priority: 90,
                    payload: "remembered preference",
                },
            ],
        })),
    };
    const admission: ConversationMemoryAdmissionPort = overrides.admission ?? {
        submit: vi.fn(async () => ({
            decision: "ACCEPT",
            canonicalMemoryId: "22222222-2222-4222-8222-222222222222",
            reasonCodes: ["NEW_SEMANTIC_FACT"],
        })),
    };
    return { retrieval, admission };
}

function service(overrides: Parameters<typeof ports>[0] = {}) {
    const { retrieval, admission } = ports(overrides);
    const assembler = new ContextAssembler({ verify: async () => true });
    return {
        runtime: new MemoryAwareConversationService(assembler, retrieval, admission),
        retrieval,
        admission,
    };
}

describe("J1.6 memory-aware conversation", () => {
    it("retrieves J0 memory and passes it through J1.2 context assembly", async () => {
        const { runtime, retrieval } = service();
        const result = await runtime.assembleContext(authority, [base], policy, "status style");

        expect(retrieval.retrieve).toHaveBeenCalledWith({
            ownerId: authority.ownerId,
            projectId: authority.projectId,
            conversationId: authority.conversationId,
            sessionId: authority.sessionId,
            turnId: authority.turnId,
            securityEpoch: authority.securityEpoch,
            query: "status style",
            limit: 20,
        });
        expect(result.context.sources.map((source) => source.sourceType)).toEqual([
            "conversation-history",
            "memory",
        ]);
        expect(result.memoryDegraded).toBe(false);
    });

    it("rejects memory packages bound to a different authority", async () => {
        const badRetrieval: ConversationMemoryRetrievalPort = {
            retrieve: async () => ({
                ownerId: "owner:other",
                projectId: authority.projectId ?? null,
                turnId: authority.turnId,
                securityEpoch: authority.securityEpoch,
                degraded: false,
                degradationReasons: [],
                items: [],
            }),
        };
        const { runtime } = service({ retrieval: badRetrieval });

        await expect(runtime.assembleContext(authority, [base], policy, "query")).rejects.toThrow(
            "J16_MEMORY_AUTHORITY_MISMATCH",
        );
    });

    it("lets J1.2 exclude revoked, D5, or disclosure-denied memory", async () => {
        const retrieval: ConversationMemoryRetrievalPort = {
            retrieve: async () => ({
                ownerId: authority.ownerId,
                projectId: authority.projectId ?? null,
                turnId: authority.turnId,
                securityEpoch: authority.securityEpoch,
                degraded: false,
                degradationReasons: [],
                items: [
                    {
                        memoryId: "11111111-1111-4111-8111-111111111111",
                        ownerId: authority.ownerId,
                        projectId: authority.projectId ?? null,
                        provenance: "j0.5",
                        classification: "D5",
                        freshness: 20,
                        retention: "keep",
                        disclosureEligibility: true,
                        digest: "c".repeat(64),
                        trust: "trusted",
                        priority: 90,
                        payload: "secret",
                    },
                    {
                        memoryId: "22222222-2222-4222-8222-222222222222",
                        ownerId: authority.ownerId,
                        projectId: authority.projectId ?? null,
                        provenance: "j0.5",
                        classification: "D2",
                        freshness: 20,
                        retention: "keep",
                        disclosureEligibility: true,
                        digest: "d".repeat(64),
                        trust: "trusted",
                        priority: 80,
                        payload: "revoked",
                        revoked: true,
                    },
                ],
            }),
        };
        const { runtime } = service({ retrieval });
        const result = await runtime.assembleContext(authority, [base], policy, "query");

        expect(result.context.sources).toHaveLength(1);
        expect(result.context.excluded.map((entry) => entry.reason)).toEqual([
            "D5_GENERIC_CONTEXT_DENIED",
            "DELETED_OR_REVOKED",
        ]);
    });

    it("propagates degraded retrieval without bypassing context assembly", async () => {
        const retrieval: ConversationMemoryRetrievalPort = {
            retrieve: async () => ({
                ownerId: authority.ownerId,
                projectId: authority.projectId ?? null,
                turnId: authority.turnId,
                securityEpoch: authority.securityEpoch,
                degraded: true,
                degradationReasons: ["VECTOR_UNAVAILABLE"],
                items: [],
            }),
        };
        const { runtime } = service({ retrieval });
        const result = await runtime.assembleContext(authority, [base], policy, "query");

        expect(result.memoryDegraded).toBe(true);
        expect(result.memoryDegradationReasons).toEqual(["VECTOR_UNAVAILABLE"]);
        expect(result.context.sources).toHaveLength(1);
    });

    it("submits post-response memory candidates only through the admission port", async () => {
        const { runtime, admission } = service();
        const candidate = {
            ownerId: authority.ownerId,
            projectId: authority.projectId ?? null,
            conversationId: authority.conversationId,
            turnId: authority.turnId,
            securityEpoch: authority.securityEpoch,
            content: "Owner prefers concise engineering status reports.",
            provenance: "assistant-response-candidate",
        };

        const result = await runtime.submitCandidate(authority, candidate);
        expect(admission.submit).toHaveBeenCalledWith(candidate);
        expect(result.decision).toBe("ACCEPT");
    });

    it("rejects cross-owner candidate admission before J0 memory authority", async () => {
        const { runtime, admission } = service();
        await expect(
            runtime.submitCandidate(authority, {
                ownerId: "owner:other",
                projectId: authority.projectId ?? null,
                conversationId: authority.conversationId,
                turnId: authority.turnId,
                securityEpoch: authority.securityEpoch,
                content: "bad",
                provenance: "test",
            }),
        ).rejects.toBeInstanceOf(MemoryAwareConversationError);
        expect(admission.submit).not.toHaveBeenCalled();
    });
});
