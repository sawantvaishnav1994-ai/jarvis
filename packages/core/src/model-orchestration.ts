import {
    J06ModelRequestSchema,
    ModelRoutePolicySchema,
    ModelRouter,
    ModelRoutingError,
    type J06ModelRequest,
    type J06ModelResult,
    type ModelRouteDecision,
    type ModelRoutePolicy,
} from "@jarvis/models";
import type {
    ContextAssemblyAuthority,
    ContextEnvelope,
} from "./context-assembly.js";

export type J13FailureCode =
    | "MODEL_POLICY_DENIED"
    | "MODEL_NO_ELIGIBLE_PROVIDER"
    | "MODEL_CAPABILITY_UNAVAILABLE"
    | "MODEL_CONTEXT_TOO_LARGE"
    | "MODEL_BUDGET_EXCEEDED"
    | "MODEL_TIMEOUT"
    | "MODEL_CANCELLED"
    | "MODEL_RATE_LIMITED"
    | "MODEL_PROVIDER_UNAVAILABLE"
    | "MODEL_PROVIDER_AUTH_FAILED"
    | "MODEL_PROVIDER_INVALID_RESPONSE"
    | "MODEL_PROVIDER_ERROR"
    | "MODEL_ROUTING_FAILED"
    | "MODEL_AUTHORITY_INVALID"
    | "MODEL_OPERATION_CONFLICT";

export type ModelHealthState =
    | "healthy"
    | "degraded"
    | "unavailable"
    | "circuit-open";

export interface J13AuthorityVerifier {
    verify(authority: ContextAssemblyAuthority): boolean | Promise<boolean>;
}

export interface J13OperationIdFactory {
    create(): string;
}

export interface J13Clock {
    now(): number;
}

export interface J13HealthSnapshot {
    providerId: string;
    state: ModelHealthState;
    consecutiveFailures: number;
    lastFailureCode: string | null;
    lastSuccessAt: number | null;
    circuitOpenedAt: number | null;
    retryAfter: number | null;
}

export interface J13RuntimePolicy {
    route: ModelRoutePolicy;
    operationTimeoutMs: number;
    circuitFailureThreshold: number;
    circuitResetMs: number;
}

export interface J13ExecutionInput {
    operationKey: string;
    authority: ContextAssemblyAuthority;
    context: ContextEnvelope;
    request: J06ModelRequest;
    policy: J13RuntimePolicy;
}

export interface J13ExecutionResult {
    operationId: string;
    turnId: string;
    correlationId: string;
    result: J06ModelResult;
    decision: ModelRouteDecision;
    attemptsBound: number;
    fallbackPossible: boolean;
    acceptedAsContentOnly: true;
}

export interface J13AuditRecord {
    operationId: string;
    turnId: string;
    correlationId: string;
    event:
        | "operation.started"
        | "operation.completed"
        | "operation.failed"
        | "operation.cancelled"
        | "provider.health.changed";
    providerId: string | null;
    modelId: string | null;
    code: string | null;
    attemptsBound: number;
    usedTokens: number | null;
    cost: number | null;
}

export interface J13AuditSink {
    append(record: J13AuditRecord): void | Promise<void>;
}

export class J13ModelRuntimeError extends Error {
    constructor(
        readonly code: J13FailureCode,
        message = code,
        readonly decision?: ModelRouteDecision,
    ) {
        super(message);
        this.name = "J13ModelRuntimeError";
    }
}

interface MutableHealth {
    state: ModelHealthState;
    consecutiveFailures: number;
    lastFailureCode: string | null;
    lastSuccessAt: number | null;
    circuitOpenedAt: number | null;
    retryAfter: number | null;
}

const EMPTY_HEALTH = (): MutableHealth => ({
    state: "healthy",
    consecutiveFailures: 0,
    lastFailureCode: null,
    lastSuccessAt: null,
    circuitOpenedAt: null,
    retryAfter: null,
});

function validRuntimePolicy(policy: J13RuntimePolicy): boolean {
    try {
        ModelRoutePolicySchema.parse(policy.route);
    } catch {
        return false;
    }
    return (
        Number.isSafeInteger(policy.operationTimeoutMs) &&
        policy.operationTimeoutMs > 0 &&
        policy.operationTimeoutMs <= 300_000 &&
        Number.isSafeInteger(policy.circuitFailureThreshold) &&
        policy.circuitFailureThreshold >= 1 &&
        policy.circuitFailureThreshold <= 20 &&
        Number.isSafeInteger(policy.circuitResetMs) &&
        policy.circuitResetMs >= 1 &&
        policy.circuitResetMs <= 3_600_000
    );
}

