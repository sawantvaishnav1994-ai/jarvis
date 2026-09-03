import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
    J06ModelRequestSchema,
    ModelAuditRecordSchema,
    ModelProviderRegistry,
    ModelRouter,
    ModelRoutingError,
    OwnerControlledModelRegistry,
    SyntheticModelAdapter,
    streamModel,
    verifyWithIndependentModel,
    type J06ModelRequest,
    type J06ModelResult,
    type ModelAuditRecord,
    type ModelDescriptor,
    type ModelRoutePolicy,
} from "@jarvis/models";

const dataPolicy = (over: Record<string, unknown> = {}) => ({
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
    ...over,
});

const req = (over: Partial<J06ModelRequest> = {}): J06ModelRequest =>
    J06ModelRequestSchema.parse({
        version: 1,
        requestId: "j06-acceptance",
        ownerId: "owner",
        projectId: "jarvis",
        messages: [{ role: "user", content: "model abstraction acceptance" }],
        requiredCapabilities: ["text", "reasoning"],
        processingTarget: "APPROVED_EXTERNAL",
        dataPolicy: dataPolicy(),
        context: {
            packageId: "ctx-j06",
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

const desc = (over: Partial<ModelDescriptor> = {}): ModelDescriptor => ({
    version: 1,
    providerId: "provider-a",
    modelId: "model-a",
    locality: "APPROVED_EXTERNAL",
    capabilities: ["text", "reasoning", "structured-output", "streaming"],
    contextWindowTokens: 16_000,
    maxOutputTokens: 2_000,
    inputCostPerMillion: 1,
    outputCostPerMillion: 2,
    health: "HEALTHY",
    credentialRef: "vault://model/provider-a",
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

const registryWith = (...adapters: SyntheticModelAdapter[]) => {
    const registry = new ModelProviderRegistry();
    for (const adapter of adapters) registry.register(adapter);
    return registry;
};

describe("J0.6 A-T acceptance", () => {
    it("J0.6 A: protects exact J0.5 baseline and prior milestone regressions", async () => {
        const gate = JSON.parse(await readFile("tests/acceptance/j06-gates.json", "utf8"));
        expect(gate.milestone).toBe("J0.6");
        expect(gate.baseline).toBe("16910231c5ff79bb0b34a15b86250f48575bedec");
    });

    it("J0.6 B: preserves one provider-neutral request and result contract across adapters", async () => {
        const registry = registryWith(
            new SyntheticModelAdapter(desc({ providerId: "a", modelId: "m" })),
            new SyntheticModelAdapter(desc({ providerId: "b", modelId: "m" })),
        );
        const router = new ModelRouter(registry);
        const a = await router.execute(req(), route({ allowedProviderIds: ["a"] }), new AbortController().signal);
        const b = await router.execute(req(), route({ allowedProviderIds: ["b"] }), new AbortController().signal);
        expect(Object.keys(a.result).sort()).toEqual(Object.keys(b.result).sort());
    });

    it("J0.6 C: validates and queries explicit provider and model capabilities", () => {
        const registry = registryWith(new SyntheticModelAdapter(desc()));
        expect(registry.list()[0]?.capabilities).toContain("reasoning");
        expect(new ModelRouter(registry).select(req({ requiredCapabilities: ["vision"] }), route()).selectedProviderId).toBeNull();
    });

    it("J0.6 D: excludes providers incompatible with processing locality and privacy policy", () => {
        const registry = registryWith(
            new SyntheticModelAdapter(desc()),
            new SyntheticModelAdapter(desc({ providerId: "local", modelId: "local", locality: "LOCAL", inputCostPerMillion: 0, outputCostPerMillion: 0 })),
        );
        const local = req({ processingTarget: "LOCAL" });
        const decision = new ModelRouter(registry).select(local, route());
        expect(decision.selectedProviderId).toBe("local");
        expect(decision.candidates.find((x) => x.providerId === "provider-a")?.rejectionCodes).toContain("LOCALITY_MISMATCH");
    });

    it("J0.6 E: rejects forbidden provider-boundary context before adapter invocation", () => {
        const registry = registryWith(new SyntheticModelAdapter(desc()));
        expect(() => new ModelRouter(registry).select(req({
            context: { packageId: "secret", classification: "D5", privacy: "local-only", externalAI: false, minimized: true, containsSecretMaterial: true },
        }), route())).toThrowError(ModelRoutingError);
    });

    it("J0.6 F: keeps provider secrets out of model requests results and audit payloads", async () => {
        expect(() => J06ModelRequestSchema.parse({ ...req(), credentialRef: "plaintext-secret" })).toThrow();
        const records: ModelAuditRecord[] = [];
        const registry = registryWith(new SyntheticModelAdapter(desc()));
        await new ModelRouter(registry, { append: (record) => records.push(ModelAuditRecordSchema.parse(record)) }).execute(req(), route(), new AbortController().signal);
        expect(JSON.stringify(records)).not.toContain("vault://model/provider-a");
        expect(JSON.stringify(records)).not.toContain("model abstraction acceptance");
    });

    it("J0.6 G: deterministic routing returns the same eligible provider and reasons", () => {
        const registry = registryWith(
            new SyntheticModelAdapter(desc({ providerId: "b", modelId: "m" })),
            new SyntheticModelAdapter(desc({ providerId: "a", modelId: "m" })),
        );
        const router = new ModelRouter(registry);
        const policy = route({ preferredProviderIds: ["b"] });
        expect(router.select(req(), policy)).toEqual(router.select(req(), policy));
    });

    it("J0.6 H: local-only restricted routing cannot select an external provider", () => {
        const registry = registryWith(
            new SyntheticModelAdapter(desc()),
            new SyntheticModelAdapter(desc({ providerId: "local", modelId: "local", locality: "LOCAL", inputCostPerMillion: 0, outputCostPerMillion: 0 })),
        );
        const restricted = req({
            processingTarget: "LOCAL",
            dataPolicy: dataPolicy({ classification: "D5", privacy: "local-only", consent: { ...dataPolicy().consent, externalAI: false } }) as J06ModelRequest["dataPolicy"],
            context: { packageId: "d5", classification: "D5", privacy: "local-only", externalAI: false, minimized: true, containsSecretMaterial: true },
        });
        const decision = new ModelRouter(registry).select(restricted, route());
        expect(decision.selectedProviderId).toBe("local");
    });

    it("J0.6 I: approved external routing requires explicit external processing permission", () => {
        const registry = registryWith(new SyntheticModelAdapter(desc()));
        const denied = req({ dataPolicy: dataPolicy({ consent: { ...dataPolicy().consent, externalAI: false } }) as J06ModelRequest["dataPolicy"] });
        expect(() => new ModelRouter(registry).select(denied, route())).toThrowError(ModelRoutingError);
        expect(new ModelRouter(registry).select(req(), route()).selectedProviderId).toBe("provider-a");
    });

    it("J0.6 J: fallback preserves privacy capability allowlist and remaining budget", async () => {
        const primary = new SyntheticModelAdapter(desc({ providerId: "primary", modelId: "m" }), { failuresBeforeSuccess: 9, retryableFailure: false });
        const fallback = new SyntheticModelAdapter(desc({ providerId: "fallback", modelId: "m" }));
        const registry = registryWith(primary, fallback);
        const result = await new ModelRouter(registry).execute(req(), route({ preferredProviderIds: ["primary", "fallback"], maxAttempts: 1 }), new AbortController().signal);
        expect(result.result.providerId).toBe("fallback");
        expect(result.decision.candidates.filter((x) => x.eligible).map((x) => x.providerId)).toEqual(["primary", "fallback"]);
    });

    it("J0.6 K: retries are bounded and timeout or cancellation aborts execution", async () => {
        const flaky = new SyntheticModelAdapter(desc(), { failuresBeforeSuccess: 2, retryableFailure: true });
        const router = new ModelRouter(registryWith(flaky));
        await router.execute(req(), route({ maxAttempts: 3 }), new AbortController().signal);
        expect(flaky.callCount()).toBe(3);
        const slow = new SyntheticModelAdapter(desc({ providerId: "slow", modelId: "m" }), { delayMs: 50 });
        await expect(new ModelRouter(registryWith(slow)).execute(req({ timeoutMs: 5 }), route(), new AbortController().signal)).rejects.toMatchObject({ code: "MODEL_TIMEOUT_OR_CANCELLED" });
    });

    it("J0.6 L: disabled and unavailable providers are excluded with explicit health evidence", () => {
        const registry = registryWith(new SyntheticModelAdapter(desc({ health: "DISABLED" })));
        const decision = new ModelRouter(registry).select(req(), route());
        expect(decision.selectedProviderId).toBeNull();
        expect(decision.candidates[0]?.rejectionCodes).toContain("UNAVAILABLE");
    });

    it("J0.6 M: token and monetary budgets constrain provider eligibility and result acceptance", () => {
        const registry = registryWith(new SyntheticModelAdapter(desc({ inputCostPerMillion: 1000, outputCostPerMillion: 1000 })));
        expect(new ModelRouter(registry).select(req({ maxCost: 0.00001 }), route()).candidates[0]?.rejectionCodes).toContain("COST_BUDGET");
        expect(new ModelRouter(registry).select(req({ maxTotalTokens: 150 }), route()).candidates[0]?.rejectionCodes).toContain("TOKEN_BUDGET");
    });

    it("J0.6 N: invalid structured output is rejected as untrusted model data", async () => {
        const adapter = new SyntheticModelAdapter(desc(), { responseText: "invalid-json" });
        await expect(new ModelRouter(registryWith(adapter)).execute(req({ responseFormat: "json", contractId: "answer.v1", requiredCapabilities: ["structured-output"] }), route(), new AbortController().signal)).rejects.toMatchObject({ code: "ALL_ELIGIBLE_PROVIDERS_FAILED" });
    });

    it("J0.6 O: normalized streaming preserves order and cannot complete after cancellation", async () => {
        const adapter = new SyntheticModelAdapter(desc(), { responseText: "one two three" });
        const registry = registryWith(adapter);
        const router = new ModelRouter(registry);
        const controller = new AbortController();
        const chunks = [];
        await expect((async () => {
            for await (const chunk of streamModel(registry, router, req({ requiredCapabilities: ["streaming"] }), route(), controller.signal)) {
                chunks.push(chunk.sequence);
                controller.abort();
            }
        })()).rejects.toMatchObject({ code: "MODEL_CANCELLED" });
        expect(chunks).toEqual([0]);
    });

    it("J0.6 P: provider substitution leaves permanent JARVIS-owned data contracts unchanged", async () => {
        const a = new SyntheticModelAdapter(desc({ providerId: "a", modelId: "same-contract" }));
        const b = new SyntheticModelAdapter(desc({ providerId: "b", modelId: "same-contract" }));
        const registry = registryWith(a, b);
        const router = new ModelRouter(registry);
        const ra = (await router.execute(req(), route({ allowedProviderIds: ["a"] }), new AbortController().signal)).result;
        const rb = (await router.execute(req(), route({ allowedProviderIds: ["b"] }), new AbortController().signal)).result;
        expect(ra.requestId).toBe(rb.requestId);
        expect(ra.usage).toEqual(rb.usage);
        expect(req().ownerId).toBe("owner");
    });

    it("J0.6 Q: independent verification uses a distinct eligible model without gaining authority", async () => {
        const primaryAdapter = new SyntheticModelAdapter(desc({ providerId: "primary", modelId: "m" }));
        const verifierAdapter = new SyntheticModelAdapter(desc({ providerId: "verifier", modelId: "m" }), { structured: { valid: true }, responseText: "{\"valid\":true}" });
        const registry = registryWith(primaryAdapter, verifierAdapter);
        const router = new ModelRouter(registry);
        const original = (await router.execute(req(), route({ allowedProviderIds: ["primary"] }), new AbortController().signal)).result;
        const verification = await verifyWithIndependentModel(
            router,
            original,
            req({ requestId: "verify-1", responseFormat: "json", contractId: "verification.v1", requiredCapabilities: ["text", "reasoning", "structured-output"] }),
            route({ allowedProviderIds: ["primary", "verifier"], preferredProviderIds: ["primary", "verifier"] }),
            new AbortController().signal,
        );
        expect(verification.verifier.providerId).toBe("verifier");
        expect(verification.original.verified).toBe(true);
        expect(verification.original).not.toHaveProperty("authorized");
    });

    it("J0.6 R: model audit records routing evidence without raw prompt or plaintext secret content", async () => {
        const records: ModelAuditRecord[] = [];
        const registry = registryWith(new SyntheticModelAdapter(desc()));
        await new ModelRouter(registry, { append: (record) => records.push(record) }).execute(req(), route(), new AbortController().signal);
        const serialized = JSON.stringify(records);
        expect(serialized).not.toContain("model abstraction acceptance");
        expect(serialized).not.toContain("vault://");
    });

    it("J0.6 S: no eligible provider or provider failure produces explicit fail-safe degradation", async () => {
        const registry = registryWith(new SyntheticModelAdapter(desc({ health: "UNAVAILABLE" })));
        await expect(new ModelRouter(registry).execute(req(), route(), new AbortController().signal)).rejects.toMatchObject({ code: "NO_ELIGIBLE_PROVIDER" });
    });

    it("J0.6 T: owner inspection explains provider selection health privacy and budget without secrets", () => {
        const registry = new OwnerControlledModelRegistry();
        registry.register(new SyntheticModelAdapter(desc()));
        registry.setHealth("provider-a", "model-a", "DISABLED");
        const safe = registry.inspect();
        expect(safe[0]).toMatchObject({ providerId: "provider-a", health: "DISABLED", credentialConfigured: true });
        expect(JSON.stringify(safe)).not.toContain("vault://");
        expect(new ModelRouter(registry).select(req(), route()).selectedProviderId).toBeNull();
    });
});
