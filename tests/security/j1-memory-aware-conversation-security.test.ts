import { describe, expect, it, vi } from "vitest";
import {
    ContextAssembler,
    MemoryAwareConversationService,
    type ContextAssemblyAuthority,
    type ConversationMemoryAdmissionPort,
    type ConversationMemoryRetrievalPort,
} from "@jarvis/core";

const authority: ContextAssemblyAuthority = {
    ownerId: "owner:test",
    conversationId: "conversation:test",
    sessionId: "session:test",
    turnId: "turn:test",
    securityEpoch: 9,
    operatingMode: "assistant",
    projectId: "project:test",
};

function runtime() {
    const retrieval: ConversationMemoryRetrievalPort = {
        retrieve: vi.fn(async () => ({
            ownerId: authority.ownerId,
            projectId: authority.projectId ?? null,
            turnId: authority.turnId,
            securityEpoch: authority.securityEpoch,
            degraded: false,
            degradationReasons: [],
            items: [],
        })),
    };
    const admission: ConversationMemoryAdmissionPort = {
        submit: vi.fn(async () => ({
            decision: "REJECT",
            canonicalMemoryId: null,
            reasonCodes: ["TEST"],
        })),
    };
    return {
        service: new MemoryAwareConversationService(
            new ContextAssembler({ verify: async () => true }),
            retrieval,
            admission,
        ),
        admission,
    };
}

describe("J1.6 memory-aware conversation security boundaries", () => {
    it("rejects cross-owner candidate admission before J0", async () => {
        const { service, admission } = runtime();
        await expect(
            service.submitCandidate(authority, {
                ownerId: "owner:other",
                projectId: authority.projectId ?? null,
                conversationId: authority.conversationId,
                turnId: authority.turnId,
                securityEpoch: authority.securityEpoch,
                content: "candidate",
                provenance: "test",
            }),
        ).rejects.toThrow("J16_MEMORY_CANDIDATE_AUTHORITY_MISMATCH");
        expect(admission.submit).not.toHaveBeenCalled();
    });

    it("rejects cross-project candidate admission before J0", async () => {
        const { service, admission } = runtime();
        await expect(
            service.submitCandidate(authority, {
                ownerId: authority.ownerId,
                projectId: "project:other",
                conversationId: authority.conversationId,
                turnId: authority.turnId,
                securityEpoch: authority.securityEpoch,
                content: "candidate",
                provenance: "test",
            }),
        ).rejects.toThrow("J16_MEMORY_CANDIDATE_AUTHORITY_MISMATCH");
        expect(admission.submit).not.toHaveBeenCalled();
    });

    it("rejects stale security-epoch candidate admission before J0", async () => {
        const { service, admission } = runtime();
        await expect(
            service.submitCandidate(authority, {
                ownerId: authority.ownerId,
                projectId: authority.projectId ?? null,
                conversationId: authority.conversationId,
                turnId: authority.turnId,
                securityEpoch: authority.securityEpoch - 1,
                content: "candidate",
                provenance: "test",
            }),
        ).rejects.toThrow("J16_MEMORY_CANDIDATE_AUTHORITY_MISMATCH");
        expect(admission.submit).not.toHaveBeenCalled();
    });

    it("rejects missing provenance before J0", async () => {
        const { service, admission } = runtime();
        await expect(
            service.submitCandidate(authority, {
                ownerId: authority.ownerId,
                projectId: authority.projectId ?? null,
                conversationId: authority.conversationId,
                turnId: authority.turnId,
                securityEpoch: authority.securityEpoch,
                content: "candidate",
                provenance: "   ",
            }),
        ).rejects.toThrow("J16_MEMORY_CANDIDATE_AUTHORITY_MISMATCH");
        expect(admission.submit).not.toHaveBeenCalled();
    });
});
