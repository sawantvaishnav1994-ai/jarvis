import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@jarvis/config";
import { FileSecretManager } from "@jarvis/security";
import {
    databasePool,
    migrate,
    PostgresMemoryLifecycleRepository,
    PostgresMemoryVectorSearch,
    type DatabasePool,
} from "@jarvis/storage";

const config = await loadConfig("config/development.json");
const actor = {
    version: 1 as const,
    id: "j05-vector-postgres",
    kind: "service" as const,
    environment: "development" as const,
};
let pool: DatabasePool;
let admin: DatabasePool;
let runtimePassword = "";
let ownerId = "";
const memoryA = randomUUID();
const memoryB = randomUUID();
const embeddingA = randomUUID();
const embeddingB = randomUUID();

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
         SELECT 'j05-vector-owner','{}'
         WHERE NOT EXISTS (SELECT 1 FROM identity.root_owner)`,
    );
    ownerId = (await pool.query<{ id: string }>("SELECT id FROM identity.root_owner WHERE singleton=true")).rows[0]!.id;

    for (const memoryId of [memoryA, memoryB]) {
        await pool.query(
            `INSERT INTO storage.record_catalog(id,owner_id,domain,revision,data_class,deleted)
             VALUES($1,$2,'memory',1,'D0',false)`,
            [memoryId, ownerId],
        );
        await pool.query(
            `INSERT INTO memory.records(id,owner_id,project_id,version,payload,created_at)
             VALUES($1,$2,'j05-vector',1,'{}',now())`,
            [memoryId, ownerId],
        );
    }
    const lifecycle = new PostgresMemoryLifecycleRepository(pool);
    const now = new Date().toISOString();
    await lifecycle.setLifecycle({
        ownerId,
        memoryId: memoryA,
        lifecycle: "ACTIVE",
        assertion: "OWNER_ASSERTED",
        semanticKey: "vector:a",
        confidence: 1,
        capturedAt: now,
        observedAt: null,
        validFrom: now,
        validUntil: null,
        verifiedAt: now,
        supersededAt: null,
    });
    await lifecycle.setLifecycle({
        ownerId,
        memoryId: memoryB,
        lifecycle: "ACTIVE",
        assertion: "OBSERVED",
        semanticKey: "vector:b",
        confidence: 0.8,
        capturedAt: now,
        observedAt: now,
        validFrom: now,
        validUntil: null,
        verifiedAt: null,
        supersededAt: null,
    });
    await pool.query(
        `INSERT INTO memory.embeddings(id,memory_id,provider,dimensions,embedding,owner_id)
         VALUES($1,$2,'synthetic-a',3,$3::vector,$4),($5,$6,'synthetic-a',3,$7::vector,$4)`,
        [embeddingA, memoryA, JSON.stringify([1, 0, 0]), ownerId, embeddingB, memoryB, JSON.stringify([0, 1, 0])],
    );
});

afterAll(async () => {
    if (pool) {
        await pool.query("DELETE FROM memory.embeddings WHERE id=ANY($1::uuid[])", [[embeddingA, embeddingB]]);
        await pool.query("DELETE FROM memory.lifecycle WHERE owner_id=$1 AND memory_id=ANY($2::uuid[])", [ownerId, [memoryA, memoryB]]);
        await pool.query("DELETE FROM memory.records WHERE id=ANY($1::uuid[])", [[memoryA, memoryB]]);
        await pool.query("DELETE FROM storage.record_catalog WHERE owner_id=$1 AND id=ANY($2::uuid[])", [ownerId, [memoryA, memoryB]]);
        await pool.end();
    }
    if (admin) await admin.end();
});

describe("J0.5 pgvector memory retrieval", () => {
    it("ranks native eligible embeddings by cosine relevance", async () => {
        const search = new PostgresMemoryVectorSearch(pool);
        const hits = await search.search(ownerId, [1, 0, 0], 10, "synthetic-a");
        expect(hits.map((hit) => hit.memoryId)).toEqual([memoryA, memoryB]);
        expect(hits[0]?.semanticScore).toBeCloseTo(1, 6);
        expect(hits[1]?.semanticScore).toBeCloseTo(0, 6);
        expect(hits[0]?.assertion).toBe("OWNER_ASSERTED");
    });

    it("filters provider and vector dimensions without crossing owner scope", async () => {
        const search = new PostgresMemoryVectorSearch(pool);
        expect(await search.search(ownerId, [1, 0, 0], 10, "missing-provider")).toEqual([]);
        expect(await search.search(ownerId, [1, 0], 10, "synthetic-a")).toEqual([]);
    });

    it("rejects malformed query vectors before database execution", async () => {
        const search = new PostgresMemoryVectorSearch(pool);
        await expect(search.search(ownerId, [1, Number.NaN, 0])).rejects.toMatchObject({
            code: "MEMORY_QUERY_VECTOR_INVALID",
        });
    });
});
