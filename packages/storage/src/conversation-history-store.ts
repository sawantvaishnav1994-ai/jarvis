import type pg from "pg";
import { BoundaryError } from "@jarvis/shared";

type HistoryState = "ACTIVE" | "ARCHIVED";
type HistoryRole = "user" | "assistant" | "system" | "tool";
type TerminalState =
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | "REVOKED"
    | "TIMED_OUT"
    | "SAFE_MODE_BLOCKED"
    | "EMERGENCY_STOPPED";

type Conversation = {
    ownerId: string;
    conversationId: string;
    projectId: string | null;
    securityEpoch: number;
    state: HistoryState;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    version: number;
};
type Message = {
    ownerId: string;
    messageId: string;
    conversationId: string;
    turnId: string | null;
    role: HistoryRole;
    ordinal: number;
    contentDigest: string;
    createdAt: string;
};
type TurnResult = {
    ownerId: string;
    turnId: string;
    responseMessageId: string | null;
    terminalState: TerminalState;
    inputDigest: string;
    contextDigest: string | null;
    modelDigest: string | null;
    responseDigest: string | null;
    completedAt: string;
};
type ConversationRow = {
    owner_id: string;
    conversation_id: string;
    project_id: string | null;
    security_epoch: number | string;
    state: HistoryState;
    created_at: Date | string;
    updated_at: Date | string;
    archived_at: Date | string | null;
    version: number;
};
type MessageRow = {
    owner_id: string;
    message_id: string;
    conversation_id: string;
    turn_id: string | null;
    role: HistoryRole;
    ordinal: number | string;
    content_digest: string;
    created_at: Date | string;
};
type TurnResultRow = {
    owner_id: string;
    turn_id: string;
    response_message_id: string | null;
    terminal_state: TerminalState;
    input_digest: string;
    context_digest: string | null;
    model_digest: string | null;
    response_digest: string | null;
    completed_at: Date | string;
};

function iso(value: Date | string): string {
    return new Date(value).toISOString();
}
const conversationFrom = (row: ConversationRow): Conversation => ({
    ownerId: row.owner_id,
    conversationId: row.conversation_id,
    projectId: row.project_id,
    securityEpoch: Number(row.security_epoch),
    state: row.state,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    archivedAt: row.archived_at === null ? null : iso(row.archived_at),
    version: row.version,
});
const messageFrom = (row: MessageRow): Message => ({
    ownerId: row.owner_id,
    messageId: row.message_id,
    conversationId: row.conversation_id,
    turnId: row.turn_id,
    role: row.role,
    ordinal: Number(row.ordinal),
    contentDigest: row.content_digest,
    createdAt: iso(row.created_at),
});
const resultFrom = (row: TurnResultRow): TurnResult => ({
    ownerId: row.owner_id,
    turnId: row.turn_id,
    responseMessageId: row.response_message_id,
    terminalState: row.terminal_state,
    inputDigest: row.input_digest,
    contextDigest: row.context_digest,
    modelDigest: row.model_digest,
    responseDigest: row.response_digest,
    completedAt: iso(row.completed_at),
});
function code(error: unknown): string | null {
    return typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
        ? error.code
        : null;
}
function sameTurnResult(a: TurnResult, b: Omit<TurnResult, "completedAt">) {
    return (
        a.ownerId === b.ownerId &&
        a.turnId === b.turnId &&
        a.responseMessageId === b.responseMessageId &&
        a.terminalState === b.terminalState &&
        a.inputDigest === b.inputDigest &&
        a.contextDigest === b.contextDigest &&
        a.modelDigest === b.modelDigest &&
        a.responseDigest === b.responseDigest
    );
}

export class PostgresConversationHistoryRepository {
    constructor(private readonly pool: pg.Pool) {}

