import type pg from "pg";
import { BoundaryError } from "@jarvis/shared";
import {
    MemoryAdmissionDecisionSchema,
    MemoryConflictSchema,
    MemoryRevisionSchema,
    MemoryLifecycleStateSchema,
    MemoryAssertionStatusSchema,
    type MemoryAdmissionDecision,
    type MemoryConflict,
    type MemoryRevision,
    type MemoryLifecycleState,
    type MemoryAssertionStatus,
} from "@jarvis/memory";

export interface PersistedMemoryLifecycle {
    ownerId: string;
    memoryId: string;
    lifecycle: MemoryLifecycleState;
    assertion: MemoryAssertionStatus;
    semanticKey: string | null;
    confidence: number;
    capturedAt: string;
    observedAt: string | null;
    validFrom: string | null;
    validUntil: string | null;
    verifiedAt: string | null;
    supersededAt: string | null;
}

export class PostgresMemoryLifecycleRepository {
    constructor(private readonly pool: pg.Pool) {}

    async setLifecycle(input: PersistedMemoryLifecycle): Promise<void> {
        const lifecycle = MemoryLifecycleStateSchema.parse(input.lifecycle);
        const assertion = MemoryAssertionStatusSchema.parse(input.assertion);
        if (input.validFrom && input.validUntil && Date.parse(input.validFrom) > Date.parse(input.validUntil))
            throw new BoundaryError("MEMORY_VALIDITY_INTERVAL_INVALID");
        await this.pool.query(
            `INSERT INTO memory.lifecycle(
                owner_id,memory_id,lifecycle,assertion,semantic_key,confidence,captured_at,
                observed_at,valid_from,valid_until,verified_at,superseded_at,updated_at
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
             ON CONFLICT(owner_id,memory_id) DO UPDATE SET
                lifecycle=EXCLUDED.lifecycle,
                assertion=EXCLUDED.assertion,
                semantic_key=EXCLUDED.semantic_key,
                confidence=EXCLUDED.confidence,
                captured_at=EXCLUDED.captured_at,
                observed_at=EXCLUDED.observed_at,
                valid_from=EXCLUDED.valid_from,
                valid_until=EXCLUDED.valid_until,
                verified_at=EXCLUDED.verified_at,
                superseded_at=EXCLUDED.superseded_at,
                updated_at=now()`,
            [
                input.ownerId,
                input.memoryId,
                lifecycle,
                assertion,
                input.semanticKey,
                input.confidence,
                input.capturedAt,
                input.observedAt,
                input.validFrom,
                input.validUntil,
                input.verifiedAt,
                input.supersededAt,
            ],
        );
    }

    async readLifecycle(ownerId: string, memoryId: string): Promise<PersistedMemoryLifecycle | null> {
        const result = await this.pool.query(
            `SELECT owner_id,memory_id,lifecycle,assertion,semantic_key,confidence,
                    captured_at,observed_at,valid_from,valid_until,verified_at,superseded_at
               FROM memory.lifecycle WHERE owner_id=$1 AND memory_id=$2`,
            [ownerId, memoryId],
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
            ownerId: row.owner_id,
            memoryId: row.memory_id,
            lifecycle: MemoryLifecycleStateSchema.parse(row.lifecycle),
            assertion: MemoryAssertionStatusSchema.parse(row.assertion),
            semanticKey: row.semantic_key,
            confidence: Number(row.confidence),
            capturedAt: new Date(row.captured_at).toISOString(),
            observedAt: row.observed_at ? new Date(row.observed_at).toISOString() : null,
            validFrom: row.valid_from ? new Date(row.valid_from).toISOString() : null,
            validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
            verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
            supersededAt: row.superseded_at ? new Date(row.superseded_at).toISOString() : null,
        };
    }

    async appendRevision(input: MemoryRevision): Promise<void> {
        const revision = MemoryRevisionSchema.parse(input);
        await this.pool.query(
            `INSERT INTO memory.revisions(
                id,owner_id,memory_id,record_version,lifecycle,assertion,content_hash,
                changed_at,reason,supersedes_revision_id
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
                revision.id,
                revision.ownerId,
                revision.memoryId,
                revision.recordVersion,
                revision.lifecycle,
                revision.assertion,
                revision.contentHash,
                revision.changedAt,
                revision.reason,
                revision.supersedesRevisionId,
            ],
        );
    }

    async listRevisions(ownerId: string, memoryId: string): Promise<MemoryRevision[]> {
        const result = await this.pool.query(
            `SELECT id,owner_id,memory_id,record_version,lifecycle,assertion,content_hash,
                    changed_at,reason,supersedes_revision_id
               FROM memory.revisions
              WHERE owner_id=$1 AND memory_id=$2
              ORDER BY record_version ASC`,
            [ownerId, memoryId],
        );
        return result.rows.map((row) => MemoryRevisionSchema.parse({
            version: 1,
            id: row.id,
            memoryId: row.memory_id,
            ownerId: row.owner_id,
            recordVersion: row.record_version,
            lifecycle: row.lifecycle,
            assertion: row.assertion,
            contentHash: row.content_hash,
            changedAt: new Date(row.changed_at).toISOString(),
            reason: row.reason,
            supersedesRevisionId: row.supersedes_revision_id,
        }));
    }

    async recordAdmission(
        candidateId: string,
        ownerId: string,
        projectId: string | null,
        input: MemoryAdmissionDecision,
        decisionHash: string,
    ): Promise<void> {
        const decision = MemoryAdmissionDecisionSchema.parse(input);
        if (!/^[a-f0-9]{64}$/.test(decisionHash))
            throw new BoundaryError("MEMORY_ADMISSION_HASH_INVALID");
        const inserted = await this.pool.query(
            `INSERT INTO memory.admission_decisions(
                candidate_id,owner_id,project_id,decision,canonical_memory_id,
                related_memory_ids,reason_codes,decision_hash
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT(candidate_id) DO NOTHING
             RETURNING candidate_id`,
            [
                candidateId,
                ownerId,
                projectId,
                decision.decision,
                decision.canonicalMemoryId,
                decision.relatedMemoryIds,
                decision.reasonCodes,
                decisionHash,
            ],
        );
        if (inserted.rowCount === 1) return;
        const existing = await this.pool.query<{ decision_hash: string }>(
            "SELECT decision_hash FROM memory.admission_decisions WHERE candidate_id=$1",
            [candidateId],
        );
        if (existing.rows[0]?.decision_hash !== decisionHash)
            throw new BoundaryError("MEMORY_ADMISSION_REPLAY_MISMATCH");
    }

    async createConflict(input: MemoryConflict): Promise<void> {
        const conflict = MemoryConflictSchema.parse(input);
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `INSERT INTO memory.conflicts(
                    id,owner_id,project_id,semantic_key,state,resolution,created_at,resolved_at
                 ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    conflict.id,
                    conflict.ownerId,
                    conflict.projectId,
                    conflict.semanticKey,
                    conflict.state,
                    conflict.resolution,
                    conflict.createdAt,
                    conflict.resolvedAt,
                ],
            );
            for (const memoryId of conflict.memoryIds) {
                await client.query(
                    "INSERT INTO memory.conflict_members(conflict_id,owner_id,memory_id) VALUES($1,$2,$3)",
                    [conflict.id, conflict.ownerId, memoryId],
                );
            }
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}
