import type pg from "pg";
import { BoundaryError } from "@jarvis/shared";

type Session = {
    id: string; ownerId: string; actorId: string; deviceId: string; identitySessionId: string;
    securityEpoch: number; operatingMode: string; state: "ACTIVE"|"REVOKED"|"CLOSED"|"CANCELLED"; version: number;
};
type Turn = {
    id: string; ownerId: string; conversationId: string; sessionId: string; inputMessageId: string|null;
    state: string; idempotencyKey: string; correlationId: string; reasonCode: string|null; version: number;
};
const sessionFrom = (r:any):Session => ({id:r.id,ownerId:r.owner_id,actorId:r.actor_id,deviceId:r.device_id,identitySessionId:r.identity_session_id,securityEpoch:Number(r.security_epoch),operatingMode:r.operating_mode,state:r.state,version:r.version});
const turnFrom = (r:any):Turn => ({id:r.id,ownerId:r.owner_id,conversationId:r.conversation_id,sessionId:r.session_id,inputMessageId:r.input_message_id,state:r.state,idempotencyKey:r.idempotency_key,correlationId:r.correlation_id,reasonCode:r.reason_code,version:r.version});
export class PostgresConversationSessionRepository {
    constructor(private readonly pool: pg.Pool) {}
    async createSession(s:Session):Promise<Session>{
        const q=await this.pool.query("INSERT INTO conversations.sessions(id,owner_id,actor_id,device_id,identity_session_id,security_epoch,operating_mode,state,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[s.id,s.ownerId,s.actorId,s.deviceId,s.identitySessionId,s.securityEpoch,s.operatingMode,s.state,s.version]);
        return sessionFrom(q.rows[0]);
    }
    async getSession(ownerId:string,id:string):Promise<Session|null>{const q=await this.pool.query("SELECT * FROM conversations.sessions WHERE owner_id=$1 AND id=$2",[ownerId,id]);return q.rows[0]?sessionFrom(q.rows[0]):null;}
    async updateSessionState(ownerId:string,id:string,expectedVersion:number,state:Session["state"]):Promise<Session>{
        const q=await this.pool.query("UPDATE conversations.sessions SET state=$4,version=version+1,last_seen_at=now(),revoked_at=CASE WHEN $4='REVOKED' THEN now() ELSE revoked_at END,cancelled_at=CASE WHEN $4='CANCELLED' THEN now() ELSE cancelled_at END WHERE owner_id=$1 AND id=$2 AND version=$3 RETURNING *",[ownerId,id,expectedVersion,state]);
        if(q.rowCount!==1)throw new BoundaryError("CONVERSATION_SESSION_CONFLICT"); return sessionFrom(q.rows[0]);
    }
    async createTurn(t:Turn):Promise<Turn>{try{const q=await this.pool.query("INSERT INTO conversations.turns(id,owner_id,conversation_id,session_id,input_message_id,state,idempotency_key,correlation_id,reason_code,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[t.id,t.ownerId,t.conversationId,t.sessionId,t.inputMessageId,t.state,t.idempotencyKey,t.correlationId,t.reasonCode,t.version]);return turnFrom(q.rows[0]);}catch(e:any){if(e?.code==='23505')throw new BoundaryError("CONVERSATION_IDEMPOTENCY_CONFLICT");throw e;}}
    async getTurn(ownerId:string,id:string):Promise<Turn|null>{const q=await this.pool.query("SELECT * FROM conversations.turns WHERE owner_id=$1 AND id=$2",[ownerId,id]);return q.rows[0]?turnFrom(q.rows[0]):null;}
    async transitionTurn(ownerId:string,id:string,expectedVersion:number,state:string,reasonCode:string|null):Promise<Turn>{const terminal=["completed","failed","cancelled"].includes(state);const q=await this.pool.query("UPDATE conversations.turns SET state=$4,reason_code=$5,version=version+1,completed_at=CASE WHEN $6 THEN now() ELSE completed_at END WHERE owner_id=$1 AND id=$2 AND version=$3 RETURNING *",[ownerId,id,expectedVersion,state,reasonCode,terminal]);if(q.rowCount!==1)throw new BoundaryError("CONVERSATION_TURN_CONFLICT");return turnFrom(q.rows[0]);}
}
