import { describe, expect, it } from "vitest";
import {
    J14TurnPipeline,
    J14TurnPipelineError,
    type J14AuthorityReason,
    type J14TurnPipelineInput,
} from "@jarvis/core";
import type { J13ExecutionResult } from "@jarvis/core";
import type { J06ModelRequest } from "@jarvis/models";

const authority = {
    ownerId: "owner",
    conversationId: "33333333-3333-4333-8333-333333333333",
    sessionId: "11111111-1111-4111-8111-111111111111",
    turnId: "22222222-2222-4222-8222-222222222222",
    securityEpoch: 4,
    operatingMode: "assistant" as const,
    projectId: "jarvis",
};
const modelRequest: J06ModelRequest = {
    version: 1,
    requestId: "j14-request",
    ownerId: "owner",
    projectId: "jarvis",
    messages: [{ role: "user", content: "hello" }],
    requiredCapabilities: ["text"],
    processingTarget: "APPROVED_EXTERNAL",
    dataPolicy: {
        version: 1,
        classification: "D2",
        privacy: "ai-allow",
        retention: { mode: "keep" },
        consent: {
            storeConversation: true,
            createMemory: false,
            projectKnowledge: false,
            keepAttachments: false,
            personalization: false,
            externalAI: true,
        },
    },
    context: {
        packageId: "j14-context",
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
const modelPolicy = {
    route: {
        allowedProviderIds: [],
        deniedProviderIds: [],
        preferredProviderIds: ["synthetic"],
        allowDegraded: false,
        maxAttempts: 1,
    },
    operationTimeoutMs: 1_000,
    operationAttemptLimit: 2,
    operationMaxTokens: 200,
    operationMaxCost: 1,
    operationAllowUnknownCost: false,
    circuitFailureThreshold: 2,
    circuitResetMs: 1_000,
};
const contextPolicy = {
    disclosureTarget: "external-ai" as const,
    classificationCeiling: "D2" as const,
    maximumSize: 100,
    minimumFreshness: 0,
    allowUntrusted: false,
    now: 10,
};
const input: J14TurnPipelineInput = {
    authority,
    conversationId: authority.conversationId,
    sessionId: authority.sessionId,
    turnId: authority.turnId,
    correlationId: "j14-correlation",
    idempotencyKey: "j14-idempotency",
    inputDigest: "a".repeat(64),
    contextDigest: "b".repeat(64),
    modelOperationDigest: "c".repeat(64),
    candidates: [
        {
            sourceType: "conversation",
            sourceId: "input",
            ownerId: "owner",
            projectId: "jarvis",
            provenance: "J1.1:turn-input",
            classification: "D2",
            freshness: 10,
            retention: "session",
            retentionBoundary: authority.sessionId,
            disclosureEligibility: true,
            digest: "d".repeat(64),
            trust: "trusted",
            priority: 10,
            size: 5,
            payload: "hello",
        },
    ],
    contextPolicy,
    modelRequest,
    modelPolicy,
};

function result(text = "response"): J13ExecutionResult {
    return {
        operationId: "operation-1",
        turnId: authority.turnId,
        correlationId: `${authority.turnId}:operation-1`,
        result: {
            version: 1,
            requestId: "j14-request",
            providerId: "synthetic",
            modelId: "reasoner",
            text,
            structured: null,
            usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12, cost: 0.01 },
            finishReason: "stop",
            verified: true,
        },
        decision: {
            version: 1,
            requestId: "j14-request",
            selectedProviderId: "synthetic",
            selectedModelId: "reasoner",
            candidates: [],
            reasons: [],
        },
        attemptsBound: 1,
        fallbackPossible: false,
        reservedTokenBudget: 40,
        reservedCostBudget: 0.01,
        selectedEstimatedMaximumCost: 0.01,
        actualCost: 0.01,
        costStatus: "actual",
        cancellationState: "not-requested",
        acceptedAsContentOnly: true,
    };
}

function harness(reason: J14AuthorityReason = "OK") {
    let authorityReason = reason;
    let modelCalls = 0;
    const pipeline = new J14TurnPipeline(
        {
            verify: () => ({
                valid: authorityReason === "OK",
                reason: authorityReason,
            }),
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
                usedSize: 5,
                classificationCeiling: policy.classificationCeiling,
                generatedAt: policy.now,
            }),
        },
        {
            execute: async () => {
                modelCalls += 1;
                return result();
            },
        },
        { now: () => 100 },
    );
    return {
        pipeline,
        setAuthority: (next: J14AuthorityReason) => {
            authorityReason = next;
        },
        modelCalls: () => modelCalls,
    };
}

