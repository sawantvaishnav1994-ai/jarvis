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
    type ToolAuditEvent,
    type ToolAuthorizationPort,
    type ToolRequest,
} from "@jarvis/tools";

const authority: ContextAssemblyAuthority = {
    ownerId: "owner:j17",
    projectId: "project:j17",
    conversationId: "conversation:j17",
    sessionId: "session:j17",
    turnId: "turn:j17",
    securityEpoch: 17,
    operatingMode: "assistant",
};

class Authorization implements ToolAuthorizationPort {
    async authorize(
        request: ToolRequest,
        operation: { capability: string },
        inputHash: string,
    ): Promise<AuthorizationDecision> {
        return {
            allowed: true,
            authorizationReference: "auth:j17",
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
        return (
            decision.bindingHash === inputHash &&
            decision.emergencyEpoch === authority.securityEpoch
        );
    }
}

const broker: CredentialBroker = {
    lease: async () => undefined,
};

function modelResult(structured: unknown): J13ExecutionResult {
    return {
        operationId: "operation:j17",
        turnId: authority.turnId,
        correlationId: "model-correlation:j17",
        result: {
            version: 1,
            requestId: "model-request:j17",
            providerId: "provider:j17",
            modelId: "model:j17",
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
            requestId: "model-request:j17",
            selectedProviderId: "provider:j17",
            selectedModelId: "model:j17",
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

function input(structured: unknown) {
    return {
        authority,
        actorId: "owner:j17",
        actorRole: "OWNER" as const,
        modelResult: modelResult(structured),
        requestId: "tool-request:j17",
        correlationId: "tool-correlation:j17",
        deadlineEpochMs: Date.now() + 60_000,
        maxCostMinor: 10,
        externalAllowed: false,
    };
}

function runtime(tools = [syntheticTool("mock.read", "read")]) {
    const audit: ToolAuditEvent[] = [];
    const gateway = new UniversalToolGateway(
        new UniversalToolRegistry(tools),
        new Authorization(),
        broker,
        { append: async (event) => void audit.push(event) },
    );
    return {
        audit,
        service: new J17ToolAwareConversationService(
            { verify: async () => ({ valid: true, reason: "OK" }) },
            gateway,
        ),
    };
}

const readProposal = {
    version: 1 as const,
    kind: "tool-proposal" as const,
    toolId: "mock.read",
    toolVersion: 1,
    operation: "run",
    input: { key: "status", value: "ok" },
    resource: "project:j17",
    privacyClass: "D1" as const,
    requestedMode: "EXECUTE" as const,
    idempotencyKey: "turn:j17:tool:1",
};

describe("J1.7 -> J0.7 gateway integration", () => {
    it("executes a model proposal only through the real UniversalToolGateway", async () => {
        const { service, audit } = runtime();
        const output = await service.execute(
            input(readProposal),
            new AbortController().signal,
        );

        expect(output.result.status).toBe("VERIFIED");
        expect(output.result.verified).toBe(true);
        expect(output.toolExecutionCommitted).toBe(true);
        expect(output.result.provenance).toBe("UNTRUSTED_EXTERNAL_DATA");
        expect(audit.some((event) => event.event === "TOOL_DISPATCHED")).toBe(
            true,
        );
        expect(audit.some((event) => event.event === "TOOL_VERIFIED")).toBe(
            true,
        );
    });

    it("preserves J0.7 privacy denial for external D5 model proposals", async () => {
        const external = syntheticTool("mock.external", "read", {
            boundary: "EXTERNAL_SERVICE",
            allowedClassifications: ["D0", "D1", "D2", "D3", "D4", "D5"],
        });
        const { service, audit } = runtime([external]);
        const proposal = {
            ...readProposal,
            toolId: "mock.external",
            privacyClass: "D5" as const,
            idempotencyKey: "turn:j17:tool:d5",
        };

        await expect(
            service.execute(input(proposal), new AbortController().signal),
        ).rejects.toThrow("J17_TOOL_PRIVACY_DENIED");
        expect(audit.some((event) => event.event === "TOOL_DISPATCHED")).toBe(
            false,
        );
    });

    it("preserves J0.7 missing-tool denial before adapter execution", async () => {
        const { service } = runtime();
        const proposal = {
            ...readProposal,
            toolId: "missing.tool",
            idempotencyKey: "turn:j17:tool:missing",
        };

        await expect(
            service.execute(input(proposal), new AbortController().signal),
        ).rejects.toThrow("J17_TOOL_UNAVAILABLE");
    });

    it("reports a reconciled confirmed effect as committed execution", async () => {
        const { service, audit } = runtime([
            syntheticTool("mock.ambiguous", "ambiguous"),
        ]);
        const proposal = {
            ...readProposal,
            toolId: "mock.ambiguous",
            idempotencyKey: "turn:j17:tool:ambiguous",
        };

        const output = await service.execute(
            input(proposal),
            new AbortController().signal,
        );
        expect(output.result.status).toBe("RECONCILED");
        expect(output.result.verified).toBe(true);
        expect(output.toolExecutionCommitted).toBe(true);
        expect(
            audit.some((event) => event.event === "TOOL_UNKNOWN_OUTCOME"),
        ).toBe(true);
        expect(audit.some((event) => event.event === "TOOL_RECONCILED")).toBe(
            true,
        );
    });
});
