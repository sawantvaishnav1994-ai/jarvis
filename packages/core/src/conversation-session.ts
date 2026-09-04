import { randomUUID } from "node:crypto";
import { z } from "zod";
import { BoundaryError } from "@jarvis/shared";

const Id = z.string().min(1).max(128);
export const ConversationOperatingModeSchema = z.enum([
    "assistant",
    "copilot",
    "autonomous",
    "focus",
    "private",
    "guest",
    "safe",
    "emergency",
]);
export const ConversationSessionStateSchema = z.enum([
    "ACTIVE",
    "REVOKED",
    "CLOSED",
    "CANCELLED",
]);
export const TurnStateSchema = z.enum([
    "accepted",
    "assembling_context",
    "awaiting_model",
    "streaming",
    "awaiting_approval",
    "executing_tool",
    "resuming",
    "completed",
    "failed",
    "cancelled",
]);
export type TurnState = z.infer<typeof TurnStateSchema>;
export const ConversationAuthoritySchema = z.strictObject({
    ownerId: Id,
    actorId: Id,
    deviceId: Id,
    identitySessionId: Id,
    securityEpoch: z.number().int().nonnegative(),
    operatingMode: ConversationOperatingModeSchema,
});
export type ConversationAuthority = z.infer<typeof ConversationAuthoritySchema>;
export const ConversationSessionSchema = ConversationAuthoritySchema.extend({
    id: z.uuid(),
    state: ConversationSessionStateSchema,
    version: z.number().int().positive(),
});
export type ConversationSession = z.infer<typeof ConversationSessionSchema>;
export const ConversationTurnSchema = z.strictObject({
    id: z.uuid(),
    ownerId: Id,
    conversationId: z.uuid(),
    sessionId: z.uuid(),
    inputMessageId: z.uuid().nullable(),
    state: TurnStateSchema,
    idempotencyKey: Id,
    correlationId: Id,
    reasonCode: Id.nullable(),
    version: z.number().int().positive(),
});
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

const transitions: Record<TurnState, readonly TurnState[]> = {
    accepted: ["assembling_context", "failed", "cancelled"],
    assembling_context: ["awaiting_model", "failed", "cancelled"],
    awaiting_model: ["streaming", "awaiting_approval", "failed", "cancelled"],
    streaming: ["completed", "awaiting_approval", "failed", "cancelled"],
    awaiting_approval: ["executing_tool", "resuming", "failed", "cancelled"],
    executing_tool: ["resuming", "failed", "cancelled"],
    resuming: ["awaiting_model", "streaming", "completed", "failed", "cancelled"],
    completed: [],
    failed: [],
    cancelled: [],
};
export function assertTurnTransition(from: TurnState, to: TurnState) {
    if (from === to) return;
    if (!transitions[from].includes(to))
        throw new BoundaryError("CONVERSATION_TURN_TRANSITION_DENIED");
}

export interface ConversationSessionRepository {
    createSession(session: ConversationSession): Promise<ConversationSession>;
    getSession(ownerId: string, sessionId: string): Promise<ConversationSession | null>;
    updateSessionState(ownerId: string, sessionId: string, expectedVersion: number, state: z.infer<typeof ConversationSessionStateSchema>): Promise<ConversationSession>;
    createTurn(turn: ConversationTurn): Promise<ConversationTurn>;
    getTurn(ownerId: string, turnId: string): Promise<ConversationTurn | null>;
    transitionTurn(ownerId: string, turnId: string, expectedVersion: number, state: TurnState, reasonCode: string | null): Promise<ConversationTurn>;
}

export type ConversationAuthorityVerifier = (
    authority: ConversationAuthority,
) => Promise<boolean>;

export class ConversationSessionEngine {
    constructor(
        private readonly repository: ConversationSessionRepository,
        private readonly authorityValid: ConversationAuthorityVerifier,
    ) {}

    private async requireAuthority(authority: ConversationAuthority) {
        const a = ConversationAuthoritySchema.parse(authority);
        if (!(await this.authorityValid(a)))
            throw new BoundaryError("CONVERSATION_AUTHORITY_INVALID");
        return a;
    }

    async openSession(authority: ConversationAuthority) {
        const a = await this.requireAuthority(authority);
        return this.repository.createSession(
            ConversationSessionSchema.parse({
                ...a,
                id: randomUUID(),
                state: "ACTIVE",
                version: 1,
            }),
        );
    }

    async acceptTurn(input: {
        authority: ConversationAuthority;
        sessionId: string;
        conversationId: string;
        inputMessageId?: string | null;
        idempotencyKey: string;
        correlationId: string;
    }) {
        const authority = await this.requireAuthority(input.authority);
        const session = await this.repository.getSession(authority.ownerId, input.sessionId);
        if (
            !session ||
            session.state !== "ACTIVE" ||
            session.actorId !== authority.actorId ||
            session.deviceId !== authority.deviceId ||
            session.identitySessionId !== authority.identitySessionId ||
            session.securityEpoch !== authority.securityEpoch
        )
            throw new BoundaryError("CONVERSATION_SESSION_BINDING_INVALID");
        return this.repository.createTurn(
            ConversationTurnSchema.parse({
                id: randomUUID(),
                ownerId: authority.ownerId,
                conversationId: input.conversationId,
                sessionId: input.sessionId,
                inputMessageId: input.inputMessageId ?? null,
                state: "accepted",
                idempotencyKey: input.idempotencyKey,
                correlationId: input.correlationId,
                reasonCode: null,
                version: 1,
            }),
        );
    }

    async transition(authority: ConversationAuthority, turnId: string, to: TurnState) {
        const a = await this.requireAuthority(authority);
        const turn = await this.repository.getTurn(a.ownerId, turnId);
        if (!turn) throw new BoundaryError("CONVERSATION_TURN_NOT_FOUND");
        const session = await this.repository.getSession(a.ownerId, turn.sessionId);
        if (!session || session.state !== "ACTIVE" || session.securityEpoch !== a.securityEpoch)
            throw new BoundaryError("CONVERSATION_SESSION_STALE");
        assertTurnTransition(turn.state, to);
        return this.repository.transitionTurn(a.ownerId, turn.id, turn.version, to, null);
    }

    async cancel(authority: ConversationAuthority, turnId: string, reasonCode = "OWNER_CANCELLED") {
        const a = await this.requireAuthority(authority);
        const turn = await this.repository.getTurn(a.ownerId, turnId);
        if (!turn) throw new BoundaryError("CONVERSATION_TURN_NOT_FOUND");
        if (["completed", "failed", "cancelled"].includes(turn.state)) return turn;
        return this.repository.transitionTurn(a.ownerId, turn.id, turn.version, "cancelled", reasonCode);
    }
}
