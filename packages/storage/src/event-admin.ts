import type pg from "pg";
import type { EventAdminStorePort, JarvisEventEnvelope } from "@jarvis/events";
import { PostgresEventStore } from "./event-store.js";

export class PostgresEventAdminRepository implements EventAdminStorePort{
  private events:PostgresEventStore;
  constructor(private pool:pg.Pool){this.events=new PostgresEventStore(pool);}
  load(eventId:string):Promise<JarvisEventEnvelope|undefined>{return this.events.load(eventId);}
  async cancelDelivery(eventId:string,consumerId:string){const current=await this.pool.query(`SELECT state FROM events.inbox WHERE event_id=$1 AND consumer_id=$2`,[eventId,consumerId]);if(current.rows[0]?.state==="COMPLETED")return "completed" as const;if(current.rowCount===0){const inserted=await this.pool.query(`INSERT INTO events.inbox(event_id,consumer_id,state) SELECT $1,$2,'CANCELLED' WHERE EXISTS(SELECT 1 FROM events.event_log WHERE event_id=$1) RETURNING state`,[eventId,consumerId]);return inserted.rowCount?"cancelled" as const:"missing" as const;}await this.pool.query(`UPDATE events.inbox SET state='CANCELLED',completed_at=now() WHERE event_id=$1 AND consumer_id=$2 AND state<>'COMPLETED'`,[eventId,consumerId]);return "cancelled" as const;}
  async cancelSchedule(scheduleId:string,ownerId:string){const r=await this.pool.query(`UPDATE events.schedules SET enabled=false,updated_at=now() WHERE schedule_id=$1 AND owner_id=$2 RETURNING schedule_id`,[scheduleId,ownerId]);return (r.rowCount??0)>0;}
  async listDeadLetters(ownerId:string,limit:number){const r=await this.pool.query(`SELECT d.event_id,d.consumer_id,d.error_code,d.attempts,d.created_at FROM events.dead_letters d JOIN events.event_log e USING(event_id) WHERE e.owner_id=$1 ORDER BY d.created_at DESC LIMIT $2`,[ownerId,limit]);return r.rows.map(x=>({eventId:String(x.event_id),consumerId:String(x.consumer_id),errorCode:String(x.error_code),attempts:Number(x.attempts),createdAt:new Date(x.created_at).toISOString()}));}
}
