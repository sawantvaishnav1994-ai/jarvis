import { describe, expect, it } from "vitest";
import { J14TurnPipeline, type J14TurnPipelineInput } from "@jarvis/core";
import type { J06ModelRequest } from "@jarvis/models";

const authority = {
    ownerId: "owner",
    conversationId: "33333333-3333-4333-8333-333333333333",
    sessionId: "11111111-1111-4111-8111-111111111111",
    turnId: "22222222-2222-4222-8222-222222222222",
    securityEpoch: 9,
    operatingMode: "assistant" as const,
    projectId: "jarvis",
};
const request: J06ModelRequest = {
    version: 1,
    requestId: "j14-security-request",
    ownerId: "owner",
    projectId: "jarvis",
    messages: [{ role: "user", content: "sensitive-input-marker" }],
    requiredCapabilities: ["text"],
    processingTarget: "APPROVED_EXTERNAL",
    dataPolicy: {
        version: 1,
        classification: "D2",
        privacy: "ai-allow",
        retention: { mode: "never-store" },
        consent: {
            storeConversation: false,
            createMemory: false,
            projectKnowledge: false,
            keepAttachments: false,
            personalization: false,
            externalAI: true,
        },
    },
    context: {
        packageId: "j14-security-context",
        classification: "D2",
        privacy: "ai-allow",
        externalAI: true,
        minimized: true,
        containsSecretMaterial: false,
    },
    inputTokenEstimate: 20,
    maxOutputTokens: 20,
    maxTotalTokens: 100,
    maxCost: 1,
    timeoutMs: 1_000,
    responseFormat: "text",
    contractId: null,
};
const base: J14TurnPipelineInput = {
    authority,
    conversationId: authority.conversationId,
    sessionId: authority.sessionId,
    turnId: authority.turnId,
    correlationId: "j14-security-correlation",
    idempotencyKey: "security-key",
    inputDigest: "1".repeat(64),
    contextDigest: "2".repeat(64),
    modelOperationDigest: "3".repeat(64),
    candidates: [
        {
            sourceType: "conversation",
            sourceId: "security-input",
            ownerId: "owner",
            projectId: "jarvis",
            provenance: "J1.1:turn-input",
            classification: "D2",
            freshness: 10,
            retention: "never-store",
            disclosureEligibility: true,
            digest: "4".repeat(64),
            trust: "trusted",
            priority: 100,
            size: 20,
            payload: "sensitive-context-marker",
        },
    ],
    contextPolicy: {
        disclosureTarget: "external-ai",
        classificationCeiling: "D2",
        maximumSize: 100,
        minimumFreshness: 0,
        allowUntrusted: false,
        now: 10,
    },
    modelRequest: request,
    modelPolicy: {
        route: {
            allowedProviderIds: [],
            deniedProviderIds: [],
            preferredProviderIds: [],
            allowDegraded: false,
            maxAttempts: 1,
        },
        operationTimeoutMs: 1_000,
        operationAttemptLimit: 1,
        operationMaxTokens: 100,
        operationMaxCost: 1,
        operationAllowUnknownCost: false,
        circuitFailureThreshold: 2,
        circuitResetMs: 1_000,
    },
};

function modelResult(text = "safe-response") {
    return {
        operationId: "op",
        turnId: authority.turnId,
        correlationId: "model-correlation",
        result: {
            version: 1 as const,
            requestId: request.requestId,
            providerId: "synthetic",
            modelId: "reasoner",
            text,
            structured: null,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cost: 0 },
            finishReason: "stop" as const,
            verified: true,
        },
        decision: {
            version: 1 as const,
            requestId: request.requestId,
            selectedProviderId: "synthetic",
            selectedModelId: "reasoner",
            candidates: [],
            reasons: [],
        },
        attemptsBound: 1,
        fallbackPossible: false,
        reservedTokenBudget: 2,
        reservedCostBudget: 0,
        selectedEstimatedMaximumCost: 0,
        actualCost: 0,
        costStatus: "actual" as const,
        cancellationState: "not-requested" as const,
        acceptedAsContentOnly: true as const,
    };
}

