import {
    MemoryAssertionStatusSchema,
    MemoryLifecycleStateSchema,
    MemoryRetrievalCandidateSchema,
    type MemoryAssertionStatus,
    type MemoryLifecycleState,
    type MemoryRetrievalCandidate,
    type RetrievalReason,
} from "./j05-contracts.js";

export interface HybridRetrievalSignal {
    memoryId: string;
    lifecycle: MemoryLifecycleState;
    assertion: MemoryAssertionStatus;
    confidence: number;
    semanticScore: number | null;
    lexicalScore: number | null;
    temporalScore: number;
    exactMatch?: boolean;
    projectMatch?: boolean;
    entityMatch?: boolean;
    pinned?: boolean;
}

const authorityWeight: Record<MemoryAssertionStatus, number> = {
    OWNER_ASSERTED: 1,
    OBSERVED: 0.9,
    IMPORTED: 0.78,
    DERIVED: 0.68,
    MODEL_INFERRED: 0.55,
};

function bounded(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

export function rankHybridMemoryCandidates(
    signals: readonly HybridRetrievalSignal[],
    limit = 20,
): MemoryRetrievalCandidate[] {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return signals
        .filter((signal) => MemoryLifecycleStateSchema.parse(signal.lifecycle) === "ACTIVE")
        .map((signal) => {
            const assertion = MemoryAssertionStatusSchema.parse(signal.assertion);
            const semantic = bounded(signal.semanticScore ?? 0);
            const lexical = bounded(signal.lexicalScore ?? 0);
            const temporal = bounded(signal.temporalScore);
            const confidence = bounded(signal.confidence);
            const reasons: RetrievalReason[] = [];
            if (signal.exactMatch) reasons.push("EXACT_MATCH");
            if (signal.projectMatch) reasons.push("PROJECT_SCOPE");
            if (signal.entityMatch) reasons.push("ENTITY_MATCH");
            if (lexical > 0) reasons.push("LEXICAL_MATCH");
            if (semantic > 0) reasons.push("SEMANTIC_SIMILARITY");
            if (temporal > 0) reasons.push("TEMPORAL_RELEVANCE");
            if (assertion === "OWNER_ASSERTED") reasons.push("OWNER_ASSERTED");
            if (signal.pinned) reasons.push("PINNED");
            if (reasons.length === 0) reasons.push("VERIFIED_SOURCE");

            const score = bounded(
                semantic * 0.36 +
                    lexical * 0.22 +
                    temporal * 0.1 +
                    confidence * 0.12 +
                    authorityWeight[assertion] * 0.12 +
                    (signal.exactMatch ? 0.04 : 0) +
                    (signal.projectMatch ? 0.02 : 0) +
                    (signal.entityMatch ? 0.01 : 0) +
                    (signal.pinned ? 0.01 : 0),
            );
            return MemoryRetrievalCandidateSchema.parse({
                memoryId: signal.memoryId,
                score,
                reasons: [...new Set(reasons)],
                lifecycle: signal.lifecycle,
                assertion,
                confidence,
            });
        })
        .sort((a, b) => b.score - a.score || a.memoryId.localeCompare(b.memoryId))
        .slice(0, boundedLimit);
}
