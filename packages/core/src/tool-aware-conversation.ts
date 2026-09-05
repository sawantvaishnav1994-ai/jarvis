import {
    ToolRequestSchema,
    type ToolRequest,
    type ToolResult,
} from "@jarvis/tools";
import type { J13ExecutionResult } from "./model-orchestration.js";
import type { ContextAssemblyAuthority } from "./context-assembly.js";

const TOOL_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const PRIVACY_CLASSES = new Set(["D0", "D1", "D2", "D3", "D4", "D5"]);
const MODEL_TOOL_MODES = new Set(["INSPECT", "SIMULATE", "DRY_RUN", "EXECUTE"]);
const PROPOSAL_KEYS = new Set([
    "version",
    "kind",
    "toolId",
    "toolVersion",
    "operation",
    "input",
    "resource",
    "privacyClass",
    "requestedMode",
    "idempotencyKey",
]);

export interface ConversationToolProposal {
    version: 1;
    kind: "tool-proposal";
    toolId: string;
    toolVersion: number;
    operation: string;
    input: unknown;
    resource: string;
    privacyClass: "D0" | "D1" | "D2" | "D3" | "D4" | "D5";
    requestedMode: "INSPECT" | "SIMULATE" | "DRY_RUN" | "EXECUTE";
    idempotencyKey?: string;
}

type ProposalParseResult =
    | { success: true; data: ConversationToolProposal }
    | { success: false; error: "INVALID_TOOL_PROPOSAL" };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyBoundedString(
    value: unknown,
    maximumLength: number,
): value is string {
    return (
        typeof value === "string" &&
        value.length >= 1 &&
        value.length <= maximumLength
    );
}

function parseConversationToolProposal(value: unknown): ProposalParseResult {
    if (!isRecord(value))
        return { success: false, error: "INVALID_TOOL_PROPOSAL" };
    if (Object.keys(value).some((key) => !PROPOSAL_KEYS.has(key)))
        return { success: false, error: "INVALID_TOOL_PROPOSAL" };
    if (!Object.prototype.hasOwnProperty.call(value, "input"))
        return { success: false, error: "INVALID_TOOL_PROPOSAL" };
    if (value.version !== 1 || value.kind !== "tool-proposal")
        return { success: false, error: "INVALID_TOOL_PROPOSAL" };
    if (
        !nonEmptyBoundedString(value.toolId, 80) ||
        !TOOL_ID.test(value.toolId) ||
        !Number.isSafeInteger(value.toolVersion) ||
        (value.toolVersion as number) <= 0 ||
        !nonEmptyBoundedString(value.operation, 80) ||
        !nonEmptyBoundedString(value.resource, 500) ||
        typeof value.privacyClass !== "string" ||
        !PRIVACY_CLASSES.has(value.privacyClass) ||
        typeof value.requestedMode !== "string" ||
        !MODEL_TOOL_MODES.has(value.requestedMode)
    )
        return { success: false, error: "INVALID_TOOL_PROPOSAL" };
    if (
        value.idempotencyKey !== undefined &&
        !nonEmptyBoundedString(value.idempotencyKey, 200)
    )
        return { success: false, error: "INVALID_TOOL_PROPOSAL" };

    return {
        success: true,
        data: {
            version: 1,
            kind: "tool-proposal",
            toolId: value.toolId,
            toolVersion: value.toolVersion as number,
            operation: value.operation,
            input: value.input,
            resource: value.resource,
            privacyClass:
                value.privacyClass as ConversationToolProposal["privacyClass"],
            requestedMode:
                value.requestedMode as ConversationToolProposal["requestedMode"],
            ...(value.idempotencyKey !== undefined
                ? { idempotencyKey: value.idempotencyKey }
                : {}),
        },
    };
}

export const ConversationToolProposalSchema = {
    safeParse: parseConversationToolProposal,
} as const;

export interface J17ToolGatewayPort {
    invoke(request: ToolRequest, signal: AbortSignal): Promise<ToolResult>;
}

export interface J17AuthorityCheck {
    valid: boolean;
    reason: string;
}

