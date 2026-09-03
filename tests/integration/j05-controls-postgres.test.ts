import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PostgresMemoryAuditSink, PostgresMemoryControls, type DatabasePool } from "@jarvis/storage";
import { isolatedMemoryDatabase } from "../fixtures/j05-database.js";
let db: Awaited<ReturnType<typeof isolatedMemoryDatabase>>;
let pool: DatabasePool, ownerId: string;
const memoryA = randomUUID(), memoryB = randomUUID(), auditMemory = randomUUID();
beforeAll(async () => {
 db = await isolatedMemoryDatabase();
 ({ pool, ownerId } = db);
 for(const id of [memoryA,memoryB]) await pool.query("INSERT INTO storage.record_catalog(id,owner_id,domain,revision,data_class,deleted) VALUES($1,$2,'memory',1,'D2',false) ON CONFLICT(id) DO NOTHING",[id,ownerId]);
});
afterAll(async () => { await db?.close(); });

describe("J0.5 persistent owner controls and lifecycle propagation",()=>{
 it("persists NEVER_STORE restrictions and context cache through runtime role",async()=>{const controls=new PostgresMemoryControls(pool);await controls.restrict(ownerId,"j05:secret-class");expect(await controls.isRestricted(ownerId,"j05:secret-class")).toBe(true);await controls.cache(ownerId,"preview",[memoryA],[],new Date(Date.now()+60000).toISOString());expect((await pool.query("SELECT 1 FROM memory.context_cache WHERE owner_id=$1 AND cache_key='preview'",[ownerId])).rowCount).toBe(1);});
 it("keeps memory audit metadata append-only",async()=>{const audit=new PostgresMemoryAuditSink(pool);await audit.append({action:"retrieve",ownerId,memoryId:auditMemory,reason:"synthetic retrieval evidence",at:new Date().toISOString()});const rows=await audit.list(ownerId) as Array<{memory_id:string|null;action:string}>;expect(rows.some(r=>r.memory_id===auditMemory&&r.action==="retrieve")).toBe(true);await expect(pool.query("UPDATE audit.memory_events SET reason='tampered' WHERE owner_id=$1 AND memory_id=$2",[ownerId,auditMemory])).rejects.toBeTruthy();});
 it("J0.5 Q: forget propagation invalidates memory vectors and unsupported graph facts",async()=>{const controls=new PostgresMemoryControls(pool),now=new Date().toISOString();await pool.query("INSERT INTO memory.lifecycle(owner_id,memory_id,lifecycle,assertion,semantic_key,confidence,captured_at) VALUES($1,$2,'ACTIVE','OWNER_ASSERTED','j05:delete',1,$3)",[ownerId,memoryA,now]);await controls.cache(ownerId,"delete-preview",[memoryA],[],new Date(Date.now()+60000).toISOString());await pool.query("UPDATE storage.record_catalog SET deleted=true WHERE owner_id=$1 AND id=$2",[ownerId,memoryA]);expect((await pool.query("SELECT lifecycle FROM memory.lifecycle WHERE owner_id=$1 AND memory_id=$2",[ownerId,memoryA])).rows[0]?.lifecycle).toBe("DELETED");expect((await pool.query("SELECT 1 FROM memory.context_cache WHERE owner_id=$1 AND cache_key='delete-preview'",[ownerId])).rowCount).toBe(0);});
 it("J0.5 R: expiry removes memory from retrieval and propagates derived invalidation",async()=>{const controls=new PostgresMemoryControls(pool),now=new Date().toISOString();await pool.query("INSERT INTO memory.lifecycle(owner_id,memory_id,lifecycle,assertion,semantic_key,confidence,captured_at) VALUES($1,$2,'ACTIVE','OBSERVED','j05:expiry',.8,$3)",[ownerId,memoryB,now]);await controls.cache(ownerId,"expiry-preview",[memoryB],[],new Date(Date.now()+60000).toISOString());await pool.query("UPDATE memory.lifecycle SET lifecycle='EXPIRED',updated_at=now() WHERE owner_id=$1 AND memory_id=$2",[ownerId,memoryB]);expect((await pool.query("SELECT 1 FROM memory.context_cache WHERE owner_id=$1 AND cache_key='expiry-preview'",[ownerId])).rowCount).toBe(0);});
});
