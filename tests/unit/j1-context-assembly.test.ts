import { describe, expect, it } from "vitest";
import {
    ContextAssembler,
    ContextAssemblyError,
    type ContextAssemblyAuthority,
    type ContextCandidateSource,
} from "@jarvis/core";

const authority: ContextAssemblyAuthority = {
    ownerId: "owner-1",
    conversationId: "conversation-1",
    sessionId: "session-1",
    turnId: "turn-1",
    securityEpoch: 9,
    operatingMode: "assistant",
    projectId: "project-1",
};

const source = (
    overrides: Partial<ContextCandidateSource> = {},
): ContextCandidateSource => ({
    sourceType: "conversation",
    sourceId: "source-1",
    ownerId: "owner-1",
    projectId: "project-1",
    provenance: "owner-input:v1",
    classification: "D2",
    freshness: 100,
    retention: "keep",
    retentionBoundary: null,
    disclosureEligibility: true,
    digest: "a".repeat(64),
    trust: "trusted",
    priority: 50,
    size: 10,
    payload: "allowed context",
    ...overrides,
});

const policy = {
    disclosureTarget: "private" as const,
    classificationCeiling: "D3" as const,
    maximumSize: 20,
    minimumFreshness: 50,
    allowUntrusted: false,
    now: 200,
};

describe("J1.2 context assembly", () => {
    it("selects deterministically within budget", async () => {
        const assembler = new ContextAssembler({ verify: () => true });
        const envelope = await assembler.assemble(
            authority,
            [
                source({ sourceId: "b", priority: 10, size: 10 }),
                source({ sourceId: "a", priority: 20, size: 10 }),
                source({ sourceId: "c", priority: 5, size: 10 }),
            ],
            policy,
        );
        expect(envelope.sources.map((item) => item.sourceId)).toEqual([
            "a",
            "b",
        ]);
        expect(envelope.excluded).toContainEqual({
            sourceId: "c",
            reason: "BUDGET_EXCEEDED",
        });
        expect(envelope.usedSize).toBe(20);
    });

    it("fails closed across owner classification trust and retention boundaries", async () => {
        const assembler = new ContextAssembler({ verify: () => true });
        const envelope = await assembler.assemble(
            authority,
            [
                source({ sourceId: "cross-owner", ownerId: "owner-2" }),
                source({ sourceId: "secret", classification: "D5" }),
                source({ sourceId: "untrusted", trust: "untrusted" }),
                source({
                    sourceId: "other-session",
                    retention: "session",
                    retentionBoundary: "session-2",
                }),
                source({
                    sourceId: "never-store-active",
                    retention: "never-store",
                }),
            ],
            policy,
        );
        expect(envelope.sources.map((item) => item.sourceId)).toEqual([
            "never-store-active",
        ]);
        expect(envelope.excluded.map((item) => item.reason)).toEqual([
            "OWNER_SCOPE_DENIED",
            "SESSION_BOUNDARY_DENIED",
            "D5_GENERIC_CONTEXT_DENIED",
            "UNTRUSTED_SOURCE_DENIED",
        ]);
    });

    it("rejects malformed sources before sorting or budgeting", async () => {
        const assembler = new ContextAssembler({ verify: () => true });
        const envelope = await assembler.assemble(
            authority,
            [
                source({ sourceId: "negative-size", size: -1 }),
                source({ sourceId: "valid", size: 10 }),
            ],
            policy,
        );
        expect(envelope.sources.map((item) => item.sourceId)).toEqual(["valid"]);
        expect(envelope.excluded).toContainEqual({
            sourceId: "negative-size",
            reason: "MALFORMED_SOURCE_DENIED",
        });
        expect(envelope.usedSize).toBe(10);
    });

    it("rejects stale authority before assembling", async () => {
        const assembler = new ContextAssembler({ verify: () => false });
        await expect(
            assembler.assemble(authority, [source()], policy),
        ).rejects.toEqual(
            new ContextAssemblyError("CONTEXT_AUTHORITY_INVALID"),
        );
    });
});