export interface J17AuthorityVerifier {
    verify(
        authority: ContextAssemblyAuthority,
    ): J17AuthorityCheck | Promise<J17AuthorityCheck>;
}

export interface J17ToolExecutionInput {
    authority: ContextAssemblyAuthority;
    actorId: string;
    actorRole: "OWNER" | "DELEGATE" | "SERVICE" | "AGENT" | "SYSTEM";
    modelResult: J13ExecutionResult;
    requestId: string;
    correlationId: string;
    deadlineEpochMs: number;
    maxCostMinor: number;
    externalAllowed: boolean;
    approvalReference?: string;
}

export interface J17ToolExecutionResult {
    proposal: ConversationToolProposal;
    request: ToolRequest;
    result: ToolResult;
    toolExecutionCommitted: boolean;
    approvalCommitted: false;
    acceptedToolResultAsUntrustedData: true;
}

export class J17ToolAwareConversationError extends Error {
    constructor(readonly code: string) {
        super(code);
        this.name = "J17ToolAwareConversationError";
    }
}

function proposalFrom(result: J13ExecutionResult): ConversationToolProposal {
    if (result.acceptedAsContentOnly !== true)
        throw new J17ToolAwareConversationError(
            "J17_MODEL_RESULT_NOT_CONTENT_ONLY",
        );
    const parsed = ConversationToolProposalSchema.safeParse(
        result.result.structured,
    );
    if (!parsed.success)
        throw new J17ToolAwareConversationError("J17_TOOL_PROPOSAL_INVALID");
    return parsed.data;
}

function mapGatewayFailure(error: unknown): J17ToolAwareConversationError {
    const code =
        error instanceof Error
            ? error.message.toUpperCase()
            : String(error).toUpperCase();
    if (code.includes("APPROVAL_REQUIRED"))
        return new J17ToolAwareConversationError("J17_APPROVAL_REQUIRED");
    if (code.includes("APPROVAL_MISMATCH"))
        return new J17ToolAwareConversationError("J17_APPROVAL_MISMATCH");
    if (code.includes("UNKNOWN_OUTCOME"))
        return new J17ToolAwareConversationError("J17_TOOL_OUTCOME_UNKNOWN");
    if (code.includes("CANCEL"))
        return new J17ToolAwareConversationError("J17_TOOL_CANCELLED");
    if (code.includes("TIMEOUT"))
        return new J17ToolAwareConversationError("J17_TOOL_TIMEOUT");
    if (
        code.includes("EMERGENCY") ||
        code.includes("FREEZE") ||
        code.includes("SHUTDOWN")
    )
        return new J17ToolAwareConversationError("J17_TOOL_EMERGENCY_BLOCKED");
    if (code.includes("PRIVACY"))
        return new J17ToolAwareConversationError("J17_TOOL_PRIVACY_DENIED");
    if (code.includes("COST_BUDGET_EXCEEDED"))
        return new J17ToolAwareConversationError(
            "J17_TOOL_COST_BUDGET_EXCEEDED",
        );
    if (code.includes("CONCURRENCY_CONFLICT"))
        return new J17ToolAwareConversationError(
            "J17_TOOL_CONCURRENCY_CONFLICT",
        );
    if (code.includes("CREDENTIAL_UNAVAILABLE"))
        return new J17ToolAwareConversationError(
            "J17_TOOL_CREDENTIAL_UNAVAILABLE",
        );
    if (
        code.includes("TOOL_NOT_FOUND") ||
        code.includes("TOOL_UNAVAILABLE") ||
        code.includes("TOOL_DISABLED")
    )
        return new J17ToolAwareConversationError("J17_TOOL_UNAVAILABLE");
    if (code.includes("INVALID_INPUT") || code.includes("INVALID_OUTPUT"))
        return new J17ToolAwareConversationError("J17_TOOL_CONTRACT_INVALID");
    if (
        code.includes("AUTHORIZATION") ||
        code.includes("CAPABILITY") ||
        code.includes("DENIED")
    )
        return new J17ToolAwareConversationError(
            "J17_TOOL_AUTHORIZATION_DENIED",
        );
    if (code.includes("IDEMPOTENCY"))
        return new J17ToolAwareConversationError(
            "J17_TOOL_IDEMPOTENCY_CONFLICT",
        );
    return new J17ToolAwareConversationError("J17_TOOL_EXECUTION_FAILED");
}

