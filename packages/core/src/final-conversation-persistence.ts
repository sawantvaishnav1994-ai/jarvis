import { BoundaryError } from "@jarvis/shared";
import type {
    ConversationAuthority,
    ConversationSessionEngine,
    ConversationTurn,
} from "./conversation-session.js";
import type {
    ConversationHistoryService,
    ConversationTerminalState,
} from "./conversation-history.js";

export interface J112GovernedConversationRecordPort {
    persistConversation(input: {
        ownerId: string;
        actorId: string;
        conversationId: string;
        projectId: string | null;
        classification: "D0" | "D1" | "D2" | "D3" | "D4";
        title: string;
        participants: readonly string[];
    }): Promise<{ id: string; stored: boolean }>;
    persistMessage(input: {
        ownerId: string;
        actorId: string;
        messageId: string;
        conversationId: string;
        authorId: string;
        content: string;
        role: "user" | "assistant" | "system" | "tool";
        classification: "D0" | "D1" | "D2" | "D3" | "D4";
        model: { provider: string; model: string } | null;
    }): Promise<{ id: string; stored: boolean }>;
}

export type J112DurableTurn = {
    ownerId: string;
    actorId: string;
    conversationId: string;
    conversationSessionId: string;
    turn: ConversationTurn;
    inputMessageId: string;
};

function requireStored(
    result: { id: string; stored: boolean },
    expectedId: string,
    code: string,
): void {
    if (!result.stored || result.id !== expectedId) throw new BoundaryError(code);
}

export class J112ConversationPersistenceCoordinator {
    constructor(
        private readonly records: J112GovernedConversationRecordPort,
        private readonly sessions: ConversationSessionEngine,
        private readonly history: ConversationHistoryService,
    ) {}

    async beginDurableTurn(input: {
        authority: ConversationAuthority;
        conversationSessionId: string;
        conversationId: string;
        inputMessageId: string;
        message: string;
        projectId: string | null;
        classification: "D0" | "D1" | "D2" | "D3" | "D4";
        idempotencyKey: string;
        correlationId: string;
    }): Promise<J112DurableTurn> {
        const conversation = await this.records.persistConversation({
            ownerId: input.authority.ownerId,
            actorId: input.authority.actorId,
            conversationId: input.conversationId,
            projectId: input.projectId,
            classification: input.classification,
            title: "JARVIS conversation",
            participants: [input.authority.ownerId],
        });
        requireStored(
            conversation,
            input.conversationId,
            "J112_CONVERSATION_NOT_DURABLE",
        );

        await this.history.registerConversation({
            ownerId: input.authority.ownerId,
            conversationId: input.conversationId,
            projectId: input.projectId,
            securityEpoch: input.authority.securityEpoch,
        });

        const message = await this.records.persistMessage({
            ownerId: input.authority.ownerId,
            actorId: input.authority.actorId,
            messageId: input.inputMessageId,
            conversationId: input.conversationId,
            authorId: input.authority.ownerId,
            content: input.message,
            role: "user",
            classification: input.classification,
            model: null,
        });
        requireStored(message, input.inputMessageId, "J112_MESSAGE_NOT_DURABLE");

        const turn = await this.sessions.acceptTurn({
            authority: input.authority,
            sessionId: input.conversationSessionId,
            conversationId: input.conversationId,
            inputMessageId: input.inputMessageId,
            idempotencyKey: input.idempotencyKey,
            correlationId: input.correlationId,
        });

        await this.history.appendMessage({
            ownerId: input.authority.ownerId,
            messageId: input.inputMessageId,
            conversationId: input.conversationId,
            turnId: turn.id,
            role: "user",
            content: input.message,
        });

        return {
            ownerId: input.authority.ownerId,
            actorId: input.authority.actorId,
            conversationId: input.conversationId,
            conversationSessionId: input.conversationSessionId,
            turn,
            inputMessageId: input.inputMessageId,
        };
    }

    async commitDurableTurn(input: {
        durableTurn: J112DurableTurn;
        authority: ConversationAuthority;
        responseMessageId: string | null;
        response: string | null;
        terminalState: ConversationTerminalState;
        inputDigest: string;
        contextDigest: string | null;
        modelDigest: string | null;
        responseDigest: string | null;
        model: { provider: string; model: string } | null;
        classification: "D0" | "D1" | "D2" | "D3" | "D4";
    }): Promise<void> {
        const { durableTurn, authority } = input;
        if (
            durableTurn.ownerId !== authority.ownerId ||
            durableTurn.actorId !== authority.actorId ||
            durableTurn.conversationSessionId === authority.identitySessionId ||
            durableTurn.turn.sessionId !== durableTurn.conversationSessionId ||
            durableTurn.turn.conversationId !== durableTurn.conversationId
        )
            throw new BoundaryError("J112_PERSISTENCE_BINDING_INVALID");

        if (input.response !== null) {
            if (!input.responseMessageId)
                throw new BoundaryError("J112_RESPONSE_MESSAGE_REQUIRED");
            const response = await this.records.persistMessage({
                ownerId: authority.ownerId,
                actorId: authority.actorId,
                messageId: input.responseMessageId,
                conversationId: durableTurn.conversationId,
                authorId: "jarvis",
                content: input.response,
                role: "assistant",
                classification: input.classification,
                model: input.model,
            });
            requireStored(
                response,
                input.responseMessageId,
                "J112_RESPONSE_NOT_DURABLE",
            );
            await this.history.appendMessage({
                ownerId: authority.ownerId,
                messageId: input.responseMessageId,
                conversationId: durableTurn.conversationId,
                turnId: durableTurn.turn.id,
                role: "assistant",
                content: input.response,
            });
        } else if (input.responseMessageId !== null) {
            throw new BoundaryError("J112_RESPONSE_BINDING_INVALID");
        }

        await this.history.persistTurnResult({
            ownerId: authority.ownerId,
            turnId: durableTurn.turn.id,
            responseMessageId: input.responseMessageId,
            terminalState: input.terminalState,
            inputDigest: input.inputDigest,
            contextDigest: input.contextDigest,
            modelDigest: input.modelDigest,
            responseDigest: input.responseDigest,
        });
    }
}
