import type pg from "pg";
import { BoundaryError } from "@jarvis/shared";

type SessionState = "ACTIVE" | "REVOKED" | "CLOSED" | "CANCELLED";
type OperatingMode =
    | "assistant"
    | "copilot"
    | "autonomous"
    | "focus"
    | "private"
    | "guest"
    | "safe"
    | "emergency";
type TurnState =
    | "accepted"
    | "assembling_context"
    | "awaiting_model"
    | "streaming"
    | "awaiting_approval"
    | "executing_tool"
    | "resuming"
    | "completed"
    | "failed"
    | "cancelled";

type Session = {
    id: string;
    ownerId: string;
    actorId: string;
    deviceId: string;
    identitySessionId: string;
    securityEpoch: number;
    operatingMode: OperatingMode;
    state: SessionState;
    version: number;
};

type SessionRow = {
    id: string;
    owner_id: string;
    actor_id: string;
    device_id: string;
    identity_session_id: string;
    security_epoch: number | string;
    operating_mode: OperatingMode;
    state: SessionState;
    version: number;
};

type Turn = {
    id: string;
    ownerId: string;
    conversationId: string;
    sessionId: string;
    inputMessageId: string | null;
    state: TurnState;
    idempotencyKey: string;
    correlationId: string;
    reasonCode: string | null;
    version: number;
};

type TurnRow = {
    id: string;
    owner_id: string;
    conversation_id: string;
    session_id: string;
    input_message_id: string | null;
    state: TurnState;
    idempotency_key: string;
    correlation_id: string;
    reason_code: string | null;
    version: number;
};

const sessionFrom = (row: SessionRow): Session => ({
    id: row.id,
    ownerId: row.owner_id,
    actorId: row.actor_id,
    deviceId: row.device_id,
    identitySessionId: row.identity_session_id,
    securityEpoch: Number(row.security_epoch),
    operatingMode: row.operating_mode,
    state: row.state,
    version: row.version,
});

const turnFrom = (row: TurnRow): Turn => ({
    id: row.id,
    ownerId: row.owner_id,
    conversationId: row.conversation_id,
    sessionId: row.session_id,
    inputMessageId: row.input_message_id,
    state: row.state,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    reasonCode: row.reason_code,
    version: row.version,
});

function postgresErrorCode(error: unknown): string | null {
    if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
    ) {
        return error.code;
    }
    return null;
}

function postgresConstraint(error: unknown): string | null {
    if (
        typeof error === "object" &&
        error !== null &&
        "constraint" in error &&
        typeof error.constraint === "string"
    ) {
        return error.constraint;
    }
    return null;
}

function classifySessionStorageError(error: unknown): BoundaryError | null {
    switch (postgresErrorCode(error)) {
        case "23503": {
            const constraint = postgresConstraint(error);
            if (constraint?.endsWith("owner_id_fkey"))
                return new BoundaryError(
                    "CONVERSATION_OWNER_REFERENCE_INVALID",
                );
            if (constraint?.endsWith("device_id_fkey"))
                return new BoundaryError(
                    "CONVERSATION_DEVICE_REFERENCE_INVALID",
                );
            if (constraint?.endsWith("identity_session_id_fkey"))
                return new BoundaryError(
                    "CONVERSATION_IDENTITY_SESSION_REFERENCE_INVALID",
                );
            return new BoundaryError("CONVERSATION_SESSION_REFERENCE_INVALID");
        }
        case "42501":
            return new BoundaryError("CONVERSATION_SESSION_STORAGE_DENIED");
        case "42P01":
            return new BoundaryError(
                "CONVERSATION_SESSION_STORAGE_UNAVAILABLE",
            );
        case "22P02":
            return new BoundaryError("CONVERSATION_SESSION_STORAGE_INVALID");
        default:
            return null;
    }
}

function sameSessionBinding(a: Session, b: Session): boolean {
    return (
        a.ownerId === b.ownerId &&
        a.actorId === b.actorId &&
        a.deviceId === b.deviceId &&
        a.identitySessionId === b.identitySessionId &&
        a.securityEpoch === b.securityEpoch &&
        a.operatingMode === b.operatingMode &&
        a.state === b.state
    );
}

export class PostgresConversationSessionRepository {
    constructor(private readonly pool: pg.Pool) {}