function executionCommitted(
    proposal: ConversationToolProposal,
    result: ToolResult,
): boolean {
    if (proposal.requestedMode !== "EXECUTE") return false;
    if (["SUCCEEDED", "VERIFIED"].includes(result.status)) return true;
    return result.status === "RECONCILED" && result.verified;
}

export class J17ToolAwareConversationService {
    constructor(
        private readonly authorityVerifier: J17AuthorityVerifier,
        private readonly gateway: J17ToolGatewayPort,
    ) {}

    async execute(
        input: J17ToolExecutionInput,
        signal: AbortSignal,
    ): Promise<J17ToolExecutionResult> {
        if (
            !input.actorId ||
            !input.requestId ||
            !input.correlationId ||
            !Number.isSafeInteger(input.deadlineEpochMs) ||
            input.deadlineEpochMs <= 0 ||
            !Number.isSafeInteger(input.maxCostMinor) ||
            input.maxCostMinor < 0
        )
            throw new J17ToolAwareConversationError("J17_TOOL_REQUEST_INVALID");
        if (input.modelResult.turnId !== input.authority.turnId)
            throw new J17ToolAwareConversationError("J17_TURN_BINDING_INVALID");
        if (signal.aborted)
            throw new J17ToolAwareConversationError("J17_TOOL_CANCELLED");

        const authority = await this.authorityVerifier.verify(input.authority);
        if (!authority.valid)
            throw new J17ToolAwareConversationError("J17_AUTHORITY_INVALID");

        const proposal = proposalFrom(input.modelResult);
        if (proposal.requestedMode === "EXECUTE" && !proposal.idempotencyKey)
            throw new J17ToolAwareConversationError(
                "J17_EXECUTION_IDEMPOTENCY_REQUIRED",
            );

        const request = ToolRequestSchema.parse({
            requestId: input.requestId,
            correlationId: input.correlationId,
            actor: {
                ownerId: input.authority.ownerId,
                actorId: input.actorId,
                role: input.actorRole,
            },
            projectId: input.authority.projectId ?? null,
            source: "MODEL",
            toolId: proposal.toolId,
            toolVersion: proposal.toolVersion,
            operation: proposal.operation,
            input: proposal.input,
            resource: proposal.resource,
            privacyClass: proposal.privacyClass,
            requestedMode: proposal.requestedMode,
            ...(proposal.idempotencyKey !== undefined
                ? { idempotencyKey: proposal.idempotencyKey }
                : {}),
            deadlineEpochMs: input.deadlineEpochMs,
            maxCostMinor: input.maxCostMinor,
            ...(input.approvalReference !== undefined
                ? { approvalReference: input.approvalReference }
                : {}),
            metadata: {
                conversationId: input.authority.conversationId,
                sessionId: input.authority.sessionId,
                turnId: input.authority.turnId,
                securityEpoch: String(input.authority.securityEpoch),
                externalAllowed: input.externalAllowed ? "true" : "false",
            },
        });

        let result: ToolResult;
        try {
            result = await this.gateway.invoke(request, signal);
        } catch (error) {
            throw mapGatewayFailure(error);
        }

        if (
            result.requestId !== request.requestId ||
            result.toolId !== request.toolId ||
            result.toolVersion !== request.toolVersion ||
            result.operation !== request.operation ||
            result.provenance !== "UNTRUSTED_EXTERNAL_DATA"
        )
            throw new J17ToolAwareConversationError(
                "J17_TOOL_RESULT_BINDING_INVALID",
            );

        return {
            proposal,
            request,
            result,
            toolExecutionCommitted: executionCommitted(proposal, result),
            approvalCommitted: false,
            acceptedToolResultAsUntrustedData: true,
        };
    }
}
