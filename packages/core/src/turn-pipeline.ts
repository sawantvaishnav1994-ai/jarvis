import type { J06ModelRequest } from "@jarvis/models";
import type {
    ContextAssemblyAuthority,
    ContextAssemblyPolicy,
    ContextCandidateSource,
    ContextEnvelope,
} from "./context-assembly.js";
import type {
    J13ExecutionResult,
    J13RuntimePolicy,
} from "./model-orchestration.js";

export const j14TurnStates = [
    "ACCEPTED",
    "AUTHORITY_VALIDATING",
    "CONTEXT_ASSEMBLING",
    "MODEL_PENDING",
    "MODEL_RUNNING",
    "MODEL_RESULT_RECEIVED",
    "RESPONSE_PROCESSING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "REVOKED",
    "TIMED_OUT",
    "SAFE_MODE_BLOCKED",
    "EMERGENCY_STOPPED",
] as const;
export type J14TurnState = (typeof j14TurnStates)[number];

export type J14TerminalState = Extract<
    J14TurnState,
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | "REVOKED"
    | "TIMED_OUT"
    | "SAFE_MODE_BLOCKED"
    | "EMERGENCY_STOPPED"
>;

export type J14AuthorityReason =
    | "OK"
    | "INVALID"
    | "REVOKED"
    | "SECURITY_EPOCH_CHANGED"
    | "SAFE_MODE"
    | "FREEZE"
    | "SHUTDOWN";

export interface J14AuthorityCheck {
    valid: boolean;
    reason: J14AuthorityReason;
}

export interface J14AuthorityVerifier {
    verify(authority: ContextAssemblyAuthority):
        | J14AuthorityCheck
        | Promise<J14AuthorityCheck>;
}

export interface J14ContextPort {
    assemble(
        authority: ContextAssemblyAuthority,
        candidates: readonly ContextCandidateSource[],
        policy: ContextAssemblyPolicy,
    ): Promise<ContextEnvelope>;
}

export interface J14ModelPort {
    execute(
        input: {
            operationKey: string;
            operationDigest: string;
            authority: ContextAssemblyAuthority;
            context: ContextEnvelope;
            request: J06ModelRequest;
            policy: J13RuntimePolicy;
        },
        signal: AbortSignal,
    ): Promise<J13ExecutionResult>;
}

export interface J14AuditRecord {
    correlationId: string;
    conversationId: string;
    turnId: string;
    contextDigest: string | null;
    modelOperationDigest: string | null;
    state: J14TurnState;
    reasonCode: string | null;
}

export interface J14AuditSink {
    append(record: J14AuditRecord): void | Promise<void>;
}

export interface J14Clock {
    now(): number;
}

export interface J14TurnPipelineInput {
    authority: ContextAssemblyAuthority;
    conversationId: string;
    sessionId: string;
    turnId: string;
    correlationId: string;
    idempotencyKey: string;
    inputDigest: string;
    contextDigest: string;
    modelOperationDigest: string;
    candidates: readonly ContextCandidateSource[];
    contextPolicy: ContextAssemblyPolicy;
    modelRequest: J06ModelRequest;
    modelPolicy: J13RuntimePolicy;
}

export interface J14ResponseEvent {
    sequence: number;
    state: J14TurnState;
    kind: "state" | "content" | "terminal";
    content: string | null;
}

export interface J14TurnPipelineResult {
    correlationId: string;
    conversationId: string;
    turnId: string;
    state: J14TerminalState;
    response: string | null;
    acceptedAsContentOnly: true;
    toolExecutionCommitted: false;
    approvalCommitted: false;
    memoryWriteCommitted: false;
    events: readonly J14ResponseEvent[];
    reasonCode: string | null;
}

export class J14TurnPipelineError extends Error {
    constructor(
        readonly code: string,
        readonly terminalState: J14TerminalState = "FAILED",
    ) {
        super(code);
        this.name = "J14TurnPipelineError";
    }
}

interface CachedTurn {
    digest: string;
    promise: Promise<J14TurnPipelineResult>;
}

