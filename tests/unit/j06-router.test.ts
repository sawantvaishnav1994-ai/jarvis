import { describe, expect, it } from "vitest";
import {
    J06ModelRequestSchema,
    ModelProviderRegistry,
    ModelRouter,
    ModelRoutingError,
    SyntheticModelAdapter,
    type J06ModelRequest,
    type ModelAuditRecord,
    type ModelDescriptor,
    type ModelRoutePolicy,
} from "@jarvis/models";

const basePolicy = {
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
        requestId: "req-1",
        ownerId: "owner",
        projectId: "jarvis",
        messages: [{ role: "user", content: "explain the current project state" }],
        requiredCapabilities: ["text", "reasoning"],
        processingTarget: "APPROVED_EXTERNAL",
        dataPolicy: basePolicy,
        context: {
            packageId: "ctx-1",
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
        timeoutMs: 2_000,
        responseFormat: "text",
        contractId: null,
        ...over,
    });

const descriptor = (over: Partial<ModelDescriptor> = {}): ModelDescriptor => ({
    version: 1,
    providerId: "provider-a",
    modelId: "reasoner-a",
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

const routePolicy = (over: Partial<ModelRoutePolicy> = {}): ModelRoutePolicy => ({
    allowedProviderIds: [],
    deniedProviderIds: [],
    preferredProviderIds: [],
    allowDegraded: false,
    maxAttempts: 2,
    ...over,
});

describe("J0.6 model abstraction router", () => {
    it("preserves one provider-neutral request/result contract across two adapters", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor({ providerId: "a", modelId: "m" })));
        registry.register(new SyntheticModelAdapter(descriptor({ providerId: "b", modelId: "m" })));
        const router = new ModelRouter(registry);
        const a = await router.execute(request(), routePolicy({ allowedProviderIds: ["a"] }), new AbortController().signal);
        const b = await router.execute(request(), routePolicy({ allowedProviderIds: ["b"] }), new AbortController().signal);
        expect(Object.keys(a.result).sort()).toEqual(Object.keys(b.result).sort());
        expect(a.result.providerId).toBe("a");
        expect(b.result.providerId).toBe("b");
    });

    it("validates and queries explicit model capabilities", () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        expect(registry.list()[0]?.capabilities).toEqual(expect.arrayContaining(["text", "reasoning"]));
        const decision = new ModelRouter(registry).select(
            request({ requiredCapabilities: ["vision"] }),
            routePolicy(),
        );
        expect(decision.selectedProviderId).toBeNull();
        expect(decision.candidates[0]?.rejectionCodes).toContain("CAPABILITY_MISMATCH");
    });

    it("keeps local-only context away from external providers", () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        registry.register(new SyntheticModelAdapter(descriptor({ providerId: "local", modelId: "local", locality: "LOCAL", inputCostPerMillion: 0, outputCostPerMillion: 0 })));
        const localRequest = request({
            processingTarget: "LOCAL",
            dataPolicy: { ...basePolicy, classification: "D5", privacy: "local-only", consent: { ...basePolicy.consent, externalAI: false } },
            context: { packageId: "ctx-secret", classification: "D5", privacy: "local-only", externalAI: false, minimized: true, containsSecretMaterial: true },
        });
        const decision = new ModelRouter(registry).select(localRequest, routePolicy());
        expect(decision.selectedProviderId).toBe("local");
        expect(decision.candidates.find((x) => x.providerId === "provider-a")?.eligible).toBe(false);
    });

    it("rejects a non-local provider boundary containing secret material", () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        expect(() => new ModelRouter(registry).select(request({ context: { packageId: "ctx-secret", classification: "D5", privacy: "local-only", externalAI: false, minimized: true, containsSecretMaterial: true } }), routePolicy())).toThrowError(ModelRoutingError);
    });

    it("requires explicit external AI consent for approved external routing", () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        expect(() => new ModelRouter(registry).select(request({ dataPolicy: { ...basePolicy, consent: { ...basePolicy.consent, externalAI: false } } }), routePolicy())).toThrowError(ModelRoutingError);
    });

    it("routes deterministically for identical inputs", () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor({ providerId: "b", modelId: "m" })));
        registry.register(new SyntheticModelAdapter(descriptor({ providerId: "a", modelId: "m" })));
        const router = new ModelRouter(registry);
        const p = routePolicy({ preferredProviderIds: ["b"] });
        expect(router.select(request(), p)).toEqual(router.select(request(), p));
        expect(router.select(request(), p).selectedProviderId).toBe("b");
    });

    it("fallback preserves the same eligibility policy", async () => {
        const registry = new ModelProviderRegistry();
        const primary = new SyntheticModelAdapter(descriptor({ providerId: "primary", modelId: "m" }), { failuresBeforeSuccess: 10, retryableFailure: false });
        const fallback = new SyntheticModelAdapter(descriptor({ providerId: "fallback", modelId: "m" }));
        registry.register(primary);
        registry.register(fallback);
        const router = new ModelRouter(registry);
        const result = await router.execute(request(), routePolicy({ preferredProviderIds: ["primary", "fallback"], maxAttempts: 1 }), new AbortController().signal);
        expect(result.result.providerId).toBe("fallback");
        expect(primary.callCount()).toBe(1);
        expect(fallback.callCount()).toBe(1);
    });

    it("bounds retry attempts", async () => {
        const registry = new ModelProviderRegistry();
        const flaky = new SyntheticModelAdapter(descriptor(), { failuresBeforeSuccess: 2, retryableFailure: true });
        registry.register(flaky);
        const router = new ModelRouter(registry);
        const result = await router.execute(request(), routePolicy({ maxAttempts: 3 }), new AbortController().signal);
        expect(result.result.providerId).toBe("provider-a");
        expect(flaky.callCount()).toBe(3);
    });

    it("excludes disabled unavailable and disallowed degraded providers", () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor({ providerId: "disabled", modelId: "m", health: "DISABLED" })));
        registry.register(new SyntheticModelAdapter(descriptor({ providerId: "down", modelId: "m", health: "UNAVAILABLE" })));
        registry.register(new SyntheticModelAdapter(descriptor({ providerId: "degraded", modelId: "m", health: "DEGRADED" })));
        const decision = new ModelRouter(registry).select(request(), routePolicy());
        expect(decision.selectedProviderId).toBeNull();
        expect(decision.candidates.every((x) => !x.eligible)).toBe(true);
    });

    it("constrains provider eligibility by token and monetary budgets", () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor({ inputCostPerMillion: 1000, outputCostPerMillion: 1000 })));
        const costDecision = new ModelRouter(registry).select(request({ maxCost: 0.00001 }), routePolicy());
        expect(costDecision.candidates[0]?.rejectionCodes).toContain("COST_BUDGET");
        const tokenDecision = new ModelRouter(registry).select(request({ maxTotalTokens: 150 }), routePolicy());
        expect(tokenDecision.candidates[0]?.rejectionCodes).toContain("TOKEN_BUDGET");
    });

    it("rejects invalid structured output as untrusted model data", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor(), { responseText: "not-json" }));
        const router = new ModelRouter(registry);
        await expect(router.execute(request({ responseFormat: "json", contractId: "answer.v1", requiredCapabilities: ["structured-output"] }), routePolicy(), new AbortController().signal)).rejects.toMatchObject({ code: "ALL_ELIGIBLE_PROVIDERS_FAILED" });
    });

    it("audit evidence contains routing metadata but no prompt or secret field", async () => {
        const records: ModelAuditRecord[] = [];
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor()));
        const router = new ModelRouter(registry, { append: (record) => records.push(record) });
        await router.execute(request(), routePolicy(), new AbortController().signal);
        expect(records.length).toBeGreaterThan(0);
        const serialized = JSON.stringify(records);
        expect(serialized).not.toContain("explain the current project state");
        expect(serialized).not.toContain("vault://models/provider-a");
    });

    it("fails explicitly when no provider is eligible", async () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor({ health: "UNAVAILABLE" })));
        const router = new ModelRouter(registry);
        await expect(router.execute(request(), routePolicy(), new AbortController().signal)).rejects.toMatchObject({ code: "NO_ELIGIBLE_PROVIDER" });
    });

    it("owner inspection can explain descriptors and rejection reasons without credentials", () => {
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor({ health: "DEGRADED" })));
        const listed = registry.list();
        const decision = new ModelRouter(registry).select(request(), routePolicy());
        expect(listed[0]).toMatchObject({ providerId: "provider-a", health: "DEGRADED" });
        expect(decision.candidates[0]?.rejectionCodes).toContain("DEGRADED_NOT_ALLOWED");
        const safeView = listed.map(({ credentialRef: _credentialRef, ...rest }) => rest);
        expect(JSON.stringify(safeView)).not.toContain("vault://");
    });

    it("synthetic streaming preserves sequence and honors cancellation", async () => {
        const adapter = new SyntheticModelAdapter(descriptor(), { responseText: "one two three" });
        const chunks = [];
        for await (const chunk of adapter.stream!(request({ requiredCapabilities: ["streaming"] }), new AbortController().signal)) chunks.push(chunk);
        expect(chunks.map((x) => x.sequence)).toEqual([0, 1, 2]);
        expect(chunks.at(-1)?.done).toBe(true);
        const controller = new AbortController();
        controller.abort();
        const iterator = adapter.stream!(request({ requiredCapabilities: ["streaming"] }), controller.signal)[Symbol.asyncIterator]();
        await expect(iterator.next()).rejects.toMatchObject({ code: "SYNTHETIC_ABORTED" });
    });
});
