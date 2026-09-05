import { describe, expect, it, vi } from "vitest";
import {
    J17ToolAwareConversationError,
    J17ToolAwareConversationService,
    type ContextAssemblyAuthority,
    type J13ExecutionResult,
    type J17ToolGatewayPort,
} from "@jarvis/core";
import type { ToolResult } from "@jarvis/tools";

const authority: ContextAssemblyAuthority = {
    ownerId: "owner:test",
    projectId: "project:test",
    conversationId: "conversation:test",
    sessionId: "session:test",
    turnId: "turn:test",
    securityEpoch: 9,
    operatingMode: "assistant",
};

function modelResult(structured: unknown): J13ExecutionResult {
    return {
        operationId: "operation:test",
        turnId: authority.turnId,
        correlationId: "correlation:model",
        result: {
            version: 1,
            requestId: "model-request:test",
            providerId: "provider:test",
            modelId: "model:test",
            text: "",
            structured,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cost: 0 },
            finishReason: "stop",
            verified: true,
        },
        decision: {
            version: 1,
            requestId: "model-request:test",
            selectedProviderId: "provider:test",
            selectedModelId: "model:test",
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

const proposal = {
    version: 1 as const,
    kind: "tool-proposal" as const,
    toolId: "mock.repository.read",
    toolVersion: 1,
    operation: "read",
    input: { path: "README.md" },
    resource: "repository:test",
    privacyClass: "D2" as const,
    requestedMode: "EXECUTE" as const,
    idempotencyKey: "turn:test:tool:1",
};

function result(): ToolResult {
    const now = new Date(0).toISOString();
    return {
        executionId: "execution:test",
        requestId: "tool-request:test",
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

function service(gateway?: J17ToolGatewayPort) {
    const port: J17ToolGatewayPort = gateway ?? {
        invoke: vi.fn(async () => result()),
    };
    return {
        runtime: new J17ToolAwareConversationService(
            { verify: async () => ({ valid: true, reason: "OK" }) },
            port,
        ),
        gateway: port,
    };
}

function executionInput(structured: unknown = proposal) {
    return {
        authority,
        actorId: "actor:test",
        actorRole: "OWNER" as const,
        modelResult: modelResult(structured),
        requestId: "tool-request:test",
        correlationId: "correlation:test",
        deadlineEpochMs: Date.now() + 60_000,
        maxCostMinor: 100,
        externalAllowed: false,
    };
}

describe("J1.7 tool-aware conversation", () => {
    it("injects trusted authority binding and invokes only the J0 tool gateway port", async () => {
        const { runtime, gateway } = service();
        const output = await runtime.execute(
            executionInput(),
            new AbortController().signal,
        );

        expect(gateway.invoke).toHaveBeenCalledTimes(1);
        expect(output.request.actor.ownerId).toBe(authority.ownerId);
        expect(output.request.projectId).toBe(authority.projectId);
        expect(output.request.metadata).toMatchObject({
            conversationId: authority.conversationId,
            sessionId: authority.sessionId,
            turnId: authority.turnId,
            securityEpoch: String(authority.securityEpoch),
            externalAllowed: "false",
        });
        expect(output.toolExecutionCommitted).toBe(true);
        expect(output.approvalCommitted).toBe(false);
        expect(output.acceptedToolResultAsUntrustedData).toBe(true);
    });

    it("rejects malformed structured model output before the gateway", async () => {
        const { runtime, gateway } = service();
        await expect(
            runtime.execute(
                executionInput({ ownerId: "owner:attacker" }),
                new AbortController().signal,
            ),
        ).rejects.toThrow("J17_TOOL_PROPOSAL_INVALID");
        expect(gateway.invoke).not.toHaveBeenCalled();
    });

    it("requires idempotency before model-proposed execution", async () => {
        const { runtime, gateway } = service();
        const unsafe = { ...proposal, idempotencyKey: undefined };
        await expect(
            runtime.execute(executionInput(unsafe), new AbortController().signal),
        ).rejects.toBeInstanceOf(J17ToolAwareConversationError);
        expect(gateway.invoke).not.toHaveBeenCalled();
    });

    it("surfaces approval-required without committing approval", async () => {
        const gateway: J17ToolGatewayPort = {
            invoke: vi.fn(async () => {
                throw new Error("APPROVAL_REQUIRED");
            }),
        };
        const { runtime } = service(gateway);
        await expect(
            runtime.execute(executionInput(), new AbortController().signal),
        ).rejects.toThrow("J17_APPROVAL_REQUIRED");
    });

    it.each([
        ["APPROVAL_MISMATCH", "J17_APPROVAL_MISMATCH"],
        ["UNKNOWN_OUTCOME", "J17_TOOL_OUTCOME_UNKNOWN"],
        ["CANCELLED", "J17_TOOL_CANCELLED"],
        ["TIMEOUT", "J17_TOOL_TIMEOUT"],
        ["EMERGENCY_STOP", "J17_TOOL_EMERGENCY_BLOCKED"],
        ["PRIVACY_DENIED", "J17_TOOL_PRIVACY_DENIED"],
        ["COST_BUDGET_EXCEEDED", "J17_TOOL_COST_BUDGET_EXCEEDED"],
        ["CONCURRENCY_CONFLICT", "J17_TOOL_CONCURRENCY_CONFLICT"],
        ["CREDENTIAL_UNAVAILABLE", "J17_TOOL_CREDENTIAL_UNAVAILABLE"],
        ["TOOL_NOT_FOUND", "J17_TOOL_UNAVAILABLE"],
        ["INVALID_OUTPUT", "J17_TOOL_CONTRACT_INVALID"],
        ["AUTHORIZATION_INVALID", "J17_TOOL_AUTHORIZATION_DENIED"],
        ["IDEMPOTENCY_CONFLICT", "J17_TOOL_IDEMPOTENCY_CONFLICT"],
    ])("maps J0 gateway failure %s without weakening it", async (gatewayCode, expected) => {
        const gateway: J17ToolGatewayPort = {
            invoke: vi.fn(async () => {
                throw new Error(gatewayCode);
            }),
        };
        const { runtime } = service(gateway);
        await expect(
            runtime.execute(executionInput(), new AbortController().signal),
        ).rejects.toThrow(expected);
    });

    it("fails before the gateway when cancellation is already requested", async () => {
        const { runtime, gateway } = service();
        const controller = new AbortController();
        controller.abort();
        await expect(runtime.execute(executionInput(), controller.signal)).rejects.toThrow(
            "J17_TOOL_CANCELLED",
        );
        expect(gateway.invoke).not.toHaveBeenCalled();
    });
});