const DIGEST = /^[0-9a-f]{64}$/i;
const transitions: Record<J14TurnState, readonly J14TurnState[]> = {
    ACCEPTED: ["AUTHORITY_VALIDATING", "CANCELLED", "FAILED"],
    AUTHORITY_VALIDATING: [
        "CONTEXT_ASSEMBLING",
        "REVOKED",
        "SAFE_MODE_BLOCKED",
        "EMERGENCY_STOPPED",
        "CANCELLED",
        "FAILED",
    ],
    CONTEXT_ASSEMBLING: [
        "MODEL_PENDING",
        "REVOKED",
        "SAFE_MODE_BLOCKED",
        "EMERGENCY_STOPPED",
        "CANCELLED",
        "FAILED",
    ],
    MODEL_PENDING: [
        "MODEL_RUNNING",
        "REVOKED",
        "SAFE_MODE_BLOCKED",
        "EMERGENCY_STOPPED",
        "CANCELLED",
        "TIMED_OUT",
        "FAILED",
    ],
    MODEL_RUNNING: [
        "MODEL_RESULT_RECEIVED",
        "REVOKED",
        "SAFE_MODE_BLOCKED",
        "EMERGENCY_STOPPED",
        "CANCELLED",
        "TIMED_OUT",
        "FAILED",
    ],
    MODEL_RESULT_RECEIVED: [
        "RESPONSE_PROCESSING",
        "REVOKED",
        "SAFE_MODE_BLOCKED",
        "EMERGENCY_STOPPED",
        "CANCELLED",
        "FAILED",
    ],
    RESPONSE_PROCESSING: [
        "COMPLETED",
        "REVOKED",
        "SAFE_MODE_BLOCKED",
        "EMERGENCY_STOPPED",
        "CANCELLED",
        "FAILED",
    ],
    COMPLETED: [],
    FAILED: [],
    CANCELLED: [],
    REVOKED: [],
    TIMED_OUT: [],
    SAFE_MODE_BLOCKED: [],
    EMERGENCY_STOPPED: [],
};

function assertTransition(from: J14TurnState, to: J14TurnState): void {
    if (!transitions[from].includes(to))
        throw new J14TurnPipelineError("J14_TURN_TRANSITION_DENIED");
}

function requireBoundInput(input: J14TurnPipelineInput): void {
    if (
        !input.conversationId ||
        !input.sessionId ||
        !input.turnId ||
        !input.correlationId ||
        !input.idempotencyKey ||
        input.authority.conversationId !== input.conversationId ||
        input.authority.sessionId !== input.sessionId ||
        input.authority.turnId !== input.turnId ||
        !DIGEST.test(input.inputDigest) ||
        !DIGEST.test(input.contextDigest) ||
        !DIGEST.test(input.modelOperationDigest)
    )
        throw new J14TurnPipelineError("J14_TURN_BINDING_INVALID");
    if (input.modelRequest.ownerId !== input.authority.ownerId)
        throw new J14TurnPipelineError("J14_OWNER_BINDING_INVALID");
    if (
        (input.modelRequest.projectId ?? null) !==
        (input.authority.projectId ?? null)
    )
        throw new J14TurnPipelineError("J14_PROJECT_BINDING_INVALID");
}

function mapAuthorityFailure(reason: J14AuthorityReason): J14TurnPipelineError {
    if (reason === "SAFE_MODE")
        return new J14TurnPipelineError(
            "J14_SAFE_MODE_BLOCKED",
            "SAFE_MODE_BLOCKED",
        );
    if (reason === "FREEZE" || reason === "SHUTDOWN")
        return new J14TurnPipelineError(
            `J14_${reason}_ACTIVE`,
            "EMERGENCY_STOPPED",
        );
    if (reason === "REVOKED" || reason === "SECURITY_EPOCH_CHANGED")
        return new J14TurnPipelineError("J14_AUTHORITY_REVOKED", "REVOKED");
    return new J14TurnPipelineError("J14_AUTHORITY_INVALID", "FAILED");
}

function mapExecutionFailure(error: unknown): J14TurnPipelineError {
    const code = error instanceof Error ? error.message : String(error);
    const upper = code.toUpperCase();
    if (upper.includes("CANCEL"))
        return new J14TurnPipelineError("J14_MODEL_CANCELLED", "CANCELLED");
    if (upper.includes("TIMEOUT"))
        return new J14TurnPipelineError("J14_MODEL_TIMEOUT", "TIMED_OUT");
    if (upper.includes("AUTHORITY"))
        return new J14TurnPipelineError("J14_AUTHORITY_REVOKED", "REVOKED");
    if (upper.includes("INVALID_RESPONSE") || upper.includes("MALFORMED"))
        return new J14TurnPipelineError("J14_MODEL_RESULT_INVALID", "FAILED");
    return new J14TurnPipelineError("J14_MODEL_EXECUTION_FAILED", "FAILED");
}

function contentFrom(result: J13ExecutionResult): string {
    const output = result.result.output;
    if (typeof output !== "string")
        throw new J14TurnPipelineError("J14_MODEL_RESULT_INVALID");
    return output;
}

export class J14TurnPipeline {
    private readonly executions = new Map<string, CachedTurn>();

    constructor(
        private readonly authority: J14AuthorityVerifier,
        private readonly context: J14ContextPort,
        private readonly model: J14ModelPort,
        private readonly clock: J14Clock,
        private readonly audit?: J14AuditSink,
    ) {}

