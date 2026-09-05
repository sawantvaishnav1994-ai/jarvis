import { describe, expect, it, vi } from "vitest";
import {
    J14TurnPipeline,
    J17CapturingModelPort,
    J17ToolAwareConversationService,
    J17ToolAwareTurnCoordinator,
    type J13ExecutionResult,
    type J14ModelPort,
    type J14TurnPipelineInput,
    type J17ToolGatewayPort,
} from "@jarvis/core";
import type { J06ModelRequest } from "@jarvis/models";
import type { ToolResult } from "@jarvis/tools";

const authority = {
    ownerId: "owner:j17-turn",
    projectId: "project:j17-turn",
    conversationId: "conversation:j17-turn",
    sessionId: "session:j17-turn",
    turnId: "turn:j17-turn",
    securityEpoch: 21,
    operatingMode: "assistant" as const,
};

const modelRequest: J06ModelRequest = {
    version: 1,
    requestId: "model-request:j17-turn",
    ownerId: authority.ownerId,
    projectId: authority.projectId,
    messages: [{ role: "user", content: "read status" }],
    requiredCapabilities: ["text", "tool-planning"],
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
        packageId: "context:j17-turn",
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
    responseFormat: "json",
    contractId: null,
};

const turnInput: J14TurnPipelineInput = {
    authority,
    conversationId: authority.conversationId,
    sessionId: authority.sessionId,
    turnId: authority.turnId,
    correlationId: "turn-correlation:j17",
    idempotencyKey: "turn-idempotency:j17",
    inputDigest: "a".repeat(64),
    contextDigest: "b".repeat(64),
    modelOperationDigest: "c".repeat(64),
    candidates: [
        {
            sourceType: "conversation",
            sourceId: "input",
            ownerId: authority.ownerId,
            projectId: authority.projectId,
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
            payload: "read status",
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
    modelRequest,
    modelPolicy: {
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
    },
};

const proposal = {
    version: 1 as const,
    kind: "tool-proposal" as const,
    toolId: "mock.read",
    toolVersion: 1,
    operation: "read",
    input: { path: "status" },
    resource: authority.projectId,
    privacyClass: "D2" as const,
    requestedMode: "EXECUTE" as const,
    idempotencyKey: "turn:j17:tool:bridge",
};

function modelResult(structured: unknown): J13ExecutionResult {
    return {
        operationId: "operation:j17-turn",
        turnId: authority.turnId,
        correlationId: "model-correlation:j17-turn",
        result: {
            version: 1,
            requestId: modelRequest.requestId,
            providerId: "synthetic",
            modelId: "reasoner",
            text: "tool proposal prepared",
            structured,
            usage: {
                inputTokens: 10,
                outputTokens: 4,
                totalTokens: 14,
                cost: 0.01,
            },
            finishReason: "stop",
            verified: true,
        },
        decision: {
            version: 1,
            requestId: modelRequest.requestId,
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

function toolResult(): ToolResult {
    const now = new Date(0).toISOString();
    return {
        executionId: "execution:j17-turn",
        requestId: "tool-request:j17-turn",
        toolId: proposal.toolId,
        toolVersion: proposal.toolVersion,
        operation: proposal.operation,
        status: "SUCCEEDED",
        startedAt: now,
        finishedAt: now,
        output: { ok: true },
        externalReferences: [],
        sideEffects: [],
        verified: false,
        attemptCount: 1,
        costMinor: 0,
        provenance: "UNTRUSTED_EXTERNAL_DATA",
        warnings: [],
    };
}

function harness(structured: unknown, gatewayOverride?: J17ToolGatewayPort) {
    const delegate: J14ModelPort = {
        execute: vi.fn(async () => modelResult(structured)),
    };
    const capture = new J17CapturingModelPort(delegate);
    const pipeline = new J14TurnPipeline(
        { verify: async () => ({ valid: true, reason: "OK" }) },
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
        capture,
        { now: () => 100 },
    );
    const gateway: J17ToolGatewayPort = gatewayOverride ?? {
        invoke: vi.fn(async () => toolResult()),
    };
    const tools = new J17ToolAwareConversationService(
        { verify: async () => ({ valid: true, reason: "OK" }) },
        gateway,
    );
    return {
        gateway,
        coordinator: new J17ToolAwareTurnCoordinator(pipeline, capture, tools),
    };
}

function coordinatorInput(approvalReference?: string) {
    return {
        turn: turnInput,
        actorId: authority.ownerId,
        actorRole: "OWNER" as const,
        toolRequestId: "tool-request:j17-turn",
        toolCorrelationId: "tool-correlation:j17-turn",
        toolDeadlineEpochMs: Date.now() + 60_000,
        toolMaxCostMinor: 10,
        externalAllowed: false,
        ...(approvalReference !== undefined ? { approvalReference } : {}),
    };
}

describe("J1.7 tool-aware turn bridge", () => {
    it("keeps frozen J1.4 content-only semantics and executes the captured proposal only afterward", async () => {
        const { coordinator, gateway } = harness(proposal);
        const output = await coordinator.execute(
            coordinatorInput(),
            new AbortController().signal,
        );

        expect(output.turn.state).toBe("COMPLETED");
        expect(output.turn.toolExecutionCommitted).toBe(false);
        expect(output.turn.approvalCommitted).toBe(false);
        expect(output.tool?.toolExecutionCommitted).toBe(true);
        expect(gateway.invoke).toHaveBeenCalledTimes(1);
    });

    it("does not execute a tool for ordinary structured model content", async () => {
        const { coordinator, gateway } = harness({
            kind: "answer",
            value: "ok",
        });
        const output = await coordinator.execute(
            coordinatorInput(),
            new AbortController().signal,
        );

        expect(output.turn.state).toBe("COMPLETED");
        expect(output.tool).toBeNull();
        expect(gateway.invoke).not.toHaveBeenCalled();
    });

    it("retains the exact captured proposal after approval-required and reuses it on approved retry", async () => {
        let calls = 0;
        const gateway: J17ToolGatewayPort = {
            invoke: vi.fn(async (request) => {
                calls += 1;
                if (calls === 1) throw new Error("APPROVAL_REQUIRED");
                expect(request.approvalReference).toBe("approval:granted");
                return toolResult();
            }),
        };
        const { coordinator } = harness(proposal, gateway);

        await expect(
            coordinator.execute(
                coordinatorInput(),
                new AbortController().signal,
            ),
        ).rejects.toThrow("J17_APPROVAL_REQUIRED");

        const approved = await coordinator.execute(
            coordinatorInput("approval:granted"),
            new AbortController().signal,
        );
        expect(approved.turn.state).toBe("COMPLETED");
        expect(approved.tool?.toolExecutionCommitted).toBe(true);
        expect(gateway.invoke).toHaveBeenCalledTimes(2);
    });
});
