import { expect, it, vi } from "vitest";
import {
    J17ToolAwareConversationService,
    type ContextAssemblyAuthority,
    type J13ExecutionResult,
    type J17ToolGatewayPort,
} from "@jarvis/core";
import type { ToolResult } from "@jarvis/tools";

const authority: ContextAssemblyAuthority = {
    ownerId: "owner:secure",
    projectId: "project:secure",
    conversationId: "conversation:secure",
    sessionId: "session:secure",
    turnId: "turn:secure",
    securityEpoch: 11,
    operatingMode: "assistant",
};

const proposal = {
    version: 1 as const,
    kind: "tool-proposal" as const,
    toolId: "mock.repository.read",
    toolVersion: 1,
    operation: "read",
    input: { value: "safe" },
    resource: "repository:secure",
    privacyClass: "D2" as const,
    requestedMode: "EXECUTE" as const,
    idempotencyKey: "turn:secure:tool:1",
};

function model(turnId = authority.turnId, structured: unknown = proposal): J13ExecutionResult {
    return {
        operationId: "operation:secure",
        turnId,
        correlationId: "model:secure",
        result: {
            version: 1,
            requestId: "model-request:secure",
            providerId: "provider:secure",
            modelId: "model:secure",
            text: "",
            structured,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cost: 0 },
            finishReason: "stop",
            verified: true,
        },
        decision: {
            version: 1,
            requestId: "model-request:secure",
            selectedProviderId: "provider:secure",
            selectedModelId: "model:secure",
            candidates: [],
            reasons: [],
        },
        attemptsBound: 1,
        fallbackPossible: false,
        reservedTokenBudget: 10,
        reservedCostBudget: 0,
        selectedEstimatedMaximumCost: 0,
        actualCost: 0,
        costStatus: "actual",
        cancellationState: "not-requested",
        acceptedAsContentOnly: true,
    };
}

function success(): ToolResult {
    const time = new Date(0).toISOString();
    return {
        executionId: "execution:secure",
        requestId: "tool-request:secure",
        toolId: proposal.toolId,
        toolVersion: proposal.toolVersion,
        operation: proposal.operation,
        status: "SUCCEEDED",
        startedAt: time,
        finishedAt: time,
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

function input(modelResult = model()) {
    return {
        authority,
        actorId: "actor:secure",
        actorRole: "OWNER" as const,
        modelResult,
        requestId: "tool-request:secure",
        correlationId: "correlation:secure",
        deadlineEpochMs: Date.now() + 60_000,
        maxCostMinor: 100,
        externalAllowed: false,
    };
}

it("denies stale or cross-turn model proposals before tool execution", async () => {
    const gateway: J17ToolGatewayPort = { invoke: vi.fn(async () => success()) };
    const runtime = new J17ToolAwareConversationService(
        { verify: async () => ({ valid: true, reason: "OK" }) },
        gateway,
    );
    await expect(
        runtime.execute(input(model("turn:other")), new AbortController().signal),
    ).rejects.toThrow("J17_TURN_BINDING_INVALID");
    expect(gateway.invoke).not.toHaveBeenCalled();
});

it("denies revoked authority before tool execution", async () => {
    const gateway: J17ToolGatewayPort = { invoke: vi.fn(async () => success()) };
    const runtime = new J17ToolAwareConversationService(
        { verify: async () => ({ valid: false, reason: "SECURITY_EPOCH_CHANGED" }) },
        gateway,
    );
    await expect(
        runtime.execute(input(), new AbortController().signal),
    ).rejects.toThrow("J17_AUTHORITY_INVALID");
    expect(gateway.invoke).not.toHaveBeenCalled();
});

it("does not accept model-supplied authority or approval fields", async () => {
    const gateway: J17ToolGatewayPort = { invoke: vi.fn(async () => success()) };
    const runtime = new J17ToolAwareConversationService(
        { verify: async () => ({ valid: true, reason: "OK" }) },
        gateway,
    );
    const poisoned = {
        ...proposal,
        ownerId: "owner:attacker",
        sessionId: "session:attacker",
        securityEpoch: 0,
        approvalReference: "fake-approval",
        externalAllowed: true,
    };
    await expect(
        runtime.execute(input(model(authority.turnId, poisoned)), new AbortController().signal),
    ).rejects.toThrow("J17_TOOL_PROPOSAL_INVALID");
    expect(gateway.invoke).not.toHaveBeenCalled();
});

it("rejects mismatched gateway results as untrusted boundary violations", async () => {
    const gateway: J17ToolGatewayPort = {
        invoke: vi.fn(async () => ({ ...success(), requestId: "other-request" })),
    };
    const runtime = new J17ToolAwareConversationService(
        { verify: async () => ({ valid: true, reason: "OK" }) },
        gateway,
    );
    await expect(
        runtime.execute(input(), new AbortController().signal),
    ).rejects.toThrow("J17_TOOL_RESULT_BINDING_INVALID");
});