    execute(
        input: J14TurnPipelineInput,
        signal: AbortSignal,
    ): Promise<J14TurnPipelineResult> {
        requireBoundInput(input);
        const digest = [
            input.inputDigest,
            input.contextDigest,
            input.modelOperationDigest,
            input.authority.ownerId,
            input.authority.projectId ?? "",
            input.conversationId,
            input.turnId,
            input.sessionId,
            String(input.authority.securityEpoch),
        ].join(":");
        const existing = this.executions.get(input.idempotencyKey);
        if (existing) {
            if (existing.digest !== digest)
                return Promise.reject(
                    new J14TurnPipelineError("J14_IDEMPOTENCY_CONFLICT"),
                );
            return existing.promise;
        }
        const promise = this.executeOnce(input, signal);
        this.executions.set(input.idempotencyKey, { digest, promise });
        return promise;
    }

    private async executeOnce(
        input: J14TurnPipelineInput,
        signal: AbortSignal,
    ): Promise<J14TurnPipelineResult> {
        let state: J14TurnState = "ACCEPTED";
        let sequence = 0;
        const events: J14ResponseEvent[] = [];
        let response: string | null = null;
        const emit = async (
            next: J14TurnState,
            kind: J14ResponseEvent["kind"] = "state",
            content: string | null = null,
            reasonCode: string | null = null,
        ) => {
            assertTransition(state, next);
            state = next;
            events.push({ sequence: ++sequence, state, kind, content });
            await this.audit?.append({
                correlationId: input.correlationId,
                conversationId: input.conversationId,
                turnId: input.turnId,
                contextDigest: input.contextDigest,
                modelOperationDigest: input.modelOperationDigest,
                state,
                reasonCode,
            });
        };
        const currentAuthority = async () => {
            if (signal.aborted)
                throw new J14TurnPipelineError(
                    "J14_OWNER_CANCELLED",
                    "CANCELLED",
                );
            const check = await this.authority.verify(input.authority);
            if (!check.valid) throw mapAuthorityFailure(check.reason);
        };
        const finishError = async (
            error: J14TurnPipelineError,
        ): Promise<J14TurnPipelineResult> => {
            if (transitions[state].includes(error.terminalState)) {
                await emit(
                    error.terminalState,
                    "terminal",
                    null,
                    error.code,
                );
            } else if (
                ![
                    "COMPLETED",
                    "FAILED",
                    "CANCELLED",
                    "REVOKED",
                    "TIMED_OUT",
                    "SAFE_MODE_BLOCKED",
                    "EMERGENCY_STOPPED",
                ].includes(state)
            ) {
                await emit("FAILED", "terminal", null, error.code);
            }
            return {
                correlationId: input.correlationId,
                conversationId: input.conversationId,
                turnId: input.turnId,
                state: state as J14TerminalState,
                response: null,
                acceptedAsContentOnly: true,
                toolExecutionCommitted: false,
                approvalCommitted: false,
                memoryWriteCommitted: false,
                events,
                reasonCode: error.code,
            };
        };

        try {
            await emit("AUTHORITY_VALIDATING");
            await currentAuthority();

            await emit("CONTEXT_ASSEMBLING");
            const envelope = await this.context.assemble(
                input.authority,
                input.candidates,
                input.contextPolicy,
            );
            if (envelope.turnId !== input.turnId)
                throw new J14TurnPipelineError("J14_CONTEXT_BINDING_INVALID");
            await currentAuthority();

            await emit("MODEL_PENDING");
            await currentAuthority();
            await emit("MODEL_RUNNING");
            let modelResult: J13ExecutionResult;
            try {
                modelResult = await this.model.execute(
                    {
                        operationKey: `${input.turnId}:model`,
                        operationDigest: input.modelOperationDigest,
                        authority: input.authority,
                        context: envelope,
                        request: input.modelRequest,
                        policy: input.modelPolicy,
                    },
                    signal,
                );
            } catch (error) {
                throw mapExecutionFailure(error);
            }
            await currentAuthority();
            if (
                modelResult.turnId !== input.turnId ||
                modelResult.acceptedAsContentOnly !== true
            )
                throw new J14TurnPipelineError("J14_MODEL_RESULT_INVALID");

            await emit("MODEL_RESULT_RECEIVED");
            await currentAuthority();
            await emit("RESPONSE_PROCESSING");
            response = contentFrom(modelResult);
            events.push({
                sequence: ++sequence,
                state,
                kind: "content",
                content: response,
            });
            await currentAuthority();
            await emit("COMPLETED", "terminal");
            return {
                correlationId: input.correlationId,
                conversationId: input.conversationId,
                turnId: input.turnId,
                state: "COMPLETED",
                response,
                acceptedAsContentOnly: true,
                toolExecutionCommitted: false,
                approvalCommitted: false,
                memoryWriteCommitted: false,
                events,
                reasonCode: null,
            };
        } catch (error) {
            const mapped =
                error instanceof J14TurnPipelineError
                    ? error
                    : new J14TurnPipelineError("J14_PIPELINE_FAILED");
            return finishError(mapped);
        } finally {
            void this.clock.now();
        }
    }
}
