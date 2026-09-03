import {
    J06ModelRequestSchema,
    J06ModelResultSchema,
    ModelDescriptorSchema,
    ModelRouteDecisionSchema,
    ModelRoutePolicySchema,
    type J06ModelRequest,
    type J06ModelResult,
    type ModelAuditRecord,
    type ModelCapability,
    type ModelDescriptor,
    type ModelRouteDecision,
    type ModelRoutePolicy,
    type ProcessingTarget,
    type RouteCandidate,
    type RouteRejectionCode,
} from "./j06-contracts.js";

export class ModelRoutingError extends Error {
    constructor(
        readonly code: string,
        message: string,
        readonly decision?: ModelRouteDecision,
    ) {
        super(message);
        this.name = "ModelRoutingError";
    }
}

export class ModelProviderFailure extends Error {
    constructor(
        readonly code: string,
        readonly retryable: boolean,
        message = code,
    ) {
        super(message);
        this.name = "ModelProviderFailure";
    }
}

export interface J06ModelAdapter {
    descriptor(): ModelDescriptor;
    generate(request: J06ModelRequest, signal: AbortSignal): Promise<J06ModelResult>;
    stream?(
        request: J06ModelRequest,
        signal: AbortSignal,
    ): AsyncIterable<{ sequence: number; text: string; done: boolean }>;
}

export interface ModelAuditSink {
    append(record: ModelAuditRecord): void | Promise<void>;
}

export interface StructuredOutputVerifier {
    verify(contractId: string, value: unknown): boolean | Promise<boolean>;
}

const localityRank: Record<ProcessingTarget, number> = {
    LOCAL: 0,
    PRIVATE_REMOTE: 1,
    APPROVED_EXTERNAL: 2,
};

function localityAllowed(requested: ProcessingTarget, provider: ProcessingTarget): boolean {
    if (requested === "LOCAL") return provider === "LOCAL";
    if (requested === "PRIVATE_REMOTE") return provider !== "APPROVED_EXTERNAL";
    return true;
}

function privacyAllowed(request: J06ModelRequest, descriptor: ModelDescriptor): boolean {
    if (descriptor.locality === "LOCAL") return true;
    if (request.context.containsSecretMaterial) return false;
    if (request.dataPolicy.classification === "D5" || request.context.classification === "D5") {
        return false;
    }
    if (descriptor.locality === "PRIVATE_REMOTE") {
        return request.dataPolicy.privacy !== "local-only" && request.context.privacy !== "local-only";
    }
    return (
        request.dataPolicy.privacy === "ai-allow" &&
        request.dataPolicy.consent.externalAI &&
        request.context.privacy === "ai-allow" &&
        request.context.externalAI
    );
}

function hasCapabilities(
    descriptor: ModelDescriptor,
    required: readonly ModelCapability[],
): boolean {
    const available = new Set(descriptor.capabilities);
    return required.every((capability) => available.has(capability));
}

export function estimateMaximumCost(
    request: J06ModelRequest,
    descriptor: ModelDescriptor,
): number {
    return (
        (request.inputTokenEstimate * descriptor.inputCostPerMillion +
            request.maxOutputTokens * descriptor.outputCostPerMillion) /
        1_000_000
    );
}

export class ModelProviderRegistry {
    private readonly adapters = new Map<string, J06ModelAdapter>();

    register(adapter: J06ModelAdapter): void {
        const descriptor = ModelDescriptorSchema.parse(adapter.descriptor());
        const key = this.key(descriptor.providerId, descriptor.modelId);
        if (this.adapters.has(key)) {
            throw new ModelRoutingError("DUPLICATE_MODEL", `Duplicate model ${key}`);
        }
        this.adapters.set(key, adapter);
    }

    list(): ModelDescriptor[] {
        return [...this.adapters.values()]
            .map((adapter) => ModelDescriptorSchema.parse(adapter.descriptor()))
            .sort((a, b) =>
                a.providerId.localeCompare(b.providerId) || a.modelId.localeCompare(b.modelId),
            );
    }

    get(providerId: string, modelId: string): J06ModelAdapter | undefined {
        return this.adapters.get(this.key(providerId, modelId));
    }

    private key(providerId: string, modelId: string): string {
        return `${providerId}\u0000${modelId}`;
    }
}

export class ModelRouter {
    constructor(
        private readonly registry: ModelProviderRegistry,
        private readonly audit?: ModelAuditSink,
        private readonly structuredVerifier?: StructuredOutputVerifier,
    ) {}

