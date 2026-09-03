import type pg from "pg";
import { BoundaryError } from "@jarvis/shared";
export type PostgresToolReserveInput={idempotencyKey:string;requestHash:string;toolId:string;toolVersion:number;operation:string};
export type PostgresToolCompletion={idempotencyKey?:string;executionId:string;requestId:string;correlationId:string;toolId:string;toolVersion:number;operation:string;actorId:string;source:string;inputHash:string;authorizationReference?:string;approvalReference?:string;state:string;attemptCount:number;verified:boolean;startedAt:string;completedAt:string};
export class PostgresToolEvidenceStore{
 constructor(private readonly pool:pg.Pool){}
 async reserve(input:PostgresToolReserveInput):Promise<{status:"RESERVED"|"EXISTING";executionId?:string;state?:string}>{
  const inserted=await this.pool.query<{idempotency_key:string}>("INSERT INTO tools.idempotency(idempotency_key,request_hash,tool_id,tool_version,operation) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING idempotency_key",[input.idempotencyKey,input.requestHash,input.toolId,input.toolVersion,input.operation]);
  if(inserted.rowCount===1)return{status:"RESERVED"};
  const existing=await this.pool.query<{request_hash:string;execution_id:string|null;state:string}>("SELECT request_hash,execution_id,state FROM tools.idempotency WHERE idempotency_key=$1",[input.idempotencyKey]);
  const row=existing.rows[0];if(!row)throw new BoundaryError("IDEMPOTENCY_CONFLICT");if(row.request_hash!==input.requestHash)throw new BoundaryError("IDEMPOTENCY_CONFLICT");
  return row.execution_id?{status:"EXISTING",executionId:row.execution_id,state:row.state}:{status:"EXISTING",state:row.state};
 }
 async complete(input:PostgresToolCompletion):Promise<void>{
  const client=await this.pool.connect();try{await client.query("BEGIN");await client.query("INSERT INTO tools.executions(execution_id,request_id,correlation_id,tool_id,tool_version,operation,actor_id,source,input_hash,authorization_reference,approval_reference,idempotency_key,state,attempt_count,verification_state,started_at,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (execution_id) DO NOTHING",[input.executionId,input.requestId,input.correlationId,input.toolId,input.toolVersion,input.operation,input.actorId,input.source,input.inputHash,input.authorizationReference??null,input.approvalReference??null,input.idempotencyKey??null,input.state,input.attemptCount,input.verified?"VERIFIED":"UNVERIFIED",input.startedAt,input.completedAt]);if(input.idempotencyKey)await client.query("UPDATE tools.idempotency SET execution_id=$2,state=$3,completed_at=$4 WHERE idempotency_key=$1 AND request_hash=$5",[input.idempotencyKey,input.executionId,input.state,input.completedAt,input.inputHash]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
 }
}
