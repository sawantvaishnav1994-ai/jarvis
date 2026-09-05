import type { ContextAssemblyAuthority } from "./context-assembly.js";
import type { J13ExecutionResult } from "./model-orchestration.js";
import {
    J17ToolAwareConversationError,
    type J17ToolAwareConversationService,
    type J17ToolExecutionResult,
} from "./tool-aware-conversation.js";

export interface J18ApprovalBinding {
    approvalId: string;
    approvalReference: string;
    requestId: string;
    correlationId: string;
    conversationId: string;
    sessionId: string;
    turnId: string;
    ownerId: string;
    projectId?: string;
    securityEpoch: number;
    expiresAtEpochMs: number;
    status:
        "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "REVOKED" | "CONSUMED";
}

export interface J18ApprovalRequestInput {
    authority: ContextAssemblyAuthority;
    actorId: string;
    actorRole: "OWNER" | "DELEGATE" | "SERVICE" | "AGENT" | "SYSTEM";
    modelResult: J13ExecutionResult;
    requestId: string;
    correlationId: string;
    deadlineEpochMs: number;
    maxCostMinor: number;
    externalAllowed: boolean;
}

export interface J18OwnerDecisionInput {
    approvalId: string;
    decision: "APPROVE" | "DENY";
    ownerId: string;
    ownerSessionId: string;
    ownerDeviceId: string;
    assurance: "A3";
    proofId: string;
}

export interface J18ApprovalAuthorityPort {
    requestApproval(
        input: J18ApprovalRequestInput,
    ): Promise<J18ApprovalBinding>;
    decide(input: J18OwnerDecisionInput): Promise<J18ApprovalBinding>;
    read(approvalId: string): Promise<J18ApprovalBinding | null>;
}

export type J18PermissionApprovalResult =
    | {
          state: "EXECUTED";
          approvalCommitted: boolean;
          approval: J18ApprovalBinding | null;
          tool: J17ToolExecutionResult;
      }
    | {
          state: "PENDING_APPROVAL";
          approvalCommitted: false;
          approval: J18ApprovalBinding;
          tool: null;
      }
    | {
          state: "DENIED" | "EXPIRED" | "REVOKED";
          approvalCommitted: false;
          approval: J18ApprovalBinding;
          tool: null;
      };

export class J18PermissionApprovalError extends Error {
    constructor(readonly code: string) {
        super(code);
        this.name = "J18PermissionApprovalError";
    }
}

function assertBinding(
    approval: J18ApprovalBinding,
    input: J18ApprovalRequestInput,
): void {
    if (
        approval.requestId !== input.requestId ||
        approval.correlationId !== input.correlationId ||
        approval.conversationId !== input.authority.conversationId ||
        approval.sessionId !== input.authority.sessionId ||
        approval.turnId !== input.authority.turnId ||
        approval.ownerId !== input.authority.ownerId ||
        approval.securityEpoch !== input.authority.securityEpoch ||
        (approval.projectId ?? null) !== (input.authority.projectId ?? null)
    )
        throw new J18PermissionApprovalError("J18_APPROVAL_BINDING_INVALID");
}

function mapTerminal(
    approval: J18ApprovalBinding,
): J18PermissionApprovalResult {
    if (approval.status === "DENIED")
        return {
            state: "DENIED",
            approvalCommitted: false,
            approval,
            tool: null,
        };
    if (approval.status === "EXPIRED")
        return {
            state: "EXPIRED",
            approvalCommitted: false,
            approval,
            tool: null,
        };
    if (approval.status === "REVOKED")
        return {
            state: "REVOKED",
            approvalCommitted: false,
            approval,
            tool: null,
        };
    throw new J18PermissionApprovalError("J18_APPROVAL_NOT_TERMINAL");
}

export class J18PermissionApprovalCoordinator {
    constructor(
        private readonly approvals: J18ApprovalAuthorityPort,
        private readonly tools: J17ToolAwareConversationService,
        private readonly clock: () => number = Date.now,
    ) {}

    async executeOrRequestApproval(
        input: J18ApprovalRequestInput,
        signal: AbortSignal,
    ): Promise<J18PermissionApprovalResult> {
        if (signal.aborted)
            throw new J18PermissionApprovalError("J18_CANCELLED");
        try {
            const tool = await this.tools.execute(input, signal);
            return {
                state: "EXECUTED",
                approvalCommitted: false,
                approval: null,
                tool,
            };
        } catch (error) {
            if (
                !(error instanceof J17ToolAwareConversationError) ||
                error.code !== "J17_APPROVAL_REQUIRED"
            )
                throw error;
        }

        const approval = await this.approvals.requestApproval(input);
        assertBinding(approval, input);
        if (approval.status !== "PENDING")
            throw new J18PermissionApprovalError("J18_APPROVAL_NOT_PENDING");
        if (approval.expiresAtEpochMs <= this.clock())
            throw new J18PermissionApprovalError(
                "J18_APPROVAL_ALREADY_EXPIRED",
            );
        return {
            state: "PENDING_APPROVAL",
            approvalCommitted: false,
            approval,
            tool: null,
        };
    }

    async decideAsOwner(
        decision: J18OwnerDecisionInput,
    ): Promise<J18ApprovalBinding> {
        if (
            !decision.approvalId ||
            !decision.ownerId ||
            !decision.ownerSessionId ||
            !decision.ownerDeviceId ||
            decision.assurance !== "A3" ||
            !decision.proofId
        )
            throw new J18PermissionApprovalError("J18_OWNER_DECISION_INVALID");
        const approval = await this.approvals.decide(decision);
        if (approval.approvalId !== decision.approvalId)
            throw new J18PermissionApprovalError("J18_APPROVAL_ID_MISMATCH");
        if (decision.decision === "APPROVE" && approval.status !== "APPROVED")
            throw new J18PermissionApprovalError("J18_APPROVAL_NOT_APPROVED");
        if (decision.decision === "DENY" && approval.status !== "DENIED")
            throw new J18PermissionApprovalError("J18_APPROVAL_NOT_DENIED");
        return approval;
    }

    async resumeApproved(
        input: J18ApprovalRequestInput,
        approvalId: string,
        signal: AbortSignal,
    ): Promise<J18PermissionApprovalResult> {
        if (signal.aborted)
            throw new J18PermissionApprovalError("J18_CANCELLED");
        const approval = await this.approvals.read(approvalId);
        if (!approval)
            throw new J18PermissionApprovalError("J18_APPROVAL_UNKNOWN");
        assertBinding(approval, input);
        if (approval.expiresAtEpochMs <= this.clock())
            return mapTerminal({ ...approval, status: "EXPIRED" });
        if (["DENIED", "EXPIRED", "REVOKED"].includes(approval.status))
            return mapTerminal(approval);
        if (approval.status !== "APPROVED")
            throw new J18PermissionApprovalError("J18_APPROVAL_NOT_READY");

        const tool = await this.tools.execute(
            { ...input, approvalReference: approval.approvalReference },
            signal,
        );
        return {
            state: "EXECUTED",
            approvalCommitted: true,
            approval: { ...approval, status: "CONSUMED" },
            tool,
        };
    }
}