    select(requestInput: J06ModelRequest, policyInput: ModelRoutePolicy): ModelRouteDecision {
        const request = J06ModelRequestSchema.parse(requestInput);
        const policy = ModelRoutePolicySchema.parse(policyInput);
        this.assertBoundary(request);
        const preferred = new Map(
            policy.preferredProviderIds.map((providerId, index) => [providerId, index]),
        );
        const candidates = this.registry.list().map((descriptor): RouteCandidate => {
            const rejectionCodes: RouteRejectionCode[] = [];
            if (
                policy.allowedProviderIds.length > 0 &&
                !policy.allowedProviderIds.includes(descriptor.providerId)
            ) rejectionCodes.push("PROVIDER_NOT_ALLOWED");
            if (policy.deniedProviderIds.includes(descriptor.providerId)) {
                rejectionCodes.push("PROVIDER_DENIED");
            }
            if (!localityAllowed(request.processingTarget, descriptor.locality)) {
                rejectionCodes.push("LOCALITY_MISMATCH");
            }
            if (!privacyAllowed(request, descriptor)) rejectionCodes.push("PRIVACY_MISMATCH");
            if (!hasCapabilities(descriptor, request.requiredCapabilities)) {
                rejectionCodes.push("CAPABILITY_MISMATCH");
            }
            if (descriptor.health === "UNAVAILABLE" || descriptor.health === "DISABLED") {
                rejectionCodes.push("UNAVAILABLE");
            }
            if (descriptor.health === "DEGRADED" && !policy.allowDegraded) {
                rejectionCodes.push("DEGRADED_NOT_ALLOWED");
            }
            if (request.inputTokenEstimate + request.maxOutputTokens > descriptor.contextWindowTokens) {
                rejectionCodes.push("CONTEXT_WINDOW");
            }
            if (request.maxOutputTokens > descriptor.maxOutputTokens) {
                rejectionCodes.push("OUTPUT_LIMIT");
            }
            if (request.inputTokenEstimate + request.maxOutputTokens > request.maxTotalTokens) {
                rejectionCodes.push("TOKEN_BUDGET");
            }
            const estimatedCost = estimateMaximumCost(request, descriptor);
            if (estimatedCost > request.maxCost) rejectionCodes.push("COST_BUDGET");
            return {
                providerId: descriptor.providerId,
                modelId: descriptor.modelId,
                eligible: rejectionCodes.length === 0,
                estimatedCost,
                rejectionCodes,
            };
        });

        candidates.sort((a, b) => {
            if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
            const ap = preferred.get(a.providerId) ?? Number.MAX_SAFE_INTEGER;
            const bp = preferred.get(b.providerId) ?? Number.MAX_SAFE_INTEGER;
            if (ap !== bp) return ap - bp;
            const ad = this.registry.get(a.providerId, a.modelId)!.descriptor();
            const bd = this.registry.get(b.providerId, b.modelId)!.descriptor();
            return (
                localityRank[ad.locality] - localityRank[bd.locality] ||
                a.estimatedCost - b.estimatedCost ||
                a.providerId.localeCompare(b.providerId) ||
                a.modelId.localeCompare(b.modelId)
            );
        });

        const selected = candidates.find((candidate) => candidate.eligible) ?? null;
        return ModelRouteDecisionSchema.parse({
            version: 1,
            requestId: request.requestId,
            selectedProviderId: selected?.providerId ?? null,
            selectedModelId: selected?.modelId ?? null,
            candidates,
            reasons: selected
                ? ["POLICY_ELIGIBLE", "CAPABILITY_MATCH", "BUDGET_MATCH", "DETERMINISTIC_ORDER"]
                : ["NO_ELIGIBLE_PROVIDER"],
        });
    }