    async registerConversation(input: {
        ownerId: string;
        conversationId: string;
        projectId: string | null;
        securityEpoch: number;
    }): Promise<Conversation> {
        const existing = await this.getConversation(
            input.ownerId,
            input.conversationId,
        );
        if (existing) {
            if (
                existing.projectId !== input.projectId ||
                existing.securityEpoch !== input.securityEpoch
            )
                throw new BoundaryError("J15_CONVERSATION_BINDING_CONFLICT");
            return existing;
        }
        try {
            const result = await this.pool.query<ConversationRow>(
                "INSERT INTO conversations.history_conversations(owner_id,conversation_id,project_id,security_epoch,state) VALUES($1,$2,$3,$4,'ACTIVE') RETURNING *",
                [
                    input.ownerId,
                    input.conversationId,
                    input.projectId,
                    input.securityEpoch,
                ],
            );
            return conversationFrom(result.rows[0]!);
        } catch (error) {
            if (code(error) === "23503")
                throw new BoundaryError("J15_CONVERSATION_BINDING_INVALID");
            throw error;
        }
    }

    async getConversation(
        ownerId: string,
        conversationId: string,
    ): Promise<Conversation | null> {
        const result = await this.pool.query<ConversationRow>(
            "SELECT * FROM conversations.history_conversations WHERE owner_id=$1 AND conversation_id=$2",
            [ownerId, conversationId],
        );
        return result.rows[0] ? conversationFrom(result.rows[0]) : null;
    }

    async archiveConversation(
        ownerId: string,
        conversationId: string,
        expectedVersion: number,
    ): Promise<Conversation> {
        const result = await this.pool.query<ConversationRow>(
            "UPDATE conversations.history_conversations SET state='ARCHIVED',archived_at=COALESCE(archived_at,now()),updated_at=now(),version=version+1 WHERE owner_id=$1 AND conversation_id=$2 AND version=$3 RETURNING *",
            [ownerId, conversationId, expectedVersion],
        );
        if (result.rowCount !== 1)
            throw new BoundaryError("J15_CONVERSATION_VERSION_CONFLICT");
        return conversationFrom(result.rows[0]!);
    }

