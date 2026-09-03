import { describe, expect, it } from "vitest";
import {
    admissionDecisionHash,
    decideMemoryAdmission,
    type ExistingMemoryFact,
    type MemoryCandidate,
} from "@jarvis/memory";

const now = "2026-09-03T10:00:00.000Z";
const ownerId = "owner:test";
const projectId = "project:jarvis";

function candidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
    return {
        version: 1,
        candidateId: "11111111-1111-4111-8111-111111111111",
        ownerId,
        projectId,
        kind: "semantic",
        subject: "subject:owner",
        content: "The owner prefers concise engineering status reports.",
        assertion: "OWNER_ASSERTED",
        confidence: 1,
        policy: {
            version: 1,
            classification: "D2",
            privacy: "private-cloud",
            retention: { mode: "keep" },
            consent: {
                storeConversation: true,
                createMemory: true,
                projectKnowledge: true,
                keepAttachments: false,
                personalization: true,
                externalAI: false,
            },
        },
        provenance: [
            {
                kind: "owner-stated",
                source: { kind: "conversation", id: "conversation:test", version: 1 },
                capturedAt: now,
                confidence: 1,
                verifiedAt: now,
            },
        ],
        derivedFrom: [],
        temporal: {
            capturedAt: now,
            observedAt: now,
            validFrom: now,
            validUntil: null,
            verifiedAt: now,
            supersededAt: null,
        },
        semanticKey: "owner.communication.status-style",
        ...overrides,
    };
}

function existing(overrides: Partial<ExistingMemoryFact> = {}): ExistingMemoryFact {
    return {
        memoryId: "22222222-2222-4222-8222-222222222222",
        ownerId,
        projectId,
        semanticKey: "owner.communication.status-style",
        content: "The owner prefers concise engineering status reports.",
        assertion: "OWNER_ASSERTED",
        confidence: 1,
        lifecycle: "ACTIVE",
        validFrom: "2026-09-02T10:00:00.000Z",
        validUntil: null,
        ...overrides,
    };
}

describe("J0.5 deterministic memory admission", () => {
    it("accepts a new durable semantic fact", () => {
        const result = decideMemoryAdmission(candidate(), []);
        expect(result.decision).toBe("ACCEPT");
        expect(result.reasonCodes).toEqual(["NEW_SEMANTIC_FACT"]);
    });

    it("merges an idempotent semantic match", () => {
        const current = existing();
        const result = decideMemoryAdmission(candidate(), [current]);
        expect(result.decision).toBe("MERGE_WITH_EXISTING");
        expect(result.canonicalMemoryId).toBe(current.memoryId);
    });

    it("rejects NEVER_STORE and D5 memory candidates", () => {
        expect(
            decideMemoryAdmission(
                candidate({ policy: { ...candidate().policy, retention: { mode: "never-store" } } }),
                [],
            ).reasonCodes,
        ).toEqual(["NEVER_STORE"]);
        expect(
            decideMemoryAdmission(
                candidate({
                    policy: {
                        ...candidate().policy,
                        classification: "D5",
                        privacy: "local-only",
                    },
                }),
                [],
            ).reasonCodes,
        ).toEqual(["D5_REQUIRES_VAULT"]);
    });

    it("keeps session and working memory ephemeral", () => {
        const result = decideMemoryAdmission(
            candidate({ kind: "working", policy: { ...candidate().policy, retention: { mode: "session", sessionId: "session:test" } } }),
            [],
        );
        expect(result.decision).toBe("ACCEPT_EPHEMERAL");
    });

    it("does not let model inference overwrite an owner assertion", () => {
        const result = decideMemoryAdmission(
            candidate({
                assertion: "MODEL_INFERRED",
                confidence: 0.99,
                content: "The owner prefers long reports.",
                provenance: [
                    {
                        kind: "model-inferred",
                        source: { kind: "model", id: "model:test", version: 1 },
                        capturedAt: now,
                        confidence: 0.99,
                        verifiedAt: null,
                    },
                ],
            }),
            [existing()],
        );
        expect(result.decision).toBe("REJECT");
        expect(result.reasonCodes).toEqual(["LOWER_AUTHORITY_CONFLICT"]);
    });

    it("requires confirmation for conflicting owner assertions", () => {
        const result = decideMemoryAdmission(
            candidate({ content: "The owner prefers detailed status reports." }),
            [existing()],
        );
        expect(result.decision).toBe("REQUIRE_OWNER_CONFIRMATION");
        expect(result.reasonCodes).toEqual(["CONFLICTING_OWNER_ASSERTIONS"]);
    });

    it("supersedes lower-authority facts with an owner assertion", () => {
        const result = decideMemoryAdmission(candidate({ content: "Owner corrected preference." }), [
            existing({ assertion: "MODEL_INFERRED", confidence: 0.9, content: "Inferred preference." }),
        ]);
        expect(result.decision).toBe("SUPERSEDE_EXISTING");
        expect(result.reasonCodes).toContain("HIGHER_AUTHORITY_FACT");
    });

    it("produces a stable decision hash", () => {
        const input = candidate();
        const result = decideMemoryAdmission(input, []);
        expect(admissionDecisionHash(input, result)).toMatch(/^[a-f0-9]{64}$/);
        expect(admissionDecisionHash(input, result)).toBe(admissionDecisionHash(input, result));
    });
});
