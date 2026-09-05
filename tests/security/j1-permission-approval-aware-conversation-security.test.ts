import { describe, expect, it, vi } from "vitest";
import {
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
    securityEpoch: 12,
    operatingMode: "assistant",
};

const modelResult = {
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
            idempotencyKey: "turn:test:tool:security",
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
} as J13ExecutionResult;

const input = {
    authority,
    actorId: "agent:test",
    actorRole: "AGENT" as const,
    modelResult,
    requestId: "tool-request:security",
    correlationId: "correlation:security",
    deadlineEpochMs: Date.now() + 60_000,
    maxCostMinor: 0,
    externalAllowed: false,
};

function binding(
    overrides: Partial<J18ApprovalBinding> = {},
): J18ApprovalBinding {
    return {
        approvalId: "approval:security",
        approvalReference: "approval-reference:security",
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
        status: "APPROVED",
        ...overrides,
    };
}

function approvalPort(value: J18ApprovalBinding): J18ApprovalAuthorityPort {
    return {
        requestApproval: vi.fn(async () => value),
        decide: vi.fn(async (): Promise<J18ApprovalBinding> => value),
        read: vi.fn(async () => value),
    };
}

function toolPort(execute = vi.fn()): J17ToolAwareConversationService {
    return { execute } as unknown as J17ToolAwareConversationService;
}

describe("J1.8 approval lifecycle security", () => {
    it.each([
        ["requester", { requesterActorId: "agent:attacker" }],
        ["owner", { ownerId: "owner:attacker" }],
        ["project", { projectId: "project:attacker" }],
        ["conversation", { conversationId: "conversation:attacker" }],
        ["session", { sessionId: "session:attacker" }],
        ["turn", { turnId: "turn:attacker" }],
        ["request", { requestId: "request:attacker" }],
        ["correlation", { correlationId: "correlation:attacker" }],
        ["epoch", { securityEpoch: authority.securityEpoch + 1 }],
    ])(
        "rejects cross-bound %s approval before tool execution",
        async (_name, override) => {
            const execute = vi.fn();
            const runtime = new J18PermissionApprovalCoordinator(
                approvalPort(binding(override)),
                toolPort(execute),
            );
            await expect(
                runtime.resumeApproved(
                    input,
                    "approval:security",
                    new AbortController().signal,
                ),
            ).rejects.toThrow("J18_APPROVAL_BINDING_INVALID");
            expect(execute).not.toHaveBeenCalled();
        },
    );

    it("rejects consumed approval replay before tool execution", async () => {
        const execute = vi.fn();
        const runtime = new J18PermissionApprovalCoordinator(
            approvalPort(binding({ status: "CONSUMED" })),
            toolPort(execute),
        );
        await expect(
            runtime.resumeApproved(
                input,
                "approval:security",
                new AbortController().signal,
            ),
        ).rejects.toThrow("J18_APPROVAL_NOT_READY");
        expect(execute).not.toHaveBeenCalled();
    });

    it("treats expiry as terminal non-execution", async () => {
        const execute = vi.fn();
        const runtime = new J18PermissionApprovalCoordinator(
            approvalPort(binding({ expiresAtEpochMs: 1 })),
            toolPort(execute),
            () => 2,
        );
        const result = await runtime.resumeApproved(
            input,
            "approval:security",
            new AbortController().signal,
        );
        expect(result.state).toBe("EXPIRED");
        expect(execute).not.toHaveBeenCalled();
    });

    it("fails closed when cancelled before approval resume", async () => {
        const execute = vi.fn();
        const runtime = new J18PermissionApprovalCoordinator(
            approvalPort(binding()),
            toolPort(execute),
        );
        const controller = new AbortController();
        controller.abort();
        await expect(
            runtime.resumeApproved(
                input,
                "approval:security",
                controller.signal,
            ),
        ).rejects.toThrow("J18_CANCELLED");
        expect(execute).not.toHaveBeenCalled();
    });

    it("rejects self approval before the J0 decision command", async () => {
        const port = approvalPort(
            binding({ requesterActorId: authority.ownerId, status: "PENDING" }),
        );
        const runtime = new J18PermissionApprovalCoordinator(port, toolPort());
        await expect(
            runtime.decideAsOwner({
                approvalId: "approval:security",
                decision: "APPROVE",
                ownerId: authority.ownerId,
                ownerSessionId: authority.sessionId,
                ownerDeviceId: "device:test",
                assurance: "A3",
                proofId: "proof:test",
            }),
        ).rejects.toThrow("J18_SELF_APPROVAL_DENIED");
        expect(port.decide).not.toHaveBeenCalled();
    });

    it("rejects approval state races before the J0 decision command", async () => {
        const port = approvalPort(binding({ status: "CONSUMED" }));
        const runtime = new J18PermissionApprovalCoordinator(port, toolPort());
        await expect(
            runtime.decideAsOwner({
                approvalId: "approval:security",
                decision: "APPROVE",
                ownerId: authority.ownerId,
                ownerSessionId: authority.sessionId,
                ownerDeviceId: "device:test",
                assurance: "A3",
                proofId: "proof:test",
            }),
        ).rejects.toThrow("J18_APPROVAL_NOT_PENDING");
        expect(port.decide).not.toHaveBeenCalled();
    });

    it("rejects a J0 decision response that mutates the approval binding", async () => {
        const pending = binding({ status: "PENDING" });
        const port: J18ApprovalAuthorityPort = {
            requestApproval: vi.fn(async () => pending),
            read: vi.fn(async () => pending),
            decide: vi.fn(async () => ({
                ...pending,
                requestId: "request:attacker",
                status: "APPROVED" as const,
            })),
        };
        const runtime = new J18PermissionApprovalCoordinator(port, toolPort());
        await expect(
            runtime.decideAsOwner({
                approvalId: pending.approvalId,
                decision: "APPROVE",
                ownerId: authority.ownerId,
                ownerSessionId: authority.sessionId,
                ownerDeviceId: "device:test",
                assurance: "A3",
                proofId: "proof:test",
            }),
        ).rejects.toBeInstanceOf(J18PermissionApprovalError);
    });
});
