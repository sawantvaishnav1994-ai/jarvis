import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@jarvis/config";
import { FileSecretManager } from "@jarvis/security";
import {
    databasePool,
    migrate,
    PostgresMemoryLifecycleRepository,
    type DatabasePool,
} from "@jarvis/storage";
import type { MemoryAdmissionDecision, MemoryConflict, MemoryRevision } from "@jarvis/memory";

const config = await loadConfig("config/development.json");
const actor = {
    version: 1 as const,
    id: "j05-memory-postgres",
    kind: "service" as const,
    environment: "development" as const,
};
let pool: DatabasePool;
let admin: DatabasePool;
let runtimePassword = "";
let ownerId = "";
const memoryA = randomUUID();
const memoryB = randomUUID();
const candidateId = randomUUID();
const conflictId = randomUUID();

async function ensureCatalog(memoryId: string): Promise<void> {
    await pool.query(
        `INSERT INTO storage.record_catalog(id,owner_id,domain,revision,data_class,deleted)
         VALUES($1,$2,'memory',1,'D2',false)
         ON CONFLICT(id) DO NOTHING`,
        [memoryId, ownerId],
    );
}

beforeAll(async () => {
    const manager = new FileSecretManager(
        process.env.JARVIS_VAULT_FILE ?? ".jarvis/development/vault.json",
        process.env.JARVIS_MASTER_KEY_FILE ??
            resolve(homedir(), ".config/jarvis/typescript/development/master.key"),
        "development",
        actor.id,
        new Set([
            config.storage.postgres.passwordRef,
            config.storage.postgres.migratorPasswordRef,
        ]),
    );
    const runtimeLease = await manager.lease(config.storage.postgres.passwordRef, actor);
    const adminLease = await manager.lease(config.storage.postgres.migratorPasswordRef, actor);
    runtimePassword = runtimeLease.value.toString("utf8");
    pool = databasePool(config.storage.postgres, runtimePassword);
    admin = databasePool(config.storage.postgres, adminLease.value.toString("utf8"), true);
    runtimeLease.destroy();
    adminLease.destroy();

    await migrate(
        admin,
        "infrastructure/migrations",
        "development",
        config.storage.postgres.runtimeUser,
        runtimePassword,
    );
    await pool.query(
        `INSERT INTO identity.root_owner(id,payload)
         SELECT 'j05-test-owner','{}'
         WHERE NOT EXISTS (SELECT 1 FROM identity.root_owner)`,
    );
    ownerId = (await pool.query<{ id: string }>("SELECT id FROM identity.root_owner WHERE singleton=true")).rows[0]!.id;
    await ensureCatalog(memoryA);
    await ensureCatalog(memoryB);
});

afterAll(async () => {
    if (pool) {
        await pool.query("DELETE FROM memory.conflicts WHERE id=$1", [conflictId]);
        await pool.query("DELETE FROM memory.admission_decisions WHERE candidate_id=$1", [candidateId]);
        await pool.query("DELETE FROM memory.revisions WHERE owner_id=$1 AND memory_id=ANY($2::uuid[])", [ownerId, [memoryA, memoryB]]);
        await pool.query("DELETE FROM memory.lifecycle WHERE owner_id=$1 AND memory_id=ANY($2::uuid[])", [ownerId, [memoryA, memoryB]]);
        await pool.query("DELETE FROM storage.record_catalog WHERE owner_id=$1 AND id=ANY($2::uuid[])", [ownerId, [memoryA, memoryB]]);
        await pool.end();
    }
    if (admin) await admin.end();
});

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
