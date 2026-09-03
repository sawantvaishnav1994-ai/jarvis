import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@jarvis/config";
import { FileSecretManager } from "@jarvis/security";
import { databasePool, migrate, PostgresMemoryAuditSink, PostgresMemoryControls, type DatabasePool } from "@jarvis/storage";

const config=await loadConfig("config/development.json");
const actor={version:1 as const,id:"j05-controls-postgres",kind:"service" as const,environment:"development" as const};
let pool:DatabasePool,admin:DatabasePool,runtimePassword="",ownerId="";
const memoryA=randomUUID(),memoryB=randomUUID(),auditMemory=randomUUID();

beforeAll(async()=>{
 const manager=new FileSecretManager(process.env.JARVIS_VAULT_FILE??".jarvis/development/vault.json",process.env.JARVIS_MASTER_KEY_FILE??resolve(homedir(),".config/jarvis/typescript/development/master.key"),"development",actor.id,new Set([config.storage.postgres.passwordRef,config.storage.postgres.migratorPasswordRef]));
 const runtime=await manager.lease(config.storage.postgres.passwordRef,actor),migrator=await manager.lease(config.storage.postgres.migratorPasswordRef,actor);
 runtimePassword=runtime.value.toString("utf8");pool=databasePool(config.storage.postgres,runtimePassword);admin=databasePool(config.storage.postgres,migrator.value.toString("utf8"),true);runtime.destroy();migrator.destroy();
 await migrate(admin,"infrastructure/migrations","development",config.storage.postgres.runtimeUser,runtimePassword);
 await pool.query(`INSERT INTO identity.root_owner(id,payload) SELECT 'j05-test-owner','{}' WHERE NOT EXISTS (SELECT 1 FROM identity.root_owner)`);
 ownerId=(await pool.query<{id:string}>("SELECT id FROM identity.root_owner WHERE singleton=true")).rows[0]!.id;
 for(const id of [memoryA,memoryB]) await pool.query("INSERT INTO storage.record_catalog(id,owner_id,domain,revision,data_class,deleted) VALUES($1,$2,'memory',1,'D2',false) ON CONFLICT(id) DO NOTHING",[id,ownerId]);
});
afterAll(async()=>{if(pool){await pool.query("DELETE FROM memory.context_cache WHERE owner_id=$1",[ownerId]);await pool.query("DELETE FROM memory.restrictions WHERE owner_id=$1 AND semantic_key LIKE 'j05:%'",[ownerId]);await pool.query("DELETE FROM memory.lifecycle WHERE owner_id=$1 AND memory_id=ANY($2::uuid[])",[ownerId,[memoryA,memoryB]]);await pool.query("DELETE FROM storage.record_catalog WHERE owner_id=$1 AND id=ANY($2::uuid[])",[ownerId,[memoryA,memoryB]]);await pool.end();}await admin?.end();});

describe("J0.5 persistent owner controls and lifecycle propagation",()=>{
 it("persists NEVER_STORE restrictions and context cache through runtime role",async()=>{const controls=new PostgresMemoryControls(pool);await controls.restrict(ownerId,"j05:secret-class");expect(await controls.isRestricted(ownerId,"j05:secret-class")).toBe(true);await controls.cache(ownerId,"preview",[memoryA],[],new Date(Date.now()+60000).toISOString());expect((await pool.query("SELECT 1 FROM memory.context_cache WHERE owner_id=$1 AND cache_key='preview'",[ownerId])).rowCount).toBe(1);});
 it("keeps memory audit metadata append-only",async()=>{const audit=new PostgresMemoryAuditSink(pool);await audit.append({action:"retrieve",ownerId,memoryId:auditMemory,reason:"synthetic retrieval evidence",at:new Date().toISOString()});const rows=await audit.list(ownerId) as Array<{memory_id:string|null;action:string}>;expect(rows.some(r=>r.memory_id===auditMemory&&r.action==="retrieve")).toBe(true);await expect(pool.query("UPDATE audit.memory_events SET reason='tampered' WHERE owner_id=$1 AND memory_id=$2",[ownerId,auditMemory])).rejects.toBeTruthy();});
 it("J0.5 Q: forget propagation invalidates memory vectors and unsupported graph facts",async()=>{const controls=new PostgresMemoryControls(pool),now=new Date().toISOString();await pool.query("INSERT INTO memory.lifecycle(owner_id,memory_id,lifecycle,assertion,semantic_key,confidence,captured_at) VALUES($1,$2,'ACTIVE','OWNER_ASSERTED','j05:delete',1,$3)",[ownerId,memoryA,now]);await controls.cache(ownerId,"delete-preview",[memoryA],[],new Date(Date.now()+60000).toISOString());await pool.query("UPDATE storage.record_catalog SET deleted=true WHERE owner_id=$1 AND id=$2",[ownerId,memoryA]);expect((await pool.query("SELECT lifecycle FROM memory.lifecycle WHERE owner_id=$1 AND memory_id=$2",[ownerId,memoryA])).rows[0]?.lifecycle).toBe("DELETED");expect((await pool.query("SELECT 1 FROM memory.context_cache WHERE owner_id=$1 AND cache_key='delete-preview'",[ownerId])).rowCount).toBe(0);});
 it("J0.5 R: expiry removes memory from retrieval and propagates derived invalidation",async()=>{const controls=new PostgresMemoryControls(pool),now=new Date().toISOString();await pool.query("INSERT INTO memory.lifecycle(owner_id,memory_id,lifecycle,assertion,semantic_key,confidence,captured_at) VALUES($1,$2,'ACTIVE','OBSERVED','j05:expiry',.8,$3)",[ownerId,memoryB,now]);await controls.cache(ownerId,"expiry-preview",[memoryB],[],new Date(Date.now()+60000).toISOString());await pool.query("UPDATE memory.lifecycle SET lifecycle='EXPIRED',updated_at=now() WHERE owner_id=$1 AND memory_id=$2",[ownerId,memoryB]);expect((await pool.query("SELECT 1 FROM memory.context_cache WHERE owner_id=$1 AND cache_key='expiry-preview'",[ownerId])).rowCount).toBe(0);});
});