    async execute(
        requestInput: J06ModelRequest,
        policyInput: ModelRoutePolicy,
        signal: AbortSignal,
    ): Promise<{ result: J06ModelResult; decision: ModelRouteDecision }> {
        const request = J06ModelRequestSchema.parse(requestInput);
        const policy = ModelRoutePolicySchema.parse(policyInput);
        const decision = this.select(request, policy);
        await this.audit?.append(this.auditRecord(request, decision, "route.selected", null, null));
        const eligible = decision.candidates.filter((candidate) => candidate.eligible);
        if (eligible.length === 0) {
            await this.audit?.append(this.auditRecord(request, decision, "route.rejected", "NO_ELIGIBLE_PROVIDER", null));
            throw new ModelRoutingError("NO_ELIGIBLE_PROVIDER", "No eligible model provider", decision);
        }

        let lastError: unknown;
        for (let candidateIndex = 0; candidateIndex < eligible.length; candidateIndex += 1) {
            const candidate = eligible[candidateIndex]!;
            const adapter = this.registry.get(candidate.providerId, candidate.modelId)!;
            for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
                if (signal.aborted) {
                    await this.audit?.append(this.auditRecord(request, decision, "provider.cancelled", "MODEL_CANCELLED", null));
                    throw new ModelRoutingError("MODEL_CANCELLED", "Model execution cancelled", decision);
                }
                const controller = new AbortController();
                const abort = () => controller.abort();
                signal.addEventListener("abort", abort, { once: true });
                const timer = setTimeout(() => controller.abort(), request.timeoutMs);
                try {
                    const raw = await adapter.generate(request, controller.signal);
                    if (controller.signal.aborted) {
                        throw new ModelProviderFailure("MODEL_TIMEOUT_OR_CANCELLED", false);
                    }
                    const result = await this.verifyResult(request, candidate, raw);
                    await this.audit?.append(this.auditRecord(request, decision, "provider.success", null, result));
                    return { result, decision };
                } catch (error) {
                    lastError = error;
                    const retryable = error instanceof ModelProviderFailure && error.retryable;
                    const code = error instanceof ModelProviderFailure || error instanceof ModelRoutingError
                        ? error.code
                        : "MODEL_PROVIDER_FAILURE";
                    if (controller.signal.aborted || signal.aborted) {
                        await this.audit?.append(this.auditRecord(request, decision, "provider.cancelled", code, null));
                        throw new ModelRoutingError("MODEL_TIMEOUT_OR_CANCELLED", "Model execution aborted", decision);
                    }
                    if (retryable && attempt < policy.maxAttempts) {
                        await this.audit?.append(this.auditRecord(request, decision, "provider.retry", code, null));
                        continue;
                    }
                    await this.audit?.append(this.auditRecord(request, decision, "provider.failure", code, null));
                    break;
                } finally {
                    clearTimeout(timer);
                    signal.removeEventListener("abort", abort);
                }
            }
            if (candidateIndex < eligible.length - 1) {
                await this.audit?.append(this.auditRecord(request, decision, "provider.fallback", "PRIMARY_FAILED", null));
            }
        }
        throw new ModelRoutingError(
            "ALL_ELIGIBLE_PROVIDERS_FAILED",
            lastError instanceof Error ? lastError.message : "All eligible providers failed",
            decision,
        );
    }

    private assertBoundary(request: J06ModelRequest): void {
        if (!request.context.minimized) {
            throw new ModelRoutingError("CONTEXT_NOT_MINIMIZED", "Context must be minimized before routing");
        }
        if (
            request.processingTarget !== "LOCAL" &&
            (request.context.containsSecretMaterial ||
                request.context.classification === "D5" ||
                request.dataPolicy.classification === "D5")
        ) {
            throw new ModelRoutingError("SECRET_PROVIDER_BOUNDARY", "Secret material cannot cross a non-local model boundary");
        }
        if (
            request.processingTarget === "APPROVED_EXTERNAL" &&
            (!request.dataPolicy.consent.externalAI || request.dataPolicy.privacy !== "ai-allow")
        ) {
            throw new ModelRoutingError("EXTERNAL_AI_NOT_ALLOWED", "External AI processing is not permitted");
        }
    }

    private async verifyResult(
        request: J06ModelRequest,
        candidate: RouteCandidate,
        raw: J06ModelResult,
    ): Promise<J06ModelResult> {
        const result = J06ModelResultSchema.parse(raw);
        if (
            result.requestId !== request.requestId ||
            result.providerId !== candidate.providerId ||
            result.modelId !== candidate.modelId
        ) {
            throw new ModelProviderFailure("RESULT_IDENTITY_MISMATCH", false);
        }
        if (
            result.usage.totalTokens !== result.usage.inputTokens + result.usage.outputTokens ||
            result.usage.totalTokens > request.maxTotalTokens ||
            result.usage.outputTokens > request.maxOutputTokens
        ) {
            throw new ModelProviderFailure("RESULT_TOKEN_BUDGET_EXCEEDED", false);
        }
        if (result.usage.cost > request.maxCost) {
            throw new ModelProviderFailure("RESULT_COST_BUDGET_EXCEEDED", false);
        }
        if (request.responseFormat === "json") {
            let structured = result.structured;
            if (structured === null) {
                try {
                    structured = JSON.parse(result.text) as unknown;
                } catch {
                    throw new ModelProviderFailure("INVALID_STRUCTURED_OUTPUT", false);
                }
            }
            if (request.contractId && this.structuredVerifier) {
                const valid = await this.structuredVerifier.verify(request.contractId, structured);
                if (!valid) throw new ModelProviderFailure("INVALID_STRUCTURED_OUTPUT", false);
            }
            return { ...result, structured };
        }
        return result;
    }

    private auditRecord(
        request: J06ModelRequest,
        decision: ModelRouteDecision,
        event: ModelAuditRecord["event"],
        code: string | null,
        result: J06ModelResult | null,
    ): ModelAuditRecord {
        return {
            version: 1,
            requestId: request.requestId,
            providerId: result?.providerId ?? decision.selectedProviderId,
            modelId: result?.modelId ?? decision.selectedModelId,
            event,
            processingTarget: request.processingTarget,
            classification: request.dataPolicy.classification,
            capabilities: request.requiredCapabilities,
            inputTokens: result?.usage.inputTokens ?? null,
            outputTokens: result?.usage.outputTokens ?? null,
            cost: result?.usage.cost ?? null,
            code,
        };
    }
}