    async appendMessage(input: {
        ownerId: string;
        messageId: string;
        conversationId: string;
        turnId: string | null;
        role: HistoryRole;
        contentDigest: string;
    }): Promise<Message> {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const conversation = await client.query<ConversationRow>(
                "SELECT * FROM conversations.history_conversations WHERE owner_id=$1 AND conversation_id=$2 FOR UPDATE",
                [input.ownerId, input.conversationId],
            );
            if (!conversation.rows[0])
                throw new BoundaryError("J15_CONVERSATION_NOT_FOUND");
            if (conversation.rows[0].state !== "ACTIVE")
                throw new BoundaryError("J15_CONVERSATION_ARCHIVED");
            const existing = await client.query<MessageRow>(
                "SELECT * FROM conversations.history_messages WHERE owner_id=$1 AND message_id=$2",
                [input.ownerId, input.messageId],
            );
            if (existing.rows[0]) {
                const found = messageFrom(existing.rows[0]);
                if (
                    found.conversationId !== input.conversationId ||
                    found.turnId !== input.turnId ||
                    found.role !== input.role ||
                    found.contentDigest !== input.contentDigest
                )
                    throw new BoundaryError("J15_MESSAGE_IDEMPOTENCY_CONFLICT");
                await client.query("COMMIT");
                return found;
            }
            const ordinal = await client.query<{ ordinal: number | string }>(
                "SELECT COALESCE(MAX(ordinal),0)+1 AS ordinal FROM conversations.history_messages WHERE owner_id=$1 AND conversation_id=$2",
                [input.ownerId, input.conversationId],
            );
            const inserted = await client.query<MessageRow>(
                "INSERT INTO conversations.history_messages(owner_id,message_id,conversation_id,turn_id,role,ordinal,content_digest) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
                [
                    input.ownerId,
                    input.messageId,
                    input.conversationId,
                    input.turnId,
                    input.role,
                    Number(ordinal.rows[0]!.ordinal),
                    input.contentDigest,
                ],
            );
            await client.query(
                "UPDATE conversations.history_conversations SET updated_at=now(),version=version+1 WHERE owner_id=$1 AND conversation_id=$2",
                [input.ownerId, input.conversationId],
            );
            await client.query("COMMIT");
            return messageFrom(inserted.rows[0]!);
        } catch (error) {
            await client.query("ROLLBACK").catch(() => {});
            if (code(error) === "23503")
                throw new BoundaryError("J15_MESSAGE_BINDING_INVALID");
            if (code(error) === "23505")
                throw new BoundaryError("J15_MESSAGE_IDEMPOTENCY_CONFLICT");
            throw error;
        } finally {
            client.release();
        }
    }

    async listConversations(input: {
        ownerId: string;
        limit: number;
        cursor: { updatedAt: string; conversationId: string } | null;
        includeArchived: boolean;
    }): Promise<Conversation[]> {
        const result = input.cursor
            ? await this.pool.query<ConversationRow>(
                  "SELECT * FROM conversations.history_conversations WHERE owner_id=$1 AND ($2 OR state='ACTIVE') AND (updated_at,conversation_id)<($3::timestamptz,$4::uuid) ORDER BY updated_at DESC,conversation_id DESC LIMIT $5",
                  [
                      input.ownerId,
                      input.includeArchived,
                      input.cursor.updatedAt,
                      input.cursor.conversationId,
                      input.limit,
                  ],
              )
            : await this.pool.query<ConversationRow>(
                  "SELECT * FROM conversations.history_conversations WHERE owner_id=$1 AND ($2 OR state='ACTIVE') ORDER BY updated_at DESC,conversation_id DESC LIMIT $3",
                  [input.ownerId, input.includeArchived, input.limit],
              );
        return result.rows.map(conversationFrom);
    }

    async listMessages(input: {
        ownerId: string;
        conversationId: string;
        afterOrdinal: number;
        limit: number;
    }): Promise<Message[]> {
        const result = await this.pool.query<MessageRow>(
            "SELECT * FROM conversations.history_messages WHERE owner_id=$1 AND conversation_id=$2 AND ordinal>$3 ORDER BY ordinal ASC LIMIT $4",
            [
                input.ownerId,
                input.conversationId,
                input.afterOrdinal,
                input.limit,
            ],
        );
        return result.rows.map(messageFrom);
    }

    async persistTurnResult(
        input: Omit<TurnResult, "completedAt">,
    ): Promise<TurnResult> {
        const existing = await this.getTurnResult(input.ownerId, input.turnId);
        if (existing) {
            if (!sameTurnResult(existing, input))
                throw new BoundaryError("J15_TURN_RESULT_CONFLICT");
            return existing;
        }
        try {
            const result = await this.pool.query<TurnResultRow>(
                "INSERT INTO conversations.turn_results(owner_id,turn_id,response_message_id,terminal_state,input_digest,context_digest,model_digest,response_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
                [
                    input.ownerId,
                    input.turnId,
                    input.responseMessageId,
                    input.terminalState,
                    input.inputDigest,
                    input.contextDigest,
                    input.modelDigest,
                    input.responseDigest,
                ],
            );
            return resultFrom(result.rows[0]!);
        } catch (error) {
            if (code(error) === "23503")
                throw new BoundaryError("J15_TURN_RESULT_BINDING_INVALID");
            if (code(error) === "23505")
                throw new BoundaryError("J15_TURN_RESULT_CONFLICT");
            throw error;
        }
    }

    async getTurnResult(
        ownerId: string,
        turnId: string,
    ): Promise<TurnResult | null> {
        const result = await this.pool.query<TurnResultRow>(
            "SELECT * FROM conversations.turn_results WHERE owner_id=$1 AND turn_id=$2",
            [ownerId, turnId],
        );
        return result.rows[0] ? resultFrom(result.rows[0]) : null;
    }
}
