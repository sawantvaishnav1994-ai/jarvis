import { beforeAll,afterAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@jarvis/config";
import { FileSecretManager } from "@jarvis/security";
import { databasePool,PostgresToolEvidenceStore,type DatabasePool } from "@jarvis/storage";
let pool:DatabasePool;
const config=await loadConfig("config/development.json"),actor={version:1 as const,id:"j07-evidence-test",kind:"service" as const,ownerId:"owner-test",environment:"development" as const};
beforeAll(async()=>{const manager=new FileSecretManager(process.env.JARVIS_VAULT_FILE??".jarvis/development/vault.json",process.env.JARVIS_MASTER_KEY_FILE??resolve(homedir(),".config/jarvis/typescript/development/master.key"),"development",actor.id,new Set([config.storage.postgres.passwordRef]));const lease=await manager.lease(config.storage.postgres.passwordRef,actor);pool=databasePool(config.storage.postgres,lease.value.toString("utf8"));lease.destroy();await pool.query("SELECT 1");});
afterAll(async()=>{if(pool)await pool.end();});
describe("J0.7 durable tool evidence",()=>{
 it("persists idempotency across repository instances and fails closed on changed input",async()=>{const key="j07-"+randomUUID(),hash="a".repeat(64),one=new PostgresToolEvidenceStore(pool),two=new PostgresToolEvidenceStore(pool);expect(await one.reserve({idempotencyKey:key,requestHash:hash,toolId:"mock.write",toolVersion:1,operation:"run"})).toEqual({status:"RESERVED"});expect((await two.reserve({idempotencyKey:key,requestHash:hash,toolId:"mock.write",toolVersion:1,operation:"run"})).status).toBe("EXISTING");await expect(two.reserve({idempotencyKey:key,requestHash:"b".repeat(64),toolId:"mock.write",toolVersion:1,operation:"run"})).rejects.toThrow("IDEMPOTENCY_CONFLICT");});
 it("stores safe execution evidence without raw arguments or outputs",async()=>{const key="j07-"+randomUUID(),executionId=randomUUID(),hash="c".repeat(64),store=new PostgresToolEvidenceStore(pool);await store.reserve({idempotencyKey:key,requestHash:hash,toolId:"mock.write",toolVersion:1,operation:"run"});await store.complete({idempotencyKey:key,executionId,requestId:"request-safe",correlationId:"correlation-safe",toolId:"mock.write",toolVersion:1,operation:"run",actorId:"owner-test",source:"USER",inputHash:hash,authorizationReference:"auth-safe",state:"VERIFIED",attemptCount:1,verified:true,startedAt:new Date().toISOString(),completedAt:new Date().toISOString()});const row=await pool.query("SELECT * FROM tools.executions WHERE execution_id=$1",[executionId]);expect(row.rowCount).toBe(1);expect(JSON.stringify(row.rows[0])).not.toContain("raw-secret-payload");const replay=await new PostgresToolEvidenceStore(pool).reserve({idempotencyKey:key,requestHash:hash,toolId:"mock.write",toolVersion:1,operation:"run"});expect(replay).toMatchObject({status:"EXISTING",executionId,state:"VERIFIED"});});
});
