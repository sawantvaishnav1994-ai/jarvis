import { BoundaryError } from "@jarvis/shared";

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const conversationOperatingModes = [
    "assistant",
    "copilot",
    "autonomous",
    "focus",
    "private",
    "guest",
    "safe",
    "emergency",
] as const;
export type ConversationOperatingMode =
    (typeof conversationOperatingModes)[number];

export const conversationSessionStates = [
    "ACTIVE",
    "REVOKED",
    "CLOSED",
    "CANCELLED",
] as const;
export type ConversationSessionState =
    (typeof conversationSessionStates)[number];

export const turnStates = [
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
] as const;
export type TurnState = (typeof turnStates)[number];

export type ConversationAuthority = {
    ownerId: string;
    actorId: string;
    deviceId: string;
    identitySessionId: string;
    securityEpoch: number;
    operatingMode: ConversationOperatingMode;
};
export type ConversationSession = ConversationAuthority & {
    id: string;
    state: ConversationSessionState;
    version: number;
};
export type ConversationTurn = {
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

function failInput(): never {
    throw new BoundaryError("CONVERSATION_INPUT_INVALID");
}
function requireId(value: unknown): string {
    if (typeof value !== "string" || !idPattern.test(value)) failInput();
    return value;
}
function requireUuid(value: unknown): string {
    if (typeof value !== "string" || !uuidPattern.test(value)) failInput();
    return value;
}
function requirePositiveInteger(value: unknown): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
        failInput();
    return value;
}
function requireNonnegativeInteger(value: unknown): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
        failInput();
    return value;
}
function requireMember<const T extends readonly string[]>(
    values: T,
    value: unknown,
): T[number] {
    if (typeof value !== "string" || !values.includes(value)) failInput();
    return value as T[number];
}
function requireNullableId(value: unknown): string | null {
    return value === null ? null : requireId(value);
}
function requireNullableUuid(value: unknown): string | null {
    return value === null ? null : requireUuid(value);
}
function requireObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        failInput();
    return value as Record<string, unknown>;
}

export function parseConversationAuthority(
    value: unknown,
): ConversationAuthority {
    const input = requireObject(value);
    return {
        ownerId: requireId(input.ownerId),
        actorId: requireId(input.actorId),
        deviceId: requireId(input.deviceId),
        identitySessionId: requireId(input.identitySessionId),
        securityEpoch: requireNonnegativeInteger(input.securityEpoch),
        operatingMode: requireMember(
            conversationOperatingModes,
            input.operatingMode,
        ),
    };
}
export function parseConversationSession(value: unknown): ConversationSession {
    const input = requireObject(value);
    return {
        ...parseConversationAuthority(input),
        id: requireUuid(input.id),
        state: requireMember(conversationSessionStates, input.state),
        version: requirePositiveInteger(input.version),
    };
}
export function parseConversationTurn(value: unknown): ConversationTurn {
    const input = requireObject(value);
    return {
        id: requireUuid(input.id),
        ownerId: requireId(input.ownerId),
        conversationId: requireUuid(input.conversationId),
        sessionId: requireUuid(input.sessionId),
        inputMessageId: requireNullableUuid(input.inputMessageId),
        state: requireMember(turnStates, input.state),
        idempotencyKey: requireId(input.idempotencyKey),
        correlationId: requireId(input.correlationId),
        reasonCode: requireNullableId(input.reasonCode),
        version: requirePositiveInteger(input.version),
    };
}

const transitions: Record<TurnState, readonly TurnState[]> = {
    accepted: ["assembling_context", "failed", "cancelled"],
    assembling_context: ["awaiting_model", "failed", "cancelled"],
    awaiting_model: ["streaming", "awaiting_approval", "failed", "cancelled"],
    streaming: ["completed", "awaiting_approval", "failed", "cancelled"],
    awaiting_approval: ["executing_tool", "resuming", "failed", "cancelled"],
    executing_tool: ["resuming", "failed", "cancelled"],
    resuming: [
        "awaiting_model",
        "streaming",
        "completed",
        "failed",
        "cancelled",
    ],
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
    getSession(
        ownerId: string,
        sessionId: string,
    ): Promise<ConversationSession | null>;
    updateSessionState(
        ownerId: string,
        sessionId: string,
        expectedVersion: number,
        state: ConversationSessionState,
    ): Promise<ConversationSession>;
    createTurn(turn: ConversationTurn): Promise<ConversationTurn>;
    getTurn(ownerId: string, turnId: string): Promise<ConversationTurn | null>;
    transitionTurn(
        ownerId: string,
        turnId: string,
        expectedVersion: number,
        state: TurnState,
        reasonCode: string | null,
    ): Promise<ConversationTurn>;
}

