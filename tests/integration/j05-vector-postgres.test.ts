import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PostgresMemoryLifecycleRepository, PostgresMemoryVectorSearch, type DatabasePool } from "@jarvis/storage";
import { isolatedMemoryDatabase } from "../fixtures/j05-database.js";
let db: Awaited<ReturnType<typeof isolatedMemoryDatabase>>;
let pool: DatabasePool, ownerId: string;
const memoryA=randomUUID(),memoryB=randomUUID(),embeddingA=randomUUID(),embeddingB=randomUUID();
beforeAll(async()=>{
 db = await isolatedMemoryDatabase();
 ({ pool, ownerId } = db);
 for(const memoryId of [memoryA,memoryB]){await pool.query(`INSERT INTO storage.record_catalog(id,owner_id,domain,revision,data_class,deleted) VALUES($1,$2,'memory',1,'D0',false)`,[memoryId,ownerId]);await pool.query(`INSERT INTO memory.records(id,owner_id,project_id,version,payload,created_at) VALUES($1,$2,'j05-vector',1,'{}',now())`,[memoryId,ownerId]);}
 const lifecycle=new PostgresMemoryLifecycleRepository(pool),now=new Date().toISOString();
 await lifecycle.setLifecycle({ownerId,memoryId:memoryA,lifecycle:"ACTIVE",assertion:"OWNER_ASSERTED",semanticKey:"vector:a",confidence:1,capturedAt:now,observedAt:null,validFrom:now,validUntil:null,verifiedAt:now,supersededAt:null});
 await lifecycle.setLifecycle({ownerId,memoryId:memoryB,lifecycle:"ACTIVE",assertion:"OBSERVED",semanticKey:"vector:b",confidence:.8,capturedAt:now,observedAt:now,validFrom:now,validUntil:null,verifiedAt:null,supersededAt:null});
 await pool.query(`INSERT INTO memory.embeddings(id,memory_id,provider,dimensions,embedding,owner_id) VALUES($1,$2,'synthetic-a',3,$3::vector,$4),($5,$6,'synthetic-a',3,$7::vector,$4)`,[embeddingA,memoryA,JSON.stringify([1,0,0]),ownerId,embeddingB,memoryB,JSON.stringify([0,1,0])]);
});
afterAll(async () => { await db?.close(); });

describe("J0.5 pgvector memory retrieval",()=>{
 it("J0.5 G: retrieves scoped relevant memory through pgvector with evidence scores",async()=>{const search=new PostgresMemoryVectorSearch(pool);const hits=await search.search(ownerId,[1,0,0],10,"synthetic-a");expect(hits.map(h=>h.memoryId)).toEqual([memoryA,memoryB]);expect(hits[0]?.semanticScore).toBeCloseTo(1,6);expect(hits[1]?.semanticScore).toBeCloseTo(0,6);expect(hits[0]?.assertion).toBe("OWNER_ASSERTED");});
 it("filters provider and vector dimensions without crossing owner scope",async()=>{const search=new PostgresMemoryVectorSearch(pool);expect(await search.search(ownerId,[1,0,0],10,"missing-provider")).toEqual([]);expect(await search.search(ownerId,[1,0],10,"synthetic-a")).toEqual([]);});
 it("rejects malformed query vectors before database execution",async()=>{const search=new PostgresMemoryVectorSearch(pool);await expect(search.search(ownerId,[1,Number.NaN,0])).rejects.toMatchObject({code:"MEMORY_QUERY_VECTOR_INVALID"});});
});
