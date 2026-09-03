import type pg from "pg";
import { EventSubscriptionSchema, type EventSubscription } from "@jarvis/events";

export class PostgresEventSubscriptionRepository{
  constructor(private pool:pg.Pool){}
  async save(input:EventSubscription){const s=EventSubscriptionSchema.parse(input);await this.pool.query(`INSERT INTO events.subscriptions(subscription_id,consumer_id,consumer_type,event_type,owner_id,project_id,boundary,max_classification,enabled,max_attempts,base_backoff_ms,ordered,dead_letter) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(subscription_id) DO UPDATE SET consumer_id=EXCLUDED.consumer_id,consumer_type=EXCLUDED.consumer_type,event_type=EXCLUDED.event_type,owner_id=EXCLUDED.owner_id,project_id=EXCLUDED.project_id,boundary=EXCLUDED.boundary,max_classification=EXCLUDED.max_classification,enabled=EXCLUDED.enabled,max_attempts=EXCLUDED.max_attempts,base_backoff_ms=EXCLUDED.base_backoff_ms,ordered=EXCLUDED.ordered,dead_letter=EXCLUDED.dead_letter,updated_at=now()`,[s.subscriptionId,s.consumerId,s.consumerType,s.eventType,s.ownerId,s.projectId??null,s.boundary,s.maxClassification,s.enabled,s.maxAttempts,s.baseBackoffMs,s.ordered,s.deadLetter]);return s;}
  async list(ownerId:string){const r=await this.pool.query(`SELECT * FROM events.subscriptions WHERE owner_id=$1 ORDER BY subscription_id`,[ownerId]);return r.rows.map(x=>EventSubscriptionSchema.parse({subscriptionId:x.subscription_id,consumerId:x.consumer_id,consumerType:x.consumer_type,eventType:x.event_type,ownerId:x.owner_id,...(x.project_id?{projectId:x.project_id}:{}),boundary:x.boundary,maxClassification:x.max_classification,enabled:x.enabled,maxAttempts:x.max_attempts,baseBackoffMs:x.base_backoff_ms,ordered:x.ordered,deadLetter:x.dead_letter}));}
  async setEnabled(ownerId:string,subscriptionId:string,enabled:boolean){const r=await this.pool.query(`UPDATE events.subscriptions SET enabled=$3,updated_at=now() WHERE owner_id=$1 AND subscription_id=$2 RETURNING subscription_id`,[ownerId,subscriptionId,enabled]);return (r.rowCount??0)>0;}
}

export class PostgresEventDeliveryRepository{
  constructor(private pool:pg.Pool){}
  async start(eventId:string,consumerId:string,attempt:number){const r=await this.pool.query(`INSERT INTO events.delivery_attempts(event_id,consumer_id,attempt,state) VALUES($1,$2,$3,'PROCESSING') RETURNING attempt_id`,[eventId,consumerId,attempt]);return Number(r.rows[0].attempt_id);}
  async finish(attemptId:number,state:"COMPLETED"|"FAILED"|"RETRY_SCHEDULED"|"CANCELLED",errorCode?:string){await this.pool.query(`UPDATE events.delivery_attempts SET state=$2,error_code=$3,finished_at=now() WHERE attempt_id=$1`,[attemptId,state,errorCode??null]);}
}
