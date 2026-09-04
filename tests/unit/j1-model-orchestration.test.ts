import { describe, expect, it } from "vitest";
import {
    ContextAssembler,
    J13ModelOrchestrator,
    J13ModelRuntimeError,
    J13ProviderHealth,
    type ContextAssemblyAuthority,
    type ContextCandidateSource,
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
) {
    let id = 0;
    return new J13ModelOrchestrator(
        new ModelRouter(registry),
        { verify: authorityValid },
        { create: () => `operation-${++id}` },
        { now: () => 1_000 },
    );
}

const policy = {
    route: route(),
    operationTimeoutMs: 2_000,
    circuitFailureThreshold: 2,
    circuitResetMs: 5_000,
};

describe("J1.3 model orchestration runtime", () => {
    it("executes an authorized J1.2 envelope and treats output as content only", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        const result = await runtime(registry).execute(
            {
                operationKey: "turn-1:model",
                authority,
                context: await envelope(),
                request: request(),
                policy,
            },
            new AbortController().signal,
        );
        expect(result.result.providerId).toBe("provider-a");
        expect(result.acceptedAsContentOnly).toBe(true);
        expect(result.turnId).toBe("turn-1");
    });

    it("fails closed when current authority is stale or revoked", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        await expect(
            runtime(registry, () => false).execute(
                {
                    operationKey: "revoked",
                    authority,
                    context: await envelope(),
                    request: request(),
                    policy,
                },
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
                {
                    operationKey: "wrong-owner",
                    authority,
                    context: await envelope(),
                    request: request({ ownerId: "other-owner" }),
                    policy,
                },
                new AbortController().signal,
            ),
        ).rejects.toBeInstanceOf(J13ModelRuntimeError);
        await expect(
            model.execute(
                {
                    operationKey: "d5",
                    authority,
                    context: await envelope(),
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
                    policy,
                },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_POLICY_DENIED" });
    });

    it("preserves external disclosure boundary from J1.2", async () => {
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
                {
                    operationKey: "private-context",
                    authority,
                    context: privateEnvelope,
                    request: request(),
                    policy,
                },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_POLICY_DENIED" });
    });

    it("keeps deterministic routing and policy allow/deny/capability/budget checks", async () => {
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
            {
                operationKey: "fallback",
                authority,
                context: await envelope(),
                request: request(),
                policy: {
                    ...policy,
                    route: route({
                        preferredProviderIds: ["primary", "fallback"],
                        maxAttempts: 2,
                    }),
                },
            },
            new AbortController().signal,
        );
        expect(primary.callCount()).toBe(2);
        expect(fallback.callCount()).toBe(1);
        expect(result.result.providerId).toBe("fallback");
        expect(result.fallbackPossible).toBe(true);
    });

    it("propagates cancellation and discards late work", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(
            new SyntheticModelAdapter(descriptor(), {
                delayMs: 100,
                responseText: "late",
            }),
        );
        const controller = new AbortController();
        const pending = runtime(registry).execute(
            {
                operationKey: "cancel",
                authority,
                context: await envelope(),
                request: request(),
                policy,
            },
            controller.signal,
        );
        controller.abort();
        await expect(pending).rejects.toMatchObject({
            code: "MODEL_CANCELLED",
        });
    });

    it("deduplicates the same logical operation key", async () => {
        const registry = new ModelProviderRegistry();
        const adapter = new SyntheticModelAdapter(descriptor());
        registry.register(adapter);
        const orchestrator = runtime(registry);
        const input = {
            operationKey: "same-operation",
            authority,
            context: await envelope(),
            request: request(),
            policy,
        };
        const [a, b] = await Promise.all([
            orchestrator.execute(input, new AbortController().signal),
            orchestrator.execute(input, new AbortController().signal),
        ]);
        expect(a.operationId).toBe(b.operationId);
        expect(adapter.callCount()).toBe(1);
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
                    invoke: async (model, input, signal) => {
                        if (signal.aborted)
                            throw new ModelProviderFailure(
                                "MODEL_CANCELLED",
                                false,
                            );
                        return {
                            version: 1,
                            requestId: input.requestId,
                            providerId: model.providerId,
                            modelId: model.modelId,
                            text: "reference result",
                            structured: null,
                            usage: {
                                inputTokens: input.inputTokenEstimate,
                                outputTokens: 2,
                                totalTokens: input.inputTokenEstimate + 2,
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
            {
                operationKey: "reference-adapter",
                authority,
                context: await envelope(),
                request: request(),
                policy,
            },
            new AbortController().signal,
        );
        expect(result.result.providerId).toBe("reference");
    });

    it("fails closed for malformed runtime policy", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        await expect(
            runtime(registry).execute(
                {
                    operationKey: "bad-policy",
                    authority,
                    context: await envelope(),
                    request: request(),
                    policy: { ...policy, operationTimeoutMs: -1 },
                },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_POLICY_DENIED" });
    });
});
