import { describe, expect, it } from "vitest";
import {
    J17ToolAwareConversationService,
    type ContextAssemblyAuthority,
    type J13ExecutionResult,
} from "@jarvis/core";
import {
    UniversalToolGateway,
    UniversalToolRegistry,
    syntheticTool,
    type AuthorizationDecision,
    type CredentialBroker,
    type ToolAuthorizationPort,
    type ToolRequest,
} from "@jarvis/tools";

const authority: ContextAssemblyAuthority = {
    ownerId: "owner:j17-boundary",
    projectId: "project:j17-boundary",
    conversationId: "conversation:j17-boundary",
    sessionId: "session:j17-boundary",
    turnId: "turn:j17-boundary",
    securityEpoch: 31,
    operatingMode: "assistant",
};

class ApprovalAuthorization implements ToolAuthorizationPort {
    constructor(private readonly approvalReference?: string) {}

    async authorize(
        request: ToolRequest,
        operation: { capability: string },
        inputHash: string,
    ): Promise<AuthorizationDecision> {
        return {
            allowed: true,
            authorizationReference: "authorization:j17-boundary",
            ...(this.approvalReference !== undefined
                ? { approvalReference: this.approvalReference }
                : {}),
            bindingHash: inputHash,
            capability: operation.capability,
            resource: request.resource,
            expiresAt: Date.now() + 60_000,
            emergencyEpoch: authority.securityEpoch,
            reason: "test-policy",
        };
    }

    async revalidate(
        _request: ToolRequest,
        decision: AuthorizationDecision,
        inputHash: string,
    ): Promise<boolean> {
        return decision.bindingHash === inputHash;
    }
}

const broker: CredentialBroker = { lease: async () => undefined };

const proposal = {
    version: 1 as const,
    kind: "tool-proposal" as const,
    toolId: "mock.read",
    toolVersion: 1,
    operation: "run",
    input: { key: "status", value: "ok" },
    resource: authority.projectId ?? "project:j17-boundary",
    privacyClass: "D1" as const,
    requestedMode: "EXECUTE" as const,
    idempotencyKey: "turn:j17-boundary:tool:1",
};

function modelResult(structured: unknown): J13ExecutionResult {
    return {
        operationId: "operation:j17-boundary",
        turnId: authority.turnId,
        correlationId: "model-correlation:j17-boundary",
        result: {
            version: 1,
            requestId: "model-request:j17-boundary",
            providerId: "synthetic",
            modelId: "reasoner",
            text: "",
            structured,
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
            requestId: "model-request:j17-boundary",
            selectedProviderId: "synthetic",
            selectedModelId: "reasoner",
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

function executeInput(structured: unknown, approvalReference?: string) {
    return {
        authority,
        actorId: authority.ownerId,
        actorRole: "OWNER" as const,
        modelResult: modelResult(structured),
        requestId: "tool-request:j17-boundary",
        correlationId: "tool-correlation:j17-boundary",
        deadlineEpochMs: Date.now() + 60_000,
        maxCostMinor: 10,
        externalAllowed: false,
        ...(approvalReference !== undefined ? { approvalReference } : {}),
    };
}

function service(
    tool = syntheticTool("mock.read", "read"),
    approvalReference?: string,
) {
    const gateway = new UniversalToolGateway(
        new UniversalToolRegistry([tool]),
        new ApprovalAuthorization(approvalReference),
        broker,
        { append: async () => {} },
    );
    return new J17ToolAwareConversationService(
        { verify: async () => ({ valid: true, reason: "OK" }) },
        gateway,
    );
}

describe("J1.7 governed boundary details", () => {
    it("preserves exact trusted approval-reference binding and rejects mismatch", async () => {
        const runtime = service(undefined, "approval:trusted");
        await expect(
            runtime.execute(
                executeInput(proposal, "approval:wrong"),
                new AbortController().signal,
            ),
        ).rejects.toThrow("J17_APPROVAL_MISMATCH");
    });

    it("passes the caller-held trusted approval reference without letting the model supply it", async () => {
        const runtime = service(undefined, "approval:trusted");
        const result = await runtime.execute(
            executeInput(proposal, "approval:trusted"),
            new AbortController().signal,
        );
        expect(result.request.approvalReference).toBe("approval:trusted");
        expect(result.approvalCommitted).toBe(false);
    });

    it("treats prompt-injection-shaped tool output only as untrusted data", async () => {
        const runtime = service(syntheticTool("mock.read", "injection"));
        const result = await runtime.execute(
            executeInput(proposal),
            new AbortController().signal,
        );
        expect(result.result.provenance).toBe("UNTRUSTED_EXTERNAL_DATA");
        expect(result.acceptedToolResultAsUntrustedData).toBe(true);
        expect(JSON.stringify(result.result.output)).toContain("Ignore policy");
    });
});
