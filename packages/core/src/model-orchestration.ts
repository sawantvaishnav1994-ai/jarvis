import {
    J06ModelRequestSchema,
    ModelRoutePolicySchema,
    ModelRouter,
    ModelRoutingError,
    type J06ModelRequest,
    type J06ModelResult,
    type ModelExecutionObserver,
    type ModelRouteDecision,
    type ModelRoutePolicy,
    type RouteRejectionCode,
} from "@jarvis/models";
import type {
    ContextAssemblyAuthority,
    ContextDataClass,
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
    "healthy" | "degraded" | "unavailable" | "circuit-open";

export type J13CancellationState =
    "not-requested" | "requested-result-discarded";

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
    operationAttemptLimit: number;
    operationMaxTokens: number;
    operationMaxCost: number;
    operationAllowUnknownCost: boolean;
    circuitFailureThreshold: number;
    circuitResetMs: number;
}

export interface J13ExecutionInput {
    operationKey: string;
    operationDigest: string;
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
    reservedTokenBudget: number;
    reservedCostBudget: number | null;
    selectedEstimatedMaximumCost: number | null;
    actualCost: number | null;
    costStatus: "actual" | "unknown";
    cancellationState: "not-requested";
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
        message: string = code,
        readonly decision?: ModelRouteDecision,
        readonly cancellationState: J13CancellationState = "not-requested",
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

interface CachedOperation {
    digest: string;
    promise: Promise<J13ExecutionResult>;
}

const CLASS_RANK: Record<ContextDataClass, number> = {
    D0: 0,
    D1: 1,
    D2: 2,
    D3: 3,
    D4: 4,
    D5: 5,
};

const OPERATION_DIGEST = /^[0-9a-f]{64}$/i;

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
        Number.isSafeInteger(policy.operationAttemptLimit) &&
        policy.operationAttemptLimit >= 1 &&
        policy.operationAttemptLimit <= 20 &&
        Number.isSafeInteger(policy.operationMaxTokens) &&
        policy.operationMaxTokens >= 1 &&
        policy.operationMaxTokens <= 100_000_000 &&
        Number.isFinite(policy.operationMaxCost) &&
        policy.operationMaxCost >= 0 &&
        policy.operationMaxCost <= 1_000_000 &&
        typeof policy.operationAllowUnknownCost === "boolean" &&
        Number.isSafeInteger(policy.circuitFailureThreshold) &&
        policy.circuitFailureThreshold >= 1 &&
        policy.circuitFailureThreshold <= 20 &&
        Number.isSafeInteger(policy.circuitResetMs) &&
        policy.circuitResetMs >= 1 &&
        policy.circuitResetMs <= 3_600_000
    );
}

function normalizeFailure(error: unknown): J13FailureCode {
    const raw =
        error instanceof ModelRoutingError
            ? `${error.code}:${error.message}`
            : error instanceof Error
              ? error.message
              : "";
    const code = raw.toUpperCase();
    if (code.includes("MODEL_AUTHORITY_INVALID"))
        return "MODEL_AUTHORITY_INVALID";
    if (code.includes("CANCEL")) return "MODEL_CANCELLED";
    if (code.includes("TIMEOUT")) return "MODEL_TIMEOUT";
    if (code.includes("RATE")) return "MODEL_RATE_LIMITED";
    if (code.includes("PROVIDER_AUTH") || code.includes("AUTH_FAILED"))
        return "MODEL_PROVIDER_AUTH_FAILED";
    if (
        code.includes("INVALID") ||
        code.includes("MISMATCH") ||
        code.includes("STRUCTURED")
    )
        return "MODEL_PROVIDER_INVALID_RESPONSE";
    if (code.includes("NO_ELIGIBLE")) return "MODEL_NO_ELIGIBLE_PROVIDER";
    if (code.includes("BUDGET") || code.includes("COST_UNKNOWN"))
        return "MODEL_BUDGET_EXCEEDED";
    if (code.includes("CONTEXT") || code.includes("OUTPUT_LIMIT"))
        return "MODEL_CONTEXT_TOO_LARGE";
    if (code.includes("UNAVAILABLE") || code.includes("ALL_ELIGIBLE"))
        return "MODEL_PROVIDER_UNAVAILABLE";
    if (error instanceof ModelRoutingError) return "MODEL_ROUTING_FAILED";
    return "MODEL_PROVIDER_ERROR";
}

