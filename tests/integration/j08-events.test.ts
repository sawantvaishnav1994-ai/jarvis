import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@jarvis/config";
import { FileSecretManager } from "@jarvis/security";
import { databasePool,PostgresEventStore,type DatabasePool } from "@jarvis/storage";
import { MemoryEventTransport,OutboxDispatcher,type JarvisEventEnvelope } from "@jarvis/events";

let pool:DatabasePool;const config=await loadConfig("config/development.json"),owner="j08-owner-"+randomUUID();
const event=():JarvisEventEnvelope=>({eventId:randomUUID(),eventType:"system.integration",schemaVersion:1,occurredAt:new Date().toISOString(),receivedAt:new Date().toISOString(),ownerId:owner,projectId:"jarvis",correlationId:"j08-integration",producerId:"j08-test",producerType:"SYSTEM",subject:"integration",payload:{reference:"safe"},payloadClassification:"D1",privacy:"private-cloud",chainDepth:0});
beforeAll(async()=>{const actor={id:"j08-integration",kind:"service" as const,environment:"development" as const,ownerId:null},manager=new FileSecretManager(process.env.JARVIS_VAULT_FILE??".jarvis/development/vault.json",process.env.JARVIS_MASTER_KEY_FILE??resolve(homedir(),".config/jarvis/typescript/development/master.key"),"development",actor.id,new Set([config.storage.postgres.passwordRef])),lease=await manager.lease(config.storage.postgres.passwordRef,actor);pool=databasePool(config.storage.postgres,lease.value.toString("utf8"));lease.destroy();await pool.query("SELECT 1");});
afterAll(async()=>{if(pool){await pool.query(`DELETE FROM events.event_log WHERE owner_id=$1`,[owner]);await pool.end();}});
describe("J0.8 PostgreSQL durability",()=>{
 it("J0.8-C — Durable transactional outbox",async()=>{const store=new PostgresEventStore(pool),e=event();expect(await store.accept(e)).toBe("accepted");const r=await pool.query(`SELECT e.event_id,o.state FROM events.event_log e JOIN events.outbox o USING(event_id) WHERE e.event_id=$1`,[e.eventId]);expect(r.rowCount).toBe(1);expect(r.rows[0].state).toBe("PENDING");expect(await store.accept(e)).toBe("duplicate");const count=await pool.query(`SELECT count(*) n FROM events.outbox WHERE event_id=$1`,[e.eventId]);expect(Number(count.rows[0].n)).toBe(1);});
 it("J0.8-R — Outage and crash recovery",async()=>{const store=new PostgresEventStore(pool),e=event();await store.accept(e);const transport=new MemoryEventTransport();transport.available=false;const dispatcher=new OutboxDispatcher(store,transport,0);expect((await dispatcher.dispatch()).released).toBeGreaterThanOrEqual(1);transport.available=true;expect((await dispatcher.dispatch()).published).toBeGreaterThanOrEqual(1);expect(transport.published.some(v=>v.eventId===e.eventId)).toBe(true);expect(await store.claimInbox(e.eventId,"consumer")).toBe("claimed");await store.completeInbox(e.eventId,"consumer");expect(await store.claimInbox(e.eventId,"consumer")).toBe("completed");});
});