function normalizeFailure(error: unknown): J13FailureCode {
    const code =
        error instanceof ModelRoutingError
            ? error.code
            : error instanceof Error
              ? error.message
              : "";
    if (code.includes("CANCEL")) return "MODEL_CANCELLED";
    if (code.includes("TIMEOUT")) return "MODEL_TIMEOUT";
    if (code.includes("RATE")) return "MODEL_RATE_LIMITED";
    if (code.includes("AUTH")) return "MODEL_PROVIDER_AUTH_FAILED";
    if (code.includes("INVALID") || code.includes("MISMATCH"))
        return "MODEL_PROVIDER_INVALID_RESPONSE";
    if (code.includes("NO_ELIGIBLE")) return "MODEL_NO_ELIGIBLE_PROVIDER";
    if (code.includes("BUDGET")) return "MODEL_BUDGET_EXCEEDED";
    if (code.includes("CONTEXT")) return "MODEL_CONTEXT_TOO_LARGE";
    if (code.includes("UNAVAILABLE") || code.includes("ALL_ELIGIBLE"))
        return "MODEL_PROVIDER_UNAVAILABLE";
    if (error instanceof ModelRoutingError) return "MODEL_ROUTING_FAILED";
    return "MODEL_PROVIDER_ERROR";
}

function assertEnvelopeBinding(input: J13ExecutionInput): void {
    const request = J06ModelRequestSchema.parse(input.request);
    if (input.context.turnId !== input.authority.turnId)
        throw new J13ModelRuntimeError("MODEL_POLICY_DENIED", "Context turn mismatch");
    if (request.ownerId !== input.authority.ownerId)
        throw new J13ModelRuntimeError("MODEL_POLICY_DENIED", "Owner mismatch");
    if ((request.projectId ?? null) !== (input.authority.projectId ?? null))
        throw new J13ModelRuntimeError("MODEL_POLICY_DENIED", "Project mismatch");
    if (request.context.classification === "D5")
        throw new J13ModelRuntimeError(
            "MODEL_POLICY_DENIED",
            "D5 is not admitted to generic J1.3 model orchestration",
        );
    if (input.context.classificationCeiling === "D5")
        throw new J13ModelRuntimeError(
            "MODEL_POLICY_DENIED",
            "D5 context ceiling is not admissible to generic model orchestration",
        );
    if (
        request.processingTarget === "APPROVED_EXTERNAL" &&
        input.context.disclosureTarget !== "external-ai"
    )
        throw new J13ModelRuntimeError(
            "MODEL_POLICY_DENIED",
            "External model cannot consume a non-external context envelope",
        );
    if (input.context.usedSize > input.context.maximumSize)
        throw new J13ModelRuntimeError("MODEL_BUDGET_EXCEEDED");
    if (
        input.context.sources.some(
            (source) =>
                !source.disclosureEligibility ||
                source.classification === "D5" ||
                (request.processingTarget === "APPROVED_EXTERNAL" &&
                    source.retention === "never-store" &&
                    !request.context.externalAI),
        )
    )
        throw new J13ModelRuntimeError("MODEL_POLICY_DENIED");
}

export class J13ProviderHealth {
    private readonly values = new Map<string, MutableHealth>();

    snapshot(providerId: string, now: number): J13HealthSnapshot {
        const value = this.values.get(providerId) ?? EMPTY_HEALTH();
        if (
            value.state === "circuit-open" &&
            value.retryAfter !== null &&
            now >= value.retryAfter
        ) {
            value.state = "degraded";
            value.retryAfter = null;
            this.values.set(providerId, value);
        }
        return { providerId, ...value };
    }

    recordSuccess(providerId: string, now: number): J13HealthSnapshot {
        const value = this.values.get(providerId) ?? EMPTY_HEALTH();
        value.state = "healthy";
        value.consecutiveFailures = 0;
        value.lastFailureCode = null;
        value.lastSuccessAt = now;
        value.circuitOpenedAt = null;
        value.retryAfter = null;
        this.values.set(providerId, value);
        return { providerId, ...value };
    }

    recordFailure(
        providerId: string,
        code: string,
        now: number,
        threshold: number,
        resetMs: number,
    ): J13HealthSnapshot {
        const value = this.values.get(providerId) ?? EMPTY_HEALTH();
        value.consecutiveFailures += 1;
        value.lastFailureCode = code;
        if (value.consecutiveFailures >= threshold) {
            value.state = "circuit-open";
            value.circuitOpenedAt = now;
            value.retryAfter = now + resetMs;
        } else {
            value.state = "degraded";
        }
        this.values.set(providerId, value);
        return { providerId, ...value };
    }
}

export class J13ModelOrchestrator {
    private readonly operations = new Map<string, Promise<J13ExecutionResult>>();

    constructor(
        private readonly router: ModelRouter,
        private readonly authorityVerifier: J13AuthorityVerifier,
        private readonly ids: J13OperationIdFactory,
        private readonly clock: J13Clock,
        private readonly health = new J13ProviderHealth(),
        private readonly audit?: J13AuditSink,
    ) {}

    execute(
        input: J13ExecutionInput,
        signal: AbortSignal,
    ): Promise<J13ExecutionResult> {
        if (!input.operationKey)
            return Promise.reject(
                new J13ModelRuntimeError("MODEL_OPERATION_CONFLICT"),
            );
        const existing = this.operations.get(input.operationKey);
        if (existing) return existing;
        const operation = this.executeOnce(input, signal);
        this.operations.set(input.operationKey, operation);
        return operation;
    }

