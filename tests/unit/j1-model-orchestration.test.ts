import { describe, expect, it } from "vitest";
import {
    ContextAssembler,
    J13ModelOrchestrator,
    J13ModelRuntimeError,
    J13ProviderHealth,
    type ContextAssemblyAuthority,
    type ContextCandidateSource,
    type J13AuditRecord,
} from "@jarvis/core";
import {
    J06ModelRequestSchema,
    ModelProviderFailure,
    ModelProviderRegistry,
    ModelRouter,
    ReferenceModelAdapter,
    SyntheticModelAdapter,
    type J06ModelRequest,
    type ModelDescriptor,
    type ModelRoutePolicy,
} from "@jarvis/models";

const authority: ContextAssemblyAuthority = {
    ownerId: "owner",
    conversationId: "conversation-1",
    sessionId: "session-1",
    turnId: "turn-1",
    securityEpoch: 7,
    operatingMode: "assistant",
    projectId: "jarvis",
};

const operationDigest = "d".repeat(64);

const contextSource = (
    over: Partial<ContextCandidateSource> = {},
): ContextCandidateSource => ({
    sourceType: "conversation",
    sourceId: "source-1",
    ownerId: "owner",
    projectId: "jarvis",
    provenance: "owner-input:v1",
    classification: "D2",
    freshness: 100,
    retention: "keep",
    retentionBoundary: null,
    disclosureEligibility: true,
    digest: "a".repeat(64),
    trust: "trusted",
    priority: 10,
    size: 10,
    payload: "context content",
    ...over,
});

const dataPolicy = {
    version: 1 as const,
    classification: "D2" as const,
    privacy: "ai-allow" as const,
    retention: { mode: "keep" as const },
    consent: {
        storeConversation: true,
        createMemory: true,
        projectKnowledge: true,
        keepAttachments: true,
        personalization: true,
        externalAI: true,
    },
};

const request = (over: Partial<J06ModelRequest> = {}): J06ModelRequest =>
    J06ModelRequestSchema.parse({
        version: 1,
        requestId: "request-1",
        ownerId: "owner",
        projectId: "jarvis",
        messages: [
            { role: "user", content: "answer using authorized context" },
        ],
        requiredCapabilities: ["text", "reasoning"],
        processingTarget: "APPROVED_EXTERNAL",
        dataPolicy,
        context: {
            packageId: "context-envelope-turn-1",
            classification: "D2",
            privacy: "ai-allow",
            externalAI: true,
            minimized: true,
            containsSecretMaterial: false,
        },
        inputTokenEstimate: 100,
        maxOutputTokens: 100,
        maxTotalTokens: 500,
        maxCost: 1,
        timeoutMs: 1_000,
        responseFormat: "text",
        contractId: null,
        ...over,
    });

const descriptor = (over: Partial<ModelDescriptor> = {}): ModelDescriptor => ({
    version: 1,
    providerId: "provider-a",
    modelId: "model-a",
    locality: "APPROVED_EXTERNAL",
    capabilities: ["text", "reasoning", "structured-output", "streaming"],
    contextWindowTokens: 8_000,
    maxOutputTokens: 1_000,
    inputCostPerMillion: 1,
    outputCostPerMillion: 2,
    health: "HEALTHY",
    credentialRef: "vault://models/provider-a",
    ...over,
});

const route = (over: Partial<ModelRoutePolicy> = {}): ModelRoutePolicy => ({
    allowedProviderIds: [],
    deniedProviderIds: [],
    preferredProviderIds: [],
    allowDegraded: false,
    maxAttempts: 2,
    ...over,
});

const contextPolicy = {
    disclosureTarget: "external-ai" as const,
    classificationCeiling: "D3" as const,
    maximumSize: 100,
    minimumFreshness: 0,
    allowUntrusted: false,
    now: 200,
};

async function envelope(over: Partial<ContextCandidateSource>[] = []) {
    return new ContextAssembler({ verify: () => true }).assemble(
        authority,
        [contextSource(), ...over.map((item) => contextSource(item))],
        contextPolicy,
    );
}

