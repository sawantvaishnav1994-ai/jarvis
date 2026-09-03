import { createHash } from "node:crypto";
import { z } from "zod";
import {
    MemoryAdmissionDecisionSchema,
    MemoryAssertionStatusSchema,
    MemoryCandidateSchema,
    MemoryLifecycleStateSchema,
    type MemoryAdmissionDecision,
    type MemoryCandidate,
} from "./j05-contracts.js";

export const ExistingMemoryFactSchema = z.strictObject({
    memoryId: z.uuid(),
    ownerId: z.string().min(1).max(256),
    projectId: z.string().min(1).max(256).nullable(),
    semanticKey: z.string().min(1).max(512).nullable(),
    content: z.string().min(1).max(50000),
    assertion: MemoryAssertionStatusSchema,
    confidence: z.number().min(0).max(1),
    lifecycle: MemoryLifecycleStateSchema,
    validFrom: z.iso.datetime().nullable(),
    validUntil: z.iso.datetime().nullable(),
});
export type ExistingMemoryFact = z.infer<typeof ExistingMemoryFactSchema>;

const authority: Record<z.infer<typeof MemoryAssertionStatusSchema>, number> = {
    OWNER_ASSERTED: 5,
    OBSERVED: 4,
    IMPORTED: 3,
    DERIVED: 2,
    MODEL_INFERRED: 1,
};

function sameScope(candidate: MemoryCandidate, existing: ExistingMemoryFact): boolean {
    return (
        candidate.ownerId === existing.ownerId &&
        candidate.projectId === existing.projectId
    );
}

function active(existing: ExistingMemoryFact): boolean {
    return existing.lifecycle === "ACTIVE" || existing.lifecycle === "DISPUTED";
}

function temporalSuccessor(candidate: MemoryCandidate, existing: ExistingMemoryFact): boolean {
    const incoming = candidate.temporal.validFrom ?? candidate.temporal.observedAt ?? candidate.temporal.capturedAt;
    const current = existing.validFrom;
    return current !== null && Date.parse(incoming) > Date.parse(current);
}

function decision(
    value: MemoryAdmissionDecision,
): MemoryAdmissionDecision {
    return MemoryAdmissionDecisionSchema.parse(value);
}

export function admissionDecisionHash(
    candidate: MemoryCandidate,
    result: MemoryAdmissionDecision,
): string {
    const material = JSON.stringify({ candidate, result });
    return createHash("sha256").update(material).digest("hex");
}

/**
 * Deterministic admission policy. This function performs no IO and grants no
 * authorization. Callers must apply J0.3 authorization and J0.4 persistence.
 */
export function decideMemoryAdmission(
    input: unknown,
    existingInput: readonly unknown[],
): MemoryAdmissionDecision {
    const candidate = MemoryCandidateSchema.parse(input);
    const existing = existingInput.map((item) => ExistingMemoryFactSchema.parse(item));

    if (candidate.policy.classification === "D5") {
        return decision({
            version: 1,
            decision: "REJECT",
            canonicalMemoryId: null,
            relatedMemoryIds: [],
            reasonCodes: ["D5_REQUIRES_VAULT"],
        });
    }
    if (!candidate.policy.consent.createMemory) {
        return decision({
            version: 1,
            decision: "REJECT",
            canonicalMemoryId: null,
            relatedMemoryIds: [],
            reasonCodes: ["MEMORY_CONSENT_REQUIRED"],
        });
    }
    if (candidate.policy.retention.mode === "never-store") {
        return decision({
            version: 1,
            decision: "REJECT",
            canonicalMemoryId: null,
            relatedMemoryIds: [],
            reasonCodes: ["NEVER_STORE"],
        });
    }
    if (candidate.policy.retention.mode === "session" || candidate.kind === "working") {
        return decision({
            version: 1,
            decision: "ACCEPT_EPHEMERAL",
            canonicalMemoryId: null,
            relatedMemoryIds: [],
            reasonCodes: ["EPHEMERAL_MEMORY"],
        });
    }

    const comparable = existing.filter(
        (item) =>
            sameScope(candidate, item) &&
            active(item) &&
            candidate.semanticKey !== null &&
            item.semanticKey === candidate.semanticKey,
    );

    const exact = comparable.find((item) => item.content === candidate.content);
    if (exact) {
        return decision({
            version: 1,
            decision: "MERGE_WITH_EXISTING",
            canonicalMemoryId: exact.memoryId,
            relatedMemoryIds: [exact.memoryId],
            reasonCodes: ["IDEMPOTENT_SEMANTIC_MATCH"],
        });
    }

    if (comparable.length === 0) {
        return decision({
            version: 1,
            decision: "ACCEPT",
            canonicalMemoryId: null,
            relatedMemoryIds: [],
            reasonCodes: [candidate.semanticKey === null ? "NEW_UNKEYED_MEMORY" : "NEW_SEMANTIC_FACT"],
        });
    }

    const strongest = comparable.reduce((best, item) => {
        const itemAuthority = authority[item.assertion];
        const bestAuthority = authority[best.assertion];
        if (itemAuthority !== bestAuthority) return itemAuthority > bestAuthority ? item : best;
        if (item.confidence !== best.confidence) return item.confidence > best.confidence ? item : best;
        return item.memoryId.localeCompare(best.memoryId) < 0 ? item : best;
    });
    const candidateAuthority = authority[candidate.assertion];
    const existingAuthority = authority[strongest.assertion];

    if (candidate.assertion === "OWNER_ASSERTED" && strongest.assertion === "OWNER_ASSERTED") {
        return decision({
            version: 1,
            decision: "REQUIRE_OWNER_CONFIRMATION",
            canonicalMemoryId: strongest.memoryId,
            relatedMemoryIds: comparable.map((item) => item.memoryId).sort(),
            reasonCodes: ["CONFLICTING_OWNER_ASSERTIONS"],
        });
    }

    if (candidateAuthority < existingAuthority) {
        return decision({
            version: 1,
            decision: "REJECT",
            canonicalMemoryId: strongest.memoryId,
            relatedMemoryIds: [strongest.memoryId],
            reasonCodes: ["LOWER_AUTHORITY_CONFLICT"],
        });
    }

    if (temporalSuccessor(candidate, strongest) || candidateAuthority > existingAuthority) {
        return decision({
            version: 1,
            decision: "SUPERSEDE_EXISTING",
            canonicalMemoryId: strongest.memoryId,
            relatedMemoryIds: comparable.map((item) => item.memoryId).sort(),
            reasonCodes: [
                temporalSuccessor(candidate, strongest)
                    ? "NEWER_TEMPORAL_FACT"
                    : "HIGHER_AUTHORITY_FACT",
            ],
        });
    }

    return decision({
        version: 1,
        decision: "MARK_CONFLICT",
        canonicalMemoryId: strongest.memoryId,
        relatedMemoryIds: comparable.map((item) => item.memoryId).sort(),
        reasonCodes: ["UNRESOLVED_SEMANTIC_CONFLICT"],
    });
}
