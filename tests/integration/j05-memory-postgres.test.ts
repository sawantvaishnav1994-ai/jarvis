import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { PostgresMemoryLifecycleRepository, type DatabasePool } from "@jarvis/storage";
import type { MemoryAdmissionDecision, MemoryConflict, MemoryRevision } from "@jarvis/memory";
import { isolatedMemoryDatabase } from "../fixtures/j05-database.js";
let db: Awaited<ReturnType<typeof isolatedMemoryDatabase>>;
let pool: DatabasePool, ownerId: string;
const memoryA = randomUUID(), memoryB = randomUUID(), candidateId = randomUUID(), conflictId = randomUUID();

async function ensureCatalog(memoryId: string): Promise<void> {
    await pool.query(
        `INSERT INTO storage.record_catalog(id,owner_id,domain,revision,data_class,deleted)
         VALUES($1,$2,'memory',1,'D2',false)
         ON CONFLICT(id) DO NOTHING`,
        [memoryId, ownerId],
    );
}

beforeAll(async () => {
    db = await isolatedMemoryDatabase();
    ({ pool, ownerId } = db);
    await ensureCatalog(memoryA);
    await ensureCatalog(memoryB);
});
afterAll(async () => { await db?.close(); });

describe("J0.5 real PostgreSQL memory persistence", () => {
    it("round-trips lifecycle metadata through the runtime role", async () => {
        const repository = new PostgresMemoryLifecycleRepository(pool);
        const capturedAt = new Date().toISOString();
        await repository.setLifecycle({
            ownerId,
            memoryId: memoryA,
            lifecycle: "ACTIVE",
            assertion: "OWNER_ASSERTED",
            semanticKey: "owner:preferred-language",
            confidence: 1,
            capturedAt,
            observedAt: null,
            validFrom: capturedAt,
            validUntil: null,
            verifiedAt: capturedAt,
            supersededAt: null,
        });
        const stored = await repository.readLifecycle(ownerId, memoryA);
        expect(stored).toMatchObject({
            ownerId,
            memoryId: memoryA,
            lifecycle: "ACTIVE",
            assertion: "OWNER_ASSERTED",
            semanticKey: "owner:preferred-language",
            confidence: 1,
        });
    });

    it("persists immutable ordered revision history", async () => {
        const repository = new PostgresMemoryLifecycleRepository(pool);
        const first: MemoryRevision = {
            version: 1,
            id: randomUUID(),
            memoryId: memoryA,
            ownerId,
            recordVersion: 1,
            lifecycle: "ACTIVE",
            assertion: "OWNER_ASSERTED",
            contentHash: createHash("sha256").update("English").digest("hex"),
            changedAt: new Date().toISOString(),
            reason: "owner asserted preference",
            supersedesRevisionId: null,
        };
        const second: MemoryRevision = {
            ...first,
            id: randomUUID(),
            recordVersion: 2,
            contentHash: createHash("sha256").update("German").digest("hex"),
            changedAt: new Date(Date.now() + 1).toISOString(),
            reason: "owner correction",
            supersedesRevisionId: first.id,
        };
        await repository.appendRevision(first);
        await repository.appendRevision(second);
        expect((await repository.listRevisions(ownerId, memoryA)).map((r) => r.recordVersion)).toEqual([1, 2]);
        await expect(repository.appendRevision(second)).rejects.toBeTruthy();
    });

    it("makes admission decisions idempotent and rejects altered replay", async () => {
        const repository = new PostgresMemoryLifecycleRepository(pool);
        const decision: MemoryAdmissionDecision = {
            version: 1,
            decision: "ACCEPT",
            canonicalMemoryId: memoryA,
            relatedMemoryIds: [],
            reasonCodes: ["OWNER_ASSERTED"],
        };
        const hash = createHash("sha256").update(JSON.stringify(decision)).digest("hex");
        await repository.recordAdmission(candidateId, ownerId, null, decision, hash);
        await repository.recordAdmission(candidateId, ownerId, null, decision, hash);
        await expect(
            repository.recordAdmission(candidateId, ownerId, null, decision, "0".repeat(64)),
        ).rejects.toMatchObject({ code: "MEMORY_ADMISSION_REPLAY_MISMATCH" });
    });

    it("persists conflict membership transactionally", async () => {
        const repository = new PostgresMemoryLifecycleRepository(pool);
        const conflict: MemoryConflict = {
            version: 1,
            id: conflictId,
            ownerId,
            projectId: null,
            memoryIds: [memoryA, memoryB],
            semanticKey: "owner:preferred-language",
            state: "OWNER_CONFIRMATION_REQUIRED",
            resolution: null,
            createdAt: new Date().toISOString(),
            resolvedAt: null,
        };
        await repository.createConflict(conflict);
        const members = await pool.query<{ memory_id: string }>(
            "SELECT memory_id FROM memory.conflict_members WHERE conflict_id=$1 ORDER BY memory_id",
            [conflictId],
        );
        expect(members.rows.map((row) => row.memory_id).sort()).toEqual([memoryA, memoryB].sort());
    });

    it("rejects invalid temporal intervals at both service and database boundaries", async () => {
        const repository = new PostgresMemoryLifecycleRepository(pool);
        await expect(
            repository.setLifecycle({
                ownerId,
                memoryId: memoryB,
                lifecycle: "ACTIVE",
                assertion: "OBSERVED",
                semanticKey: "project:deadline",
                confidence: 0.8,
                capturedAt: new Date().toISOString(),
                observedAt: null,
                validFrom: "2026-09-04T00:00:00.000Z",
                validUntil: "2026-09-03T00:00:00.000Z",
                verifiedAt: null,
                supersededAt: null,
            }),
        ).rejects.toMatchObject({ code: "MEMORY_VALIDITY_INTERVAL_INVALID" });
        await expect(
            pool.query(
                `INSERT INTO memory.lifecycle(
                    owner_id,memory_id,lifecycle,assertion,semantic_key,confidence,captured_at,valid_from,valid_until
                 ) VALUES($1,$2,'ACTIVE','OBSERVED','project:deadline',0.8,now(),$3,$4)`,
                [ownerId, memoryB, "2026-09-04T00:00:00.000Z", "2026-09-03T00:00:00.000Z"],
            ),
        ).rejects.toBeTruthy();
    });
});