describe("J1.4 governed response turn pipeline", () => {
    it("executes the explicit success state machine and keeps model output content-only", async () => {
        const { pipeline } = harness();
        const response = await pipeline.execute(input, new AbortController().signal);
        expect(response.state).toBe("COMPLETED");
        expect(response.response).toBe("response");
        expect(response.acceptedAsContentOnly).toBe(true);
        expect(response.toolExecutionCommitted).toBe(false);
        expect(response.approvalCommitted).toBe(false);
        expect(response.memoryWriteCommitted).toBe(false);
        expect(response.events.filter((event) => event.kind === "state").map((event) => event.state)).toEqual([
            "AUTHORITY_VALIDATING",
            "CONTEXT_ASSEMBLING",
            "MODEL_PENDING",
            "MODEL_RUNNING",
            "MODEL_RESULT_RECEIVED",
            "RESPONSE_PROCESSING",
        ]);
        expect(response.events.at(-1)?.state).toBe("COMPLETED");
    });

    it("deduplicates an exact idempotent replay", async () => {
        const { pipeline, modelCalls } = harness();
        const first = pipeline.execute(input, new AbortController().signal);
        const second = pipeline.execute(input, new AbortController().signal);
        expect(await first).toEqual(await second);
        expect(modelCalls()).toBe(1);
    });

    it("fails closed when the same idempotency key is rebound to changed protected input", async () => {
        const { pipeline } = harness();
        await pipeline.execute(input, new AbortController().signal);
        await expect(
            pipeline.execute(
                { ...input, inputDigest: "e".repeat(64) },
                new AbortController().signal,
            ),
        ).rejects.toBeInstanceOf(J14TurnPipelineError);
    });

    it.each([
        ["REVOKED", "REVOKED"],
        ["SECURITY_EPOCH_CHANGED", "REVOKED"],
        ["SAFE_MODE", "SAFE_MODE_BLOCKED"],
        ["FREEZE", "EMERGENCY_STOPPED"],
        ["SHUTDOWN", "EMERGENCY_STOPPED"],
    ] as const)("maps %s authority state to %s", async (reason, expected) => {
        const { pipeline } = harness(reason);
        const response = await pipeline.execute(
            { ...input, idempotencyKey: `key-${reason}` },
            new AbortController().signal,
        );
        expect(response.state).toBe(expected);
        expect(response.response).toBeNull();
    });

    it("cancels before model dispatch when the owner signal is already aborted", async () => {
        const { pipeline, modelCalls } = harness();
        const controller = new AbortController();
        controller.abort();
        const response = await pipeline.execute(
            { ...input, idempotencyKey: "cancel-before" },
            controller.signal,
        );
        expect(response.state).toBe("CANCELLED");
        expect(modelCalls()).toBe(0);
    });

    it("rejects cross-owner model binding before any context or model work", () => {
        const { pipeline } = harness();
        expect(() =>
            pipeline.execute(
                {
                    ...input,
                    idempotencyKey: "cross-owner",
                    modelRequest: { ...modelRequest, ownerId: "other-owner" },
                },
                new AbortController().signal,
            ),
        ).toThrow("J14_OWNER_BINDING_INVALID");
    });
});