function noEligibleFailure(decision: ModelRouteDecision): J13FailureCode {
    const reasons = new Set<RouteRejectionCode>(
        decision.candidates.flatMap((candidate) => candidate.rejectionCodes),
    );
    const policyReasons: RouteRejectionCode[] = [
        "PROVIDER_NOT_ALLOWED",
        "PROVIDER_DENIED",
        "PINNED_MODEL_MISMATCH",
        "LOCALITY_MISMATCH",
        "PRIVACY_MISMATCH",
    ];
    if (policyReasons.some((code) => reasons.has(code)))
        return "MODEL_POLICY_DENIED";
    if (reasons.has("CONTEXT_WINDOW") || reasons.has("OUTPUT_LIMIT"))
        return "MODEL_CONTEXT_TOO_LARGE";
    if (
        reasons.has("TOKEN_BUDGET") ||
        reasons.has("COST_BUDGET") ||
        reasons.has("COST_UNKNOWN")
    )
        return "MODEL_BUDGET_EXCEEDED";
    if (reasons.has("CAPABILITY_MISMATCH"))
        return "MODEL_CAPABILITY_UNAVAILABLE";
    if (reasons.has("UNAVAILABLE") || reasons.has("DEGRADED_NOT_ALLOWED"))
        return "MODEL_PROVIDER_UNAVAILABLE";
    return "MODEL_NO_ELIGIBLE_PROVIDER";
}

function affectsProviderHealth(code: J13FailureCode): boolean {
    return [
        "MODEL_TIMEOUT",
        "MODEL_RATE_LIMITED",
        "MODEL_PROVIDER_UNAVAILABLE",
        "MODEL_PROVIDER_AUTH_FAILED",
        "MODEL_PROVIDER_INVALID_RESPONSE",
        "MODEL_PROVIDER_ERROR",
    ].includes(code);
}