function runtime(
    registry: ModelProviderRegistry,
    authorityValid: () => boolean = () => true,
    health = new J13ProviderHealth(),
    audit?: { append(record: J13AuditRecord): void },
    router = new ModelRouter(registry),
) {
    let id = 0;
    return new J13ModelOrchestrator(
        router,
        { verify: authorityValid },
        { create: () => `operation-${++id}` },
        { now: () => 1_000 },
        health,
        audit,
    );
}

const policy = {
    route: route(),
    operationTimeoutMs: 2_000,
    operationAttemptLimit: 10,
    operationMaxTokens: 5_000,
    operationMaxCost: 10,
    operationAllowUnknownCost: false,
    circuitFailureThreshold: 2,
    circuitResetMs: 5_000,
};

const input = async (
    operationKey: string,
    over: Record<string, unknown> = {},
) => ({
    operationKey,
    operationDigest,
    authority,
    context: await envelope(),
    request: request(),
    policy,
    ...over,
});

describe("J1.3 model orchestration runtime", () => {
    it("executes an authorized J1.2 envelope and treats output as content only", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        const result = await runtime(registry).execute(
            await input("turn-1:model"),
            new AbortController().signal,
        );
        expect(result.result.providerId).toBe("provider-a");
        expect(result.acceptedAsContentOnly).toBe(true);
        expect(result.turnId).toBe("turn-1");
        expect(result.costStatus).toBe("actual");
        expect(result.actualCost).toBe(0);
        expect(result.selectedEstimatedMaximumCost).toBeGreaterThan(0);
    });

    it("fails closed when current authority is stale or revoked", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        await expect(
            runtime(registry, () => false).execute(
                await input("revoked"),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_AUTHORITY_INVALID" });
    });

    it("rejects owner/project/context binding mismatches and D5 generic routing", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        const model = runtime(registry);
        await expect(
            model.execute(
                await input("wrong-owner", {
                    request: request({ ownerId: "other-owner" }),
                }),
                new AbortController().signal,
            ),
        ).rejects.toBeInstanceOf(J13ModelRuntimeError);
        await expect(
            model.execute(
                await input("d5", {
                    request: request({
                        processingTarget: "LOCAL",
                        dataPolicy: {
                            ...dataPolicy,
                            classification: "D5",
                            privacy: "local-only",
                            consent: {
                                ...dataPolicy.consent,
                                externalAI: false,
                            },
                        },
                        context: {
                            packageId: "d5",
                            classification: "D5",
                            privacy: "local-only",
                            externalAI: false,
                            minimized: true,
                            containsSecretMaterial: true,
                        },
                    }),
                }),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_POLICY_DENIED" });
    });

    it("enforces the J1.2 classification ceiling at model dispatch", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        const lowEnvelope = await new ContextAssembler({
            verify: () => true,
        }).assemble(authority, [contextSource()], {
            ...contextPolicy,
            classificationCeiling: "D1",
        });
        await expect(
            runtime(registry).execute(
                await input("ceiling", { context: lowEnvelope }),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_POLICY_DENIED" });
    });

    it("preserves local/private/external disclosure boundaries", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        const privateEnvelope = await new ContextAssembler({
            verify: () => true,
        }).assemble(authority, [contextSource()], {
            ...contextPolicy,
            disclosureTarget: "private",
        });
        await expect(
            runtime(registry).execute(
                await input("private-context", { context: privateEnvelope }),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_POLICY_DENIED" });
    });

    it("keeps deterministic routing and policy allow/deny/capability/budget checks", () => {
        const registry = new ModelProviderRegistry();
        registry.register(
            new SyntheticModelAdapter(
                descriptor({
                    providerId: "b",
                    modelId: "m",
                    inputCostPerMillion: 2,
                }),
            ),
        );
        registry.register(
            new SyntheticModelAdapter(
                descriptor({
                    providerId: "a",
                    modelId: "m",
                    inputCostPerMillion: 1,
                }),
            ),
        );
        const router = new ModelRouter(registry);
        const decisionA = router.select(request(), route());
        const decisionB = router.select(request(), route());
        expect(decisionA).toEqual(decisionB);
        expect(decisionA.selectedProviderId).toBe("a");
        expect(
            router.select(request(), route({ deniedProviderIds: ["a"] }))
                .selectedProviderId,
        ).toBe("b");
        expect(
            router.select(
                request({ requiredCapabilities: ["vision"] }),
                route(),
            ).selectedProviderId,
        ).toBeNull();
        expect(
            router.select(request({ maxCost: 0 }), route()).selectedProviderId,
        ).toBeNull();
    });

    it("supports cheapest, fastest, quality, local-private, pinned and fallback-chain routing modes", () => {
        const registry = new ModelProviderRegistry();
        registry.register(
            new SyntheticModelAdapter(
                descriptor({
                    providerId: "cheap",
                    modelId: "m",
                    inputCostPerMillion: 1,
                    outputCostPerMillion: 1,
                    latencyClass: "standard",
                    qualityTier: 40,
                }),
            ),
        );
        registry.register(
            new SyntheticModelAdapter(
                descriptor({
                    providerId: "fast",
                    modelId: "m",
                    inputCostPerMillion: 10,
                    outputCostPerMillion: 10,
                    latencyClass: "low",
                    qualityTier: 50,
                }),
            ),
        );
        registry.register(
            new SyntheticModelAdapter(
                descriptor({
                    providerId: "quality",
                    modelId: "q",
                    inputCostPerMillion: 20,
                    outputCostPerMillion: 20,
                    latencyClass: "high",
                    qualityTier: 100,
                    reliabilityTier: 100,
                }),
            ),
        );
        registry.register(
            new SyntheticModelAdapter(
                descriptor({
                    providerId: "local",
                    modelId: "m",
                    locality: "LOCAL",
                    inputCostPerMillion: 5,
                    outputCostPerMillion: 5,
                }),
            ),
        );
        const router = new ModelRouter(registry);
        expect(
            router.select(request(), route({ strategy: "cheapest-eligible" }))
                .selectedProviderId,
        ).toBe("cheap");
        expect(
            router.select(request(), route({ strategy: "fastest-eligible" }))
                .selectedProviderId,
        ).toBe("fast");
        expect(
            router.select(
                request(),
                route({ strategy: "highest-quality-eligible" }),
            ).selectedProviderId,
        ).toBe("quality");
        expect(
            router.select(
                request(),
                route({ strategy: "local-private-preferred" }),
            ).selectedProviderId,
        ).toBe("local");
        expect(
            router.select(
                request(),
                route({
                    strategy: "pinned",
                    pinnedProviderId: "quality",
                    pinnedModelId: "q",
                }),
            ).selectedProviderId,
        ).toBe("quality");
        expect(
            router.select(
                request(),
                route({
                    strategy: "fallback-chain",
                    preferredProviderIds: ["fast", "cheap"],
                }),
            ).selectedProviderId,
        ).toBe("fast");
        expect(
            router.select(
                request(),
                route({
                    strategy: "pinned",
                    pinnedProviderId: "quality",
                    pinnedModelId: "q",
                    deniedProviderIds: ["quality"],
                }),
            ).selectedProviderId,
        ).toBeNull();
    });

    it("bounds retries and performs only policy-eligible fallback", async () => {
        const registry = new ModelProviderRegistry();
        const primary = new SyntheticModelAdapter(
            descriptor({ providerId: "primary", modelId: "m" }),
            { failuresBeforeSuccess: 10, retryableFailure: true },
        );
        const fallback = new SyntheticModelAdapter(
            descriptor({ providerId: "fallback", modelId: "m" }),
        );
        registry.register(primary);
        registry.register(fallback);
        const result = await runtime(registry).execute(
            await input("fallback", {
                policy: {
                    ...policy,
                    route: route({
                        strategy: "fallback-chain",
                        preferredProviderIds: ["primary", "fallback"],
                        maxAttempts: 2,
                    }),
                },
            }),
            new AbortController().signal,
        );
        expect(primary.callCount()).toBe(2);
        expect(fallback.callCount()).toBe(1);
        expect(result.result.providerId).toBe("fallback");
        expect(result.fallbackPossible).toBe(true);
        expect(result.attemptsBound).toBe(4);
    });

    it("opens a failed primary circuit even when fallback succeeds", async () => {
        const registry = new ModelProviderRegistry();
        const primary = new SyntheticModelAdapter(
            descriptor({ providerId: "primary", modelId: "m" }),
            { failuresBeforeSuccess: 10, retryableFailure: true },
        );
        registry.register(primary);
        registry.register(
            new SyntheticModelAdapter(
                descriptor({ providerId: "fallback", modelId: "m" }),
            ),
        );
        const health = new J13ProviderHealth();
        const orchestrator = runtime(registry, () => true, health);
        await orchestrator.execute(
            await input("health-fallback", {
                policy: {
                    ...policy,
                    route: route({
                        strategy: "fallback-chain",
                        preferredProviderIds: ["primary", "fallback"],
                        maxAttempts: 2,
                    }),
                },
            }),
            new AbortController().signal,
        );
        expect(health.snapshot("primary", 1_000).state).toBe("circuit-open");
        expect(health.snapshot("fallback", 1_000).state).toBe("healthy");
    });

    it("rejects retry/fallback plans that exceed total logical operation budgets", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(
            new SyntheticModelAdapter(
                descriptor({ providerId: "a", modelId: "m" }),
            ),
        );
        registry.register(
            new SyntheticModelAdapter(
                descriptor({ providerId: "b", modelId: "m" }),
            ),
        );
        await expect(
            runtime(registry).execute(
                await input("attempt-limit", {
                    policy: { ...policy, operationAttemptLimit: 3 },
                }),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_POLICY_DENIED" });
        await expect(
            runtime(registry).execute(
                await input("token-limit", {
                    policy: { ...policy, operationMaxTokens: 700 },
                }),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_BUDGET_EXCEEDED" });
        await expect(
            runtime(registry).execute(
                await input("cost-limit", {
                    policy: { ...policy, operationMaxCost: 0.001 },
                }),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_BUDGET_EXCEEDED" });
    });

    it("represents unknown estimated and actual provider cost explicitly", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(
            new ReferenceModelAdapter(
                descriptor({
                    providerId: "unknown-cost",
                    modelId: "m",
                    pricingKnown: false,
                }),
                {
                    invoke: async (model, modelInput) => ({
                        version: 1,
                        requestId: modelInput.requestId,
                        providerId: model.providerId,
                        modelId: model.modelId,
                        text: "unknown-cost-result",
                        structured: null,
                        usage: {
                            inputTokens: modelInput.inputTokenEstimate,
                            outputTokens: 1,
                            totalTokens: modelInput.inputTokenEstimate + 1,
                            cost: null,
                        },
                        finishReason: "stop",
                        verified: false,
                    }),
                },
            ),
        );
        const router = new ModelRouter(registry);
        expect(router.select(request(), route()).selectedProviderId).toBeNull();
        expect(
            router.select(request(), route({ allowUnknownCost: true }))
                .selectedProviderId,
        ).toBe("unknown-cost");
        const result = await runtime(
            registry,
            () => true,
            new J13ProviderHealth(),
            undefined,
            router,
        ).execute(
            await input("unknown-cost", {
                policy: {
                    ...policy,
                    route: route({ allowUnknownCost: true }),
                    operationAllowUnknownCost: true,
                },
            }),
            new AbortController().signal,
        );
        expect(result.selectedEstimatedMaximumCost).toBeNull();
        expect(result.actualCost).toBeNull();
        expect(result.costStatus).toBe("unknown");
    });

    it("propagates owner cancellation and reports discarded late work honestly", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(
            new SyntheticModelAdapter(descriptor(), {
                delayMs: 100,
                responseText: "late",
            }),
        );
        const controller = new AbortController();
        const pending = runtime(registry).execute(
            await input("cancel"),
            controller.signal,
        );
        controller.abort();
        await expect(pending).rejects.toMatchObject({
            code: "MODEL_CANCELLED",
            cancellationState: "requested-result-discarded",
        });
    });

    it("distinguishes the orchestration timeout from owner cancellation", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(
            new SyntheticModelAdapter(descriptor(), { delayMs: 100 }),
        );
        await expect(
            runtime(registry).execute(
                await input("timeout", {
                    policy: { ...policy, operationTimeoutMs: 5 },
                }),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
    });

    it("deduplicates an exact logical operation and rejects a changed digest", async () => {
        const registry = new ModelProviderRegistry();
        const adapter = new SyntheticModelAdapter(descriptor());
        registry.register(adapter);
        const orchestrator = runtime(registry);
        const sameInput = await input("same-operation");
        const [a, b] = await Promise.all([
            orchestrator.execute(sameInput, new AbortController().signal),
            orchestrator.execute(sameInput, new AbortController().signal),
        ]);
        expect(a.operationId).toBe(b.operationId);
        expect(adapter.callCount()).toBe(1);
        await expect(
            orchestrator.execute(
                { ...sameInput, operationDigest: "e".repeat(64) },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_OPERATION_CONFLICT" });
    });

    it("opens and recovers provider circuit deterministically", () => {
        const health = new J13ProviderHealth();
        expect(health.snapshot("p", 0).state).toBe("healthy");
        expect(health.recordFailure("p", "x", 10, 2, 100).state).toBe(
            "degraded",
        );
        expect(health.recordFailure("p", "x", 20, 2, 100).state).toBe(
            "circuit-open",
        );
        expect(health.snapshot("p", 50).state).toBe("circuit-open");
        expect(health.snapshot("p", 120).state).toBe("degraded");
        expect(health.recordSuccess("p", 130).state).toBe("healthy");
    });

    it("proves a second provider-compatible adapter without vendor SDK authority", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(
            new ReferenceModelAdapter(
                descriptor({ providerId: "reference", modelId: "ref" }),
                {
                    invoke: async (model, modelInput, signal) => {
                        if (signal.aborted)
                            throw new ModelProviderFailure(
                                "MODEL_CANCELLED",
                                false,
                            );
                        return {
                            version: 1,
                            requestId: modelInput.requestId,
                            providerId: model.providerId,
                            modelId: model.modelId,
                            text: "reference result",
                            structured: null,
                            usage: {
                                inputTokens: modelInput.inputTokenEstimate,
                                outputTokens: 2,
                                totalTokens: modelInput.inputTokenEstimate + 2,
                                cost: 0,
                            },
                            finishReason: "stop",
                            verified: false,
                        };
                    },
                },
            ),
        );
        const result = await runtime(registry).execute(
            await input("reference-adapter"),
            new AbortController().signal,
        );
        expect(result.result.providerId).toBe("reference");
    });

    it("fails closed for malformed runtime policy and malformed operation digest", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        await expect(
            runtime(registry).execute(
                await input("bad-policy", {
                    policy: { ...policy, operationTimeoutMs: -1 },
                }),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_POLICY_DENIED" });
        await expect(
            runtime(registry).execute(
                await input("bad-digest", { operationDigest: "plaintext" }),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_OPERATION_CONFLICT" });
    });

    it("keeps audit metadata free of prompt, context payload and credential references", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        const records: J13AuditRecord[] = [];
        const orchestrator = runtime(
            registry,
            () => true,
            new J13ProviderHealth(),
            {
                append: (record) => records.push(record),
            },
        );
        await orchestrator.execute(
            await input("audit-safe"),
            new AbortController().signal,
        );
        const serialized = JSON.stringify(records);
        expect(serialized).not.toContain("answer using authorized context");
        expect(serialized).not.toContain("context content");
        expect(serialized).not.toContain("vault://models/provider-a");
        expect(records.length).toBeGreaterThan(1);
    });
});
