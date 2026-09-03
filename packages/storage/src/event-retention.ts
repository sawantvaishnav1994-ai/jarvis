import type pg from "pg";

/** J0.8 privacy retention keeps minimal event identity/evidence while removing private payload copies. */
export class PostgresEventRetentionRepository{
  constructor(private pool:pg.Pool){}
  async setRetention(ownerId:string,eventId:string,retainUntil:string){const r=await this.pool.query(`UPDATE events.event_log SET retention_until=$3 WHERE owner_id=$1 AND event_id=$2 AND payload_redacted_at IS NULL RETURNING event_id`,[ownerId,eventId,retainUntil]);return (r.rowCount??0)>0;}
  async redactExpired(now:string,limit=100){const r=await this.pool.query(`WITH due AS (SELECT event_id FROM events.event_log WHERE retention_until<=$1 AND payload_redacted_at IS NULL ORDER BY retention_until,event_id FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE events.event_log e SET payload='{}'::jsonb,subject='[redacted]',payload_redacted_at=$1 FROM due d WHERE e.event_id=d.event_id RETURNING e.event_id`,[now,limit]);return r.rows.map(x=>String(x.event_id));}
  async redactOwnerPayloads(ownerId:string,limit=1000){const r=await this.pool.query(`WITH owned AS (SELECT event_id FROM events.event_log WHERE owner_id=$1 AND payload_redacted_at IS NULL ORDER BY received_at,event_id FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE events.event_log e SET payload='{}'::jsonb,subject='[redacted]',payload_redacted_at=now() FROM owned o WHERE e.event_id=o.event_id RETURNING e.event_id`,[ownerId,limit]);return r.rows.map(x=>String(x.event_id));}
}