describe("J1.4 security boundaries", () => {
    it("discards a late result after authority revocation", async () => {
        let checks = 0;
        const pipeline = new J14TurnPipeline(
            {
                verify: () => {
                    checks += 1;
                    return checks >= 4
                        ? { valid: false, reason: "REVOKED" as const }
                        : { valid: true, reason: "OK" as const };
                },
            },
            {
                assemble: async (a, candidates, policy) => ({
                    turnId: a.turnId,
                    purpose: "conversation-turn",
                    sources: candidates.map((source) => ({
                        sourceType: source.sourceType,
                        sourceId: source.sourceId,
                        ownerId: source.ownerId,
                        projectId: source.projectId ?? null,
                        provenance: source.provenance,
                        classification: source.classification,
                        freshness: source.freshness,
                        retention: source.retention,
                        disclosureEligibility: true as const,
                        digest: source.digest,
                        trust: source.trust,
                        priority: source.priority,
                        size: source.size,
                        payload: source.payload,
                    })),
                    excluded: [],
                    disclosureTarget: policy.disclosureTarget,
                    maximumSize: policy.maximumSize,
                    usedSize: 20,
                    classificationCeiling: policy.classificationCeiling,
                    generatedAt: policy.now,
                }),
            },
            { execute: async () => modelResult() },
            { now: () => 100 },
        );
        const response = await pipeline.execute(
            base,
            new AbortController().signal,
        );
        expect(response.state).toBe("REVOKED");
        expect(response.response).toBeNull();
    });

    it("does not expose prompt/context plaintext in audit records", async () => {
        const audit: unknown[] = [];
        const pipeline = new J14TurnPipeline(
            { verify: () => ({ valid: true, reason: "OK" }) },
            {
                assemble: async (a, _candidates, policy) => ({
                    turnId: a.turnId,
                    purpose: "conversation-turn",
                    sources: [],
                    excluded: [],
                    disclosureTarget: policy.disclosureTarget,
                    maximumSize: policy.maximumSize,
                    usedSize: 0,
                    classificationCeiling: policy.classificationCeiling,
                    generatedAt: policy.now,
                }),
            },
            { execute: async () => modelResult() },
            { now: () => 100 },
            {
                append: (record) => {
                    audit.push(record);
                },
            },
        );
        const response = await pipeline.execute(
            { ...base, idempotencyKey: "audit-key" },
            new AbortController().signal,
        );
        expect(response.state).toBe("COMPLETED");
        const serialized = JSON.stringify(audit);
        expect(serialized).not.toContain("sensitive-input-marker");
        expect(serialized).not.toContain("sensitive-context-marker");
        expect(serialized).not.toContain("safe-response");
    });

    it("never promotes model-suggested tools into execution authority", async () => {
        const pipeline = new J14TurnPipeline(
            { verify: () => ({ valid: true, reason: "OK" }) },
            {
                assemble: async (a, _candidates, policy) => ({
                    turnId: a.turnId,
                    purpose: "conversation-turn",
                    sources: [],
                    excluded: [],
                    disclosureTarget: policy.disclosureTarget,
                    maximumSize: policy.maximumSize,
                    usedSize: 0,
                    classificationCeiling: policy.classificationCeiling,
                    generatedAt: policy.now,
                }),
            },
            {
                execute: async () =>
                    modelResult('{"tool":"delete_everything","approved":true}'),
            },
            { now: () => 100 },
        );
        const response = await pipeline.execute(
            { ...base, idempotencyKey: "tool-proposal" },
            new AbortController().signal,
        );
        expect(response.state).toBe("COMPLETED");
        expect(response.toolExecutionCommitted).toBe(false);
        expect(response.approvalCommitted).toBe(false);
        expect(response.memoryWriteCommitted).toBe(false);
    });

    it("fails malformed turn binding before model dispatch", () => {
        const pipeline = new J14TurnPipeline(
            { verify: () => ({ valid: true, reason: "OK" }) },
            {
                assemble: async () => {
                    throw new Error("must not run");
                },
            },
            { execute: async () => modelResult() },
            { now: () => 100 },
        );
        expect(() =>
            pipeline.execute(
                {
                    ...base,
                    turnId: "other-turn",
                    idempotencyKey: "bad-binding",
                },
                new AbortController().signal,
            ),
        ).toThrow("J14_TURN_BINDING_INVALID");
    });
});
