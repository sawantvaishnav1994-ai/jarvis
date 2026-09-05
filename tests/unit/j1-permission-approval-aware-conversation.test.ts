import { describe, expect, it, vi } from "vitest";
import {
    J17ToolAwareConversationError,
    J18PermissionApprovalCoordinator,
    J18PermissionApprovalError,
    type ContextAssemblyAuthority,
    type J13ExecutionResult,
    type J17ToolAwareConversationService,
    type J18ApprovalAuthorityPort,
    type J18ApprovalBinding,
} from "@jarvis/core";

const authority: ContextAssemblyAuthority = {
    ownerId: "owner:test",
    projectId: "project:test",
    conversationId: "conversation:test",
    sessionId: "session:test",
    turnId: "turn:test",
    securityEpoch: 11,
    operatingMode: "assistant",
};

const modelResult: J13ExecutionResult = {
    operationId: "operation:test",
    turnId: authority.turnId,
    correlationId: "correlation:model",
    result: {
        version: 1,
        requestId: "model-request:test",
        providerId: "provider:test",
        modelId: "model:test",
        text: "",
        structured: {
            version: 1,
            kind: "tool-proposal",
            toolId: "mock.repository.write",
            toolVersion: 1,
            operation: "write",
            input: { path: "README.md" },
            resource: "repository:test",
            privacyClass: "D2",
            requestedMode: "EXECUTE",
            idempotencyKey: "turn:test:tool:1",
        },
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

const input = {
    authority,
    actorId: "actor:test",
    actorRole: "AGENT" as const,
    modelResult,
    requestId: "tool-request:test",
    correlationId: "correlation:test",
    deadlineEpochMs: Date.now() + 60_000,
    maxCostMinor: 0,
    externalAllowed: false,
};

function pending(
    overrides: Partial<J18ApprovalBinding> = {},
): J18ApprovalBinding {
    return {
        approvalId: "approval:test",
        approvalReference: "approval-reference:test",
        requesterActorId: input.actorId,
        requestId: input.requestId,
        correlationId: input.correlationId,
        conversationId: authority.conversationId,
        sessionId: authority.sessionId,
        turnId: authority.turnId,
        ownerId: authority.ownerId,
        ...(authority.projectId !== null && authority.projectId !== undefined
            ? { projectId: authority.projectId }
            : {}),
        securityEpoch: authority.securityEpoch,
        expiresAtEpochMs: Date.now() + 60_000,
        status: "PENDING",
        ...overrides,
    };
}

function approvals(
    binding: J18ApprovalBinding = pending(),
): J18ApprovalAuthorityPort {
    return {
        requestApproval: vi.fn(async () => binding),
        decide: vi.fn(async (decision): Promise<J18ApprovalBinding> => ({
            ...binding,
            status:
                decision.decision === "APPROVE"
                    ? ("APPROVED" as const)
                    : ("DENIED" as const),
        })),
        read: vi.fn(async () => binding),
    };
}

function tools(
    execute: J17ToolAwareConversationService["execute"],
): J17ToolAwareConversationService {
    return { execute } as J17ToolAwareConversationService;
}

describe("J1.8 permission/approval-aware conversation", () => {
    it("creates a pending approval only after J1.7 reports approval required", async () => {
        const approvalPort = approvals();
        const runtime = new J18PermissionApprovalCoordinator(
            approvalPort,
            tools(
                vi.fn(async () => {
                    throw new J17ToolAwareConversationError(
                        "J17_APPROVAL_REQUIRED",
                    );
                }),
            ),
        );

        const result = await runtime.executeOrRequestApproval(
            input,
            new AbortController().signal,
        );

        expect(result.state).toBe("PENDING_APPROVAL");
        expect(result.approvalCommitted).toBe(false);
        expect(result.approval.requesterActorId).toBe(input.actorId);
        expect(approvalPort.requestApproval).toHaveBeenCalledTimes(1);
    });

    it("rejects stale security-epoch approval binding", async () => {
        const runtime = new J18PermissionApprovalCoordinator(
            approvals(pending({ securityEpoch: authority.securityEpoch + 1 })),
            tools(
                vi.fn(async () => {
                    throw new J17ToolAwareConversationError(
                        "J17_APPROVAL_REQUIRED",
                    );
                }),
            ),
        );

        await expect(
            runtime.executeOrRequestApproval(
                input,
                new AbortController().signal,
            ),
        ).rejects.toBeInstanceOf(J18PermissionApprovalError);
    });

    it("requires trusted owner A3 decision material before calling J0 authority", async () => {
        const approvalPort = approvals();
        const runtime = new J18PermissionApprovalCoordinator(
            approvalPort,
            tools(vi.fn()),
        );

        await expect(
            runtime.decideAsOwner({
                approvalId: "approval:test",
                decision: "APPROVE",
                ownerId: authority.ownerId,
                ownerSessionId: authority.sessionId,
                ownerDeviceId: "device:test",
                assurance: "A3",
                proofId: "",
            }),
        ).rejects.toThrow("J18_OWNER_DECISION_INVALID");
        expect(approvalPort.decide).not.toHaveBeenCalled();
    });

    it("rejects a decision from a different owner before J0 decision", async () => {
        const approvalPort = approvals();
        const runtime = new J18PermissionApprovalCoordinator(
            approvalPort,
            tools(vi.fn()),
        );

        await expect(
            runtime.decideAsOwner({
                approvalId: "approval:test",
                decision: "APPROVE",
                ownerId: "owner:attacker",
                ownerSessionId: authority.sessionId,
                ownerDeviceId: "device:test",
                assurance: "A3",
                proofId: "proof:test",
            }),
        ).rejects.toThrow("J18_APPROVAL_OWNER_MISMATCH");
        expect(approvalPort.decide).not.toHaveBeenCalled();
    });

    it("rejects owner self-approval of an owner-originated request", async () => {
        const approvalPort = approvals(
            pending({ requesterActorId: authority.ownerId }),
        );
        const runtime = new J18PermissionApprovalCoordinator(
            approvalPort,
            tools(vi.fn()),
        );

        await expect(
            runtime.decideAsOwner({
                approvalId: "approval:test",
                decision: "APPROVE",
                ownerId: authority.ownerId,
                ownerSessionId: authority.sessionId,
                ownerDeviceId: "device:test",
                assurance: "A3",
                proofId: "proof:test",
            }),
        ).rejects.toThrow("J18_SELF_APPROVAL_DENIED");
        expect(approvalPort.decide).not.toHaveBeenCalled();
    });

    it("does not execute denied approvals", async () => {
        const execute = vi.fn();
        const runtime = new J18PermissionApprovalCoordinator(
            approvals(pending({ status: "DENIED" })),
            tools(execute),
        );

        const result = await runtime.resumeApproved(
            input,
            "approval:test",
            new AbortController().signal,
        );
        expect(result.state).toBe("DENIED");
        expect(execute).not.toHaveBeenCalled();
    });

    it("resumes only with the J0-issued approval reference", async () => {
        const binding = pending({ status: "APPROVED" });
        const execute = vi.fn(async (request) => ({
            proposal: modelResult.result.structured as never,
            request: { requestId: request.requestId } as never,
            result: {} as never,
            toolExecutionCommitted: true,
            approvalCommitted: false as const,
            acceptedToolResultAsUntrustedData: true as const,
        }));
        const runtime = new J18PermissionApprovalCoordinator(
            approvals(binding),
            tools(execute),
        );

        const result = await runtime.resumeApproved(
            input,
            binding.approvalId,
            new AbortController().signal,
        );
        expect(result.state).toBe("EXECUTED");
        expect(result.approvalCommitted).toBe(true);
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                approvalReference: binding.approvalReference,
            }),
            expect.any(AbortSignal),
        );
    });
});