    private async executeOnce(
        input: J13ExecutionInput,
        signal: AbortSignal,
    ): Promise<J13ExecutionResult> {
        if (!validRuntimePolicy(input.policy))
            throw new J13ModelRuntimeError("MODEL_POLICY_DENIED");
        assertEnvelopeBinding(input);
        if (!(await this.authorityVerifier.verify(input.authority)))
            throw new J13ModelRuntimeError("MODEL_AUTHORITY_INVALID");
        if (signal.aborted)
            throw new J13ModelRuntimeError("MODEL_CANCELLED");

        const operationId = this.ids.create();
        if (!operationId)
            throw new J13ModelRuntimeError("MODEL_OPERATION_CONFLICT");
        const correlationId = `${input.authority.turnId}:${operationId}`;
        const now = this.clock.now();
        const preDecision = this.router.select(input.request, input.policy.route);
        const circuitDenied = preDecision.candidates
            .map((candidate) => candidate.providerId)
            .filter(
                (providerId, index, all) =>
                    all.indexOf(providerId) === index &&
                    this.health.snapshot(providerId, now).state === "circuit-open",
            );
        const route: ModelRoutePolicy = {
            ...input.policy.route,
            deniedProviderIds: [
                ...new Set([
                    ...input.policy.route.deniedProviderIds,
                    ...circuitDenied,
                ]),
            ],
        };
        const decision = this.router.select(input.request, route);
        const selectedProviderId = decision.selectedProviderId;
        if (!selectedProviderId)
            throw new J13ModelRuntimeError(
                "MODEL_NO_ELIGIBLE_PROVIDER",
                "No policy-eligible provider",
                decision,
            );

        await this.audit?.append({
            operationId,
            turnId: input.authority.turnId,
            correlationId,
            event: "operation.started",
            providerId: selectedProviderId,
            modelId: decision.selectedModelId,
            code: null,
            attemptsBound: route.maxAttempts,
            usedTokens: null,
            cost: null,
        });

        const deadline = new AbortController();
        const timer = setTimeout(
            () => deadline.abort(),
            input.policy.operationTimeoutMs,
        );
        const combined = AbortSignal.any([signal, deadline.signal]);
        try {
            const executed = await this.router.execute(
                input.request,
                route,
                combined,
            );
            if (signal.aborted)
                throw new J13ModelRuntimeError("MODEL_CANCELLED");
            if (deadline.signal.aborted)
                throw new J13ModelRuntimeError("MODEL_TIMEOUT");
            if (!(await this.authorityVerifier.verify(input.authority)))
                throw new J13ModelRuntimeError("MODEL_AUTHORITY_INVALID");
            const health = this.health.recordSuccess(
                executed.result.providerId,
                this.clock.now(),
            );
            await this.audit?.append({
                operationId,
                turnId: input.authority.turnId,
                correlationId,
                event: "provider.health.changed",
                providerId: health.providerId,
                modelId: executed.result.modelId,
                code: health.state,
                attemptsBound: route.maxAttempts,
                usedTokens: executed.result.usage.totalTokens,
                cost: executed.result.usage.cost,
            });
            const result: J13ExecutionResult = {
                operationId,
                turnId: input.authority.turnId,
                correlationId,
                result: executed.result,
                decision: executed.decision,
                attemptsBound: route.maxAttempts,
                fallbackPossible:
                    executed.decision.candidates.filter((candidate) => candidate.eligible)
                        .length > 1,
                acceptedAsContentOnly: true,
            };
            await this.audit?.append({
                operationId,
                turnId: input.authority.turnId,
                correlationId,
                event: "operation.completed",
                providerId: result.result.providerId,
                modelId: result.result.modelId,
                code: null,
                attemptsBound: route.maxAttempts,
                usedTokens: result.result.usage.totalTokens,
                cost: result.result.usage.cost,
            });
            return result;
        } catch (error) {
            const code =
                error instanceof J13ModelRuntimeError
                    ? error.code
                    : normalizeFailure(error);
            const health = this.health.recordFailure(
                selectedProviderId,
                code,
                this.clock.now(),
                input.policy.circuitFailureThreshold,
                input.policy.circuitResetMs,
            );
            await this.audit?.append({
                operationId,
                turnId: input.authority.turnId,
                correlationId,
                event: "provider.health.changed",
                providerId: selectedProviderId,
                modelId: decision.selectedModelId,
                code: health.state,
                attemptsBound: route.maxAttempts,
                usedTokens: null,
                cost: null,
            });
            await this.audit?.append({
                operationId,
                turnId: input.authority.turnId,
                correlationId,
                event:
                    code === "MODEL_CANCELLED"
                        ? "operation.cancelled"
                        : "operation.failed",
                providerId: selectedProviderId,
                modelId: decision.selectedModelId,
                code,
                attemptsBound: route.maxAttempts,
                usedTokens: null,
                cost: null,
            });
            throw error instanceof J13ModelRuntimeError
                ? error
                : new J13ModelRuntimeError(code, code, decision);
        } finally {
            clearTimeout(timer);
        }
    }
}
