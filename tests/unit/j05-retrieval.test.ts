import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { rankHybridMemoryCandidates } from "@jarvis/memory";

describe("J0.5 hybrid retrieval ranking", () => {
    it("combines semantic, lexical, temporal and authority signals deterministically", () => {
        const ownerMemory = randomUUID();
        const inferredMemory = randomUUID();
        const ranked = rankHybridMemoryCandidates([
            {
                memoryId: inferredMemory,
                lifecycle: "ACTIVE",
                assertion: "MODEL_INFERRED",
                confidence: 0.7,
                semanticScore: 0.95,
                lexicalScore: 0.4,
                temporalScore: 0.8,
            },
            {
                memoryId: ownerMemory,
                lifecycle: "ACTIVE",
                assertion: "OWNER_ASSERTED",
                confidence: 1,
                semanticScore: 0.8,
                lexicalScore: 0.9,
                temporalScore: 0.9,
                exactMatch: true,
                projectMatch: true,
            },
        ]);
        expect(ranked[0]?.memoryId).toBe(ownerMemory);
        expect(ranked[0]?.reasons).toContain("OWNER_ASSERTED");
        expect(ranked[0]?.reasons).toContain("EXACT_MATCH");
    });

    it("excludes non-active memories and clamps malformed numeric signals", () => {
        const active = randomUUID();
        const disputed = randomUUID();
        const ranked = rankHybridMemoryCandidates([
            {
                memoryId: disputed,
                lifecycle: "DISPUTED",
                assertion: "OWNER_ASSERTED",
                confidence: 1,
                semanticScore: 1,
                lexicalScore: 1,
                temporalScore: 1,
            },
            {
                memoryId: active,
                lifecycle: "ACTIVE",
                assertion: "OBSERVED",
                confidence: 2,
                semanticScore: Number.NaN,
                lexicalScore: -1,
                temporalScore: 3,
            },
        ]);
        expect(ranked).toHaveLength(1);
        expect(ranked[0]?.memoryId).toBe(active);
        expect(ranked[0]?.score).toBeGreaterThanOrEqual(0);
        expect(ranked[0]?.score).toBeLessThanOrEqual(1);
        expect(ranked[0]?.confidence).toBe(1);
    });

    it("uses stable memory-id tie breaking", () => {
        const ids = [randomUUID(), randomUUID()].sort();
        const ranked = rankHybridMemoryCandidates(ids.map((memoryId) => ({
            memoryId,
            lifecycle: "ACTIVE" as const,
            assertion: "OBSERVED" as const,
            confidence: 0.5,
            semanticScore: 0.5,
            lexicalScore: 0.5,
            temporalScore: 0.5,
        })));
        expect(ranked.map((item) => item.memoryId)).toEqual(ids);
    });
});