function assertEnvelopeBinding(input: J13ExecutionInput): void {
    const request = J06ModelRequestSchema.parse(input.request);
    if (input.context.turnId !== input.authority.turnId)
        throw new J13ModelRuntimeError(
            "MODEL_POLICY_DENIED",
            "Context turn mismatch",
        );
    if (request.ownerId !== input.authority.ownerId)
        throw new J13ModelRuntimeError("MODEL_POLICY_DENIED", "Owner mismatch");
    if ((request.projectId ?? null) !== (input.authority.projectId ?? null))
        throw new J13ModelRuntimeError(
            "MODEL_POLICY_DENIED",
            "Project mismatch",
        );
    if (
        CLASS_RANK[request.dataPolicy.classification] >
            CLASS_RANK[input.context.classificationCeiling] ||
        CLASS_RANK[request.context.classification] >
            CLASS_RANK[input.context.classificationCeiling]
    )
        throw new J13ModelRuntimeError(
            "MODEL_POLICY_DENIED",
            "Model request exceeds the assembled context classification ceiling",
        );
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
        input.context.disclosureTarget === "local" &&
        request.processingTarget !== "LOCAL"
    )
        throw new J13ModelRuntimeError(
            "MODEL_POLICY_DENIED",
            "Local context cannot cross a non-local model boundary",
        );
    if (
        input.context.disclosureTarget === "private" &&
        request.processingTarget === "APPROVED_EXTERNAL"
    )
        throw new J13ModelRuntimeError(
            "MODEL_POLICY_DENIED",
            "Private context cannot cross an external model boundary",
        );
    if (
        request.processingTarget === "APPROVED_EXTERNAL" &&
        input.context.disclosureTarget !== "external-ai"
    )
        throw new J13ModelRuntimeError(
            "MODEL_POLICY_DENIED",
            "External model cannot consume a non-external context envelope",
        );
    if (
        input.authority.operatingMode === "private" &&
        request.processingTarget === "APPROVED_EXTERNAL"
    )
        throw new J13ModelRuntimeError(
            "MODEL_POLICY_DENIED",
            "Private operating mode cannot broaden disclosure to an external model",
        );
    if (input.context.usedSize > input.context.maximumSize)
        throw new J13ModelRuntimeError("MODEL_BUDGET_EXCEEDED");
    if (
        input.context.sources.some(
            (source) =>
                !source.disclosureEligibility || source.classification === "D5",
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
    private readonly operations = new Map<string, CachedOperation>();

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
        if (
            !input.operationKey ||
            !OPERATION_DIGEST.test(input.operationDigest)
        )
            return Promise.reject(
                new J13ModelRuntimeError("MODEL_OPERATION_CONFLICT"),
            );
        const existing = this.operations.get(input.operationKey);
        if (existing) {
            if (existing.digest !== input.operationDigest)
                return Promise.reject(
                    new J13ModelRuntimeError("MODEL_OPERATION_CONFLICT"),
                );
            return existing.promise;
        }
        const operation = this.executeOnce(input, signal);
        this.operations.set(input.operationKey, {
            digest: input.operationDigest,
            promise: operation,
        });
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
            throw new J13ModelRuntimeError(
                "MODEL_CANCELLED",
                "Model execution cancelled before dispatch",
                undefined,
                "requested-result-discarded",
            );

        const operationId = this.ids.create();
        if (!operationId)
            throw new J13ModelRuntimeError("MODEL_OPERATION_CONFLICT");
        const correlationId = `${input.authority.turnId}:${operationId}`;
        const now = this.clock.now();
        const preDecision = this.router.select(
            input.request,
            input.policy.route,
        );
        const circuitDenied = preDecision.candidates
            .map((candidate) => candidate.providerId)
            .filter(
                (providerId, index, all) =>
                    all.indexOf(providerId) === index &&
                    this.health.snapshot(providerId, now).state ===
                        "circuit-open",
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
        if (!selectedProviderId) {
            const preEligible = preDecision.candidates.filter(
                (candidate) => candidate.eligible,
            );
            const code =
                preEligible.length > 0 &&
                preEligible.every((candidate) =>
                    circuitDenied.includes(candidate.providerId),
                )
                    ? "MODEL_PROVIDER_UNAVAILABLE"
                    : noEligibleFailure(decision);
            throw new J13ModelRuntimeError(
                code,
                "No policy-eligible provider",
                decision,
            );
        }

        const eligible = decision.candidates.filter(
            (candidate) => candidate.eligible,
        );
        const attemptsBound = eligible.length * route.maxAttempts;
        const reservedTokenBudget =
            attemptsBound *
            (input.request.inputTokenEstimate + input.request.maxOutputTokens);
        const hasUnknownCost = eligible.some(
            (candidate) => candidate.estimatedCost === null,
        );
        const reservedCostBudget = hasUnknownCost
            ? null
            : eligible.reduce(
                  (total, candidate) => total + (candidate.estimatedCost ?? 0),
                  0,
              ) * route.maxAttempts;
        if (attemptsBound > input.policy.operationAttemptLimit)
            throw new J13ModelRuntimeError(
                "MODEL_POLICY_DENIED",
                "Logical model operation exceeds its bounded attempt limit",
                decision,
            );
        if (reservedTokenBudget > input.policy.operationMaxTokens)
            throw new J13ModelRuntimeError(
                "MODEL_BUDGET_EXCEEDED",
                "Logical retries/fallback exceed the shared token budget",
                decision,
            );
        if (hasUnknownCost && !input.policy.operationAllowUnknownCost)
            throw new J13ModelRuntimeError(
                "MODEL_BUDGET_EXCEEDED",
                "Unknown provider cost is not permitted for this operation",
                decision,
            );
        if (
            reservedCostBudget !== null &&
            reservedCostBudget > input.policy.operationMaxCost
        )
            throw new J13ModelRuntimeError(
                "MODEL_BUDGET_EXCEEDED",
                "Logical retries/fallback exceed the shared cost budget",
                decision,
            );

        const selectedEstimatedMaximumCost =
            decision.candidates.find(
                (candidate) =>
                    candidate.providerId === decision.selectedProviderId &&
                    candidate.modelId === decision.selectedModelId,
            )?.estimatedCost ?? null;

        await this.audit?.append({
            operationId,
            turnId: input.authority.turnId,
            correlationId,
            event: "operation.started",
            providerId: selectedProviderId,
            modelId: decision.selectedModelId,
            code: null,
            attemptsBound,
            usedTokens: null,
            cost: null,
        });

        const deadline = new AbortController();
        const timer = setTimeout(
            () => deadline.abort(),
            input.policy.operationTimeoutMs,
        );
        const combined = AbortSignal.any([signal, deadline.signal]);
        const auditHealth = async (
            providerId: string,
            modelId: string,
            snapshot: J13HealthSnapshot,
        ) => {
            await this.audit?.append({
                operationId,
                turnId: input.authority.turnId,
                correlationId,
                event: "provider.health.changed",
                providerId,
                modelId,
                code: snapshot.state,
                attemptsBound,
                usedTokens: null,
                cost: null,
            });
        };
        const observer: ModelExecutionObserver = {
            beforeAttempt: async () => {
                if (signal.aborted)
                    return { proceed: false, code: "MODEL_CANCELLED" };
                if (deadline.signal.aborted)
                    return { proceed: false, code: "MODEL_TIMEOUT" };
                if (!(await this.authorityVerifier.verify(input.authority)))
                    return {
                        proceed: false,
                        code: "MODEL_AUTHORITY_INVALID",
                    };
                return { proceed: true, code: null };
            },
            afterAttempt: async (attempt) => {
                if (attempt.event === "success") {
                    const snapshot = this.health.recordSuccess(
                        attempt.providerId,
                        this.clock.now(),
                    );
                    await auditHealth(
                        attempt.providerId,
                        attempt.modelId,
                        snapshot,
                    );
                    return;
                }
                if (attempt.event !== "failure") return;
                const code = normalizeFailure(
                    new ModelRoutingError(
                        attempt.code ?? "MODEL_PROVIDER_ERROR",
                        attempt.code ?? "MODEL_PROVIDER_ERROR",
                    ),
                );
                if (!affectsProviderHealth(code)) return;
                const snapshot = this.health.recordFailure(
                    attempt.providerId,
                    code,
                    this.clock.now(),
                    input.policy.circuitFailureThreshold,
                    input.policy.circuitResetMs,
                );
                await auditHealth(
                    attempt.providerId,
                    attempt.modelId,
                    snapshot,
                );
            },
        };

        try {
            const executed = await this.router.execute(
                input.request,
                route,
                combined,
                observer,
            );
            if (signal.aborted)
                throw new J13ModelRuntimeError(
                    "MODEL_CANCELLED",
                    "Model result discarded after cancellation",
                    executed.decision,
                    "requested-result-discarded",
                );
            if (deadline.signal.aborted)
                throw new J13ModelRuntimeError(
                    "MODEL_TIMEOUT",
                    "Logical model operation timed out",
                    executed.decision,
                );
            if (!(await this.authorityVerifier.verify(input.authority)))
                throw new J13ModelRuntimeError("MODEL_AUTHORITY_INVALID");
            const actualCost = executed.result.usage.cost;
            const result: J13ExecutionResult = {
                operationId,
                turnId: input.authority.turnId,
                correlationId,
                result: executed.result,
                decision: executed.decision,
                attemptsBound,
                fallbackPossible: eligible.length > 1,
                reservedTokenBudget,
                reservedCostBudget,
                selectedEstimatedMaximumCost,
                actualCost,
                costStatus: actualCost === null ? "unknown" : "actual",
                cancellationState: "not-requested",
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
                attemptsBound,
                usedTokens: result.result.usage.totalTokens,
                cost: result.result.usage.cost,
            });
            return result;
        } catch (error) {
            const code = signal.aborted
                ? "MODEL_CANCELLED"
                : deadline.signal.aborted
                  ? "MODEL_TIMEOUT"
                  : error instanceof J13ModelRuntimeError
                    ? error.code
                    : normalizeFailure(error);
            const cancellationState: J13CancellationState =
                code === "MODEL_CANCELLED"
                    ? "requested-result-discarded"
                    : "not-requested";
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
                attemptsBound,
                usedTokens: null,
                cost: null,
            });
            throw error instanceof J13ModelRuntimeError && error.code === code
                ? error
                : new J13ModelRuntimeError(
                      code,
                      code,
                      decision,
                      cancellationState,
                  );
        } finally {
            clearTimeout(timer);
        }
    }
}
