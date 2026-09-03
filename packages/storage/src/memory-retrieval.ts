import type pg from "pg";
import { BoundaryError } from "@jarvis/shared";
import { MemoryAssertionStatusSchema, MemoryLifecycleStateSchema, type MemoryAssertionStatus } from "@jarvis/memory";

export interface VectorMemoryHit {
    memoryId: string;
    semanticScore: number;
    confidence: number;
    assertion: MemoryAssertionStatus;
}

export class PostgresMemoryVectorSearch {
    constructor(private readonly pool: pg.Pool) {}

    async search(
        ownerId: string,
        vector: readonly number[],
        limit = 20,
        provider: string | null = null,
    ): Promise<VectorMemoryHit[]> {
        if (vector.length < 1 || vector.length > 2048 || vector.some((v) => !Number.isFinite(v)))
            throw new BoundaryError("MEMORY_QUERY_VECTOR_INVALID");
        const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
        const literal = JSON.stringify(vector);
        const result = await this.pool.query(
            `WITH candidates AS (
                SELECT e.memory_id,
                       GREATEST(0::double precision, LEAST(1::double precision,
                           1 - (e.embedding <=> $2::vector))) AS semantic_score,
                       l.confidence,
                       l.assertion,
                       l.lifecycle,
                       row_number() OVER (
                           PARTITION BY e.memory_id
                           ORDER BY (e.embedding <=> $2::vector) ASC, e.id ASC
                       ) AS rn
                  FROM memory.embeddings e
                  JOIN memory.lifecycle l
                    ON l.owner_id=e.owner_id AND l.memory_id=e.memory_id
                  JOIN storage.record_catalog c
                    ON c.owner_id=l.owner_id AND c.id=l.memory_id
                 WHERE e.owner_id=$1
                   AND e.embedding IS NOT NULL
                   AND vector_dims(e.embedding)=$5
                   AND l.lifecycle='ACTIVE'
                   AND c.deleted=false
                   AND ($4::text IS NULL OR e.provider=$4)
            )
            SELECT memory_id,semantic_score,confidence,assertion,lifecycle
              FROM candidates
             WHERE rn=1
             ORDER BY semantic_score DESC,memory_id ASC
             LIMIT $3`,
            [ownerId, literal, boundedLimit, provider, vector.length],
        );
        return result.rows
            .map((row) => ({
                memoryId: String(row.memory_id),
                semanticScore: Number(row.semantic_score),
                confidence: Number(row.confidence),
                assertion: MemoryAssertionStatusSchema.parse(row.assertion),
                lifecycle: MemoryLifecycleStateSchema.parse(row.lifecycle),
            }))
            .filter((row) => row.lifecycle === "ACTIVE")
            .map(({ lifecycle: _lifecycle, ...row }) => row);
    }
}