export type ConversationAuthorityVerifier = (
    authority: ConversationAuthority,
) => Promise<boolean>;
export type ConversationIdFactory = () => string;

export class ConversationSessionEngine {
    constructor(
        private readonly repository: ConversationSessionRepository,
        private readonly authorityValid: ConversationAuthorityVerifier,
        private readonly createId: ConversationIdFactory,
    ) {}

    private async requireAuthority(authority: ConversationAuthority) {
        const validated = parseConversationAuthority(authority);
        if (!(await this.authorityValid(validated)))
            throw new BoundaryError("CONVERSATION_AUTHORITY_INVALID");
        return validated;
    }

    private nextId() {
        return requireUuid(this.createId());
    }

    async openSession(authority: ConversationAuthority) {
        const validated = await this.requireAuthority(authority);
        return this.repository.createSession(
            parseConversationSession({
                ...validated,
                id: this.nextId(),
                state: "ACTIVE",
                version: 1,
            }),
        );
    }

    async verifySession(
        authority: ConversationAuthority,
        sessionId: string,
    ): Promise<ConversationSession> {
        const validated = await this.requireAuthority(authority);
        const id = requireUuid(sessionId);
        const session = await this.repository.getSession(validated.ownerId, id);
        if (
            !session ||
            session.state !== "ACTIVE" ||
            session.actorId !== validated.actorId ||
            session.deviceId !== validated.deviceId ||
            session.identitySessionId !== validated.identitySessionId ||
            session.securityEpoch !== validated.securityEpoch ||
            session.operatingMode !== validated.operatingMode
        )
            throw new BoundaryError("CONVERSATION_SESSION_BINDING_INVALID");
        return session;
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
        const sessionId = requireUuid(input.sessionId);
        const conversationId = requireUuid(input.conversationId);
        const inputMessageId = requireNullableUuid(
            input.inputMessageId ?? null,
        );
        const idempotencyKey = requireId(input.idempotencyKey);
        const correlationId = requireId(input.correlationId);
        await this.verifySession(authority, sessionId);
        return this.repository.createTurn(
            parseConversationTurn({
                id: this.nextId(),
                ownerId: authority.ownerId,
                conversationId,
                sessionId,
                inputMessageId,
                state: "accepted",
                idempotencyKey,
                correlationId,
                reasonCode: null,
                version: 1,
            }),
        );
    }

    async transition(
        authority: ConversationAuthority,
        turnId: string,
        to: TurnState,
    ) {
        const validated = await this.requireAuthority(authority);
        const validatedTurnId = requireUuid(turnId);
        const validatedState = requireMember(turnStates, to);
        const turn = await this.repository.getTurn(
            validated.ownerId,
            validatedTurnId,
        );
        if (!turn) throw new BoundaryError("CONVERSATION_TURN_NOT_FOUND");
        const session = await this.repository.getSession(
            validated.ownerId,
            turn.sessionId,
        );
        if (
            !session ||
            session.state !== "ACTIVE" ||
            session.securityEpoch !== validated.securityEpoch
        )
            throw new BoundaryError("CONVERSATION_SESSION_STALE");
        assertTurnTransition(turn.state, validatedState);
        return this.repository.transitionTurn(
            validated.ownerId,
            turn.id,
            turn.version,
            validatedState,
            null,
        );
    }

    async cancel(
        authority: ConversationAuthority,
        turnId: string,
        reasonCode = "OWNER_CANCELLED",
    ) {
        const validated = await this.requireAuthority(authority);
        const validatedTurnId = requireUuid(turnId);
        const validatedReason = requireId(reasonCode);
        const turn = await this.repository.getTurn(
            validated.ownerId,
            validatedTurnId,
        );
        if (!turn) throw new BoundaryError("CONVERSATION_TURN_NOT_FOUND");
        if (["completed", "failed", "cancelled"].includes(turn.state))
            return turn;
        return this.repository.transitionTurn(
            validated.ownerId,
            turn.id,
            turn.version,
            "cancelled",
            validatedReason,
        );
    }
}