    async createSession(session: Session): Promise<Session> {
        try {
            const result = await this.pool.query<SessionRow>(
                "INSERT INTO conversations.sessions(id,owner_id,actor_id,device_id,identity_session_id,security_epoch,operating_mode,state,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
                [
                    session.id,
                    session.ownerId,
                    session.actorId,
                    session.deviceId,
                    session.identitySessionId,
                    session.securityEpoch,
                    session.operatingMode,
                    session.state,
                    session.version,
                ],
            );
            return sessionFrom(result.rows[0]!);
        } catch (error: unknown) {
            const code = postgresErrorCode(error);
            if (code !== "23505") {
                const classified = classifySessionStorageError(error);
                if (classified) throw classified;
                throw error;
            }
            const existing = await this.pool.query<SessionRow>(
                "SELECT * FROM conversations.sessions WHERE owner_id=$1 AND identity_session_id=$2 AND device_id=$3",
                [session.ownerId, session.identitySessionId, session.deviceId],
            );
            const found = existing.rows[0]
                ? sessionFrom(existing.rows[0])
                : null;
            if (!found || !sameSessionBinding(found, session))
                throw new BoundaryError("CONVERSATION_SESSION_CONFLICT");
            return found;
        }
    }

    async getSession(ownerId: string, id: string): Promise<Session | null> {
        const result = await this.pool.query<SessionRow>(
            "SELECT * FROM conversations.sessions WHERE owner_id=$1 AND id=$2",
            [ownerId, id],
        );
        return result.rows[0] ? sessionFrom(result.rows[0]) : null;
    }

    async updateSessionState(
        ownerId: string,
        id: string,
        expectedVersion: number,
        state: Session["state"],
    ): Promise<Session> {
        const result = await this.pool.query<SessionRow>(
            "UPDATE conversations.sessions SET state=$4,version=version+1,last_seen_at=now(),revoked_at=CASE WHEN $4='REVOKED' THEN now() ELSE revoked_at END,cancelled_at=CASE WHEN $4='CANCELLED' THEN now() ELSE cancelled_at END WHERE owner_id=$1 AND id=$2 AND version=$3 RETURNING *",
            [ownerId, id, expectedVersion, state],
        );
        if (result.rowCount !== 1)
            throw new BoundaryError("CONVERSATION_SESSION_CONFLICT");
        return sessionFrom(result.rows[0]!);
    }

    async createTurn(turn: Turn): Promise<Turn> {
        try {
            const result = await this.pool.query<TurnRow>(
                "INSERT INTO conversations.turns(id,owner_id,conversation_id,session_id,input_message_id,state,idempotency_key,correlation_id,reason_code,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
                [
                    turn.id,
                    turn.ownerId,
                    turn.conversationId,
                    turn.sessionId,
                    turn.inputMessageId,
                    turn.state,
                    turn.idempotencyKey,
                    turn.correlationId,
                    turn.reasonCode,
                    turn.version,
                ],
            );
            return turnFrom(result.rows[0]!);
        } catch (error: unknown) {
            if (postgresErrorCode(error) === "23505")
                throw new BoundaryError("CONVERSATION_IDEMPOTENCY_CONFLICT");
            throw error;
        }
    }

    async getTurn(ownerId: string, id: string): Promise<Turn | null> {
        const result = await this.pool.query<TurnRow>(
            "SELECT * FROM conversations.turns WHERE owner_id=$1 AND id=$2",
            [ownerId, id],
        );
        return result.rows[0] ? turnFrom(result.rows[0]) : null;
    }

    async transitionTurn(
        ownerId: string,
        id: string,
        expectedVersion: number,
        state: TurnState,
        reasonCode: string | null,
    ): Promise<Turn> {
        const terminal = ["completed", "failed", "cancelled"].includes(state);
        const result = await this.pool.query<TurnRow>(
            "UPDATE conversations.turns SET state=$4,reason_code=$5,version=version+1,completed_at=CASE WHEN $6 THEN now() ELSE completed_at END WHERE owner_id=$1 AND id=$2 AND version=$3 RETURNING *",
            [ownerId, id, expectedVersion, state, reasonCode, terminal],
        );
        if (result.rowCount !== 1)
            throw new BoundaryError("CONVERSATION_TURN_CONFLICT");
        return turnFrom(result.rows[0]!);
    }
}
