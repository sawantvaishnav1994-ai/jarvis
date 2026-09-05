import { describe, expect, it, vi } from "vitest";
import {
    J17ToolAwareConversationService,
    J18PermissionApprovalCoordinator,
    type ContextAssemblyAuthority,
    type J13ExecutionResult,
    type J18ApprovalBinding,
} from "@jarvis/core";
import {
    J03ToolAuthorizationBridge,
    UniversalToolGateway,
    UniversalToolRegistry,
    syntheticTool,
    type CredentialBroker,
    type ToolAuditEvent,
} from "@jarvis/tools";
import { DeterministicPolicy, type ApprovalBindingV2 } from "@jarvis/security";
import {
    policyContext,
    policyControls,
    policyDocument,
    policyNow,
} from "../fixtures/policy.js";

const authority: ContextAssemblyAuthority = {
    ownerId: "owner-test",
    projectId: "jarvis",
    conversationId: "conversation:j18",
    sessionId: "session-test",
    turnId: "turn:j18",
    securityEpoch: 0,
    operatingMode: "assistant",
};

const proposal = {
    version: 1 as const,
    kind: "tool-proposal" as const,
    toolId: "mock.repository.read",
    toolVersion: 1,
    operation: "run",
    input: { key: "status", value: "ok" },
    resource: "repository-x",
    privacyClass: "D0" as const,
    requestedMode: "EXECUTE" as const,
    idempotencyKey: "turn:j18:tool:approval",
};

function modelResult(): J13ExecutionResult {
    return {
        operationId: "operation:j18",
        turnId: authority.turnId,
        correlationId: "model-correlation:j18",
        result: {
            version: 1,
            requestId: "model-request:j18",
            providerId: "provider:j18",
            modelId: "model:j18",
            text: "",
            structured: proposal,
            usage: {
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 2,
                cost: 0,
            },
            finishReason: "stop",
            verified: true,
        },
        decision: {
            version: 1,
            requestId: "model-request:j18",
            selectedProviderId: "provider:j18",
            selectedModelId: "model:j18",
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

const request = {
    authority,
    actorId: "agent-test",
    actorRole: "AGENT" as const,
    modelResult: modelResult(),
    requestId: "request-j18",
    correlationId: "correlation-j18",
    deadlineEpochMs: policyNow + 5_000,
    maxCostMinor: 10,
    externalAllowed: false,
};

const broker: CredentialBroker = {
    lease: async () => undefined,
};

describe("J1.8 -> J0.7 approval integration", () => {
    it("resumes only after the J0.7 bridge consumes the exact approved binding", async () => {
        const document = policyDocument();
        document.rules[0]!.requireApproval = true;
        const policy = new DeterministicPolicy(document);
        const controls = policyControls();
        const audit: ToolAuditEvent[] = [];
        let state: J18ApprovalBinding = {
            approvalId: "approval:j18",
            approvalReference: "proof:j18",
            requesterActorId: request.actorId,
            requestId: request.requestId,
            correlationId: request.correlationId,
            conversationId: authority.conversationId,
            sessionId: authority.sessionId,
            turnId: authority.turnId,
            ownerId: authority.ownerId,
            ...(authority.projectId !== null && authority.projectId !== undefined
                ? { projectId: authority.projectId }
                : {}),
            securityEpoch: authority.securityEpoch,
            expiresAtEpochMs: policyNow + 60_000,
            status: "PENDING",
        };
        let consumed = false;
        const consume = vi.fn(
            async (proof: string, binding: ApprovalBindingV2) => {
                if (
                    proof !== state.approvalReference ||
                    state.status !== "APPROVED" ||
                    consumed
                )
                    return false;
                const accepted =
                    binding.ownerId === authority.ownerId &&
                    binding.actorId === request.actorId &&
                    binding.sessionId === authority.sessionId &&
                    binding.requestId === request.requestId &&
                    binding.toolId === proposal.toolId &&
                    binding.resource === proposal.resource &&
                    binding.controlEpoch === authority.securityEpoch;
                if (accepted) consumed = true;
                return accepted;
            },
        );
        const bridge = new J03ToolAuthorizationBridge(
            policy,
            { read: () => controls },
            { consume },
            (toolRequest) => {
                const context = policyContext();
                context.requestId = toolRequest.requestId;
                return context;
            },
            () => policyNow,
        );
        const tool = syntheticTool("mock.repository.read", "read", {
            operations: [
                {
                    operation: "run",
                    capability: "mock.read",
                    scope: "mock.read",
                    permission: "P0",
                    sideEffectClass: "READ_ONLY",
                    supportsDryRun: true,
                    supportsIdempotency: true,
                    supportsCancellation: false,
                    supportsVerification: true,
                    rollback: "NONE",
                    maxAttempts: 2,
                    timeoutMs: 1_000,
                    retryBaseMs: 1,
                    estimatedCostMinor: 1,
                },
            ],
        });
        const gateway = new UniversalToolGateway(
            new UniversalToolRegistry([tool]),
            bridge,
            broker,
            { append: async (event) => void audit.push(event) },
            undefined,
            () => policyNow,
        );
        const j17 = new J17ToolAwareConversationService(
            { verify: async () => ({ valid: true, reason: "OK" }) },
            gateway,
        );
        const approvals = {
            requestApproval: vi.fn(async () => state),
            read: vi.fn(async () => state),
            decide: vi.fn(
                async (decision: { decision: "APPROVE" | "DENY" }) => {
                    state = {
                        ...state,
                        status:
                            decision.decision === "APPROVE"
                                ? ("APPROVED" as const)
                                : ("DENIED" as const),
                    };
                    return state;
                },
            ),
        };
        const j18 = new J18PermissionApprovalCoordinator(
            approvals,
            j17,
            () => policyNow,
        );

        const pending = await j18.executeOrRequestApproval(
            request,
            new AbortController().signal,
        );
        expect(pending.state).toBe("PENDING_APPROVAL");
        expect(consume).not.toHaveBeenCalled();

        await j18.decideAsOwner({
            approvalId: state.approvalId,
            decision: "APPROVE",
            ownerId: authority.ownerId,
            ownerSessionId: authority.sessionId,
            ownerDeviceId: "device-test",
            assurance: "A3",
            proofId: "proof:owner-a3",
        });

        const executed = await j18.resumeApproved(
            request,
            state.approvalId,
            new AbortController().signal,
        );
        expect(executed.state).toBe("EXECUTED");
        expect(executed.tool?.result.status).toBe("VERIFIED");
        expect(consume).toHaveBeenCalledTimes(1);
        expect(consumed).toBe(true);
        expect(audit.some((event) => event.event === "TOOL_DISPATCHED")).toBe(
            true,
        );
        expect(audit.some((event) => event.event === "TOOL_VERIFIED")).toBe(
            true,
        );
    });
});
