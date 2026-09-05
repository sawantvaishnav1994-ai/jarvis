import type { J13ExecutionResult } from "./model-orchestration.js";
import type {
    J14ModelPort,
    J14TurnPipeline,
    J14TurnPipelineInput,
    J14TurnPipelineResult,
} from "./turn-pipeline.js";
import {
    J17ToolAwareConversationError,
    type J17ToolAwareConversationService,
    type J17ToolExecutionResult,
} from "./tool-aware-conversation.js";

export class J17CapturingModelPort implements J14ModelPort {
    private readonly captured = new Map<string, J13ExecutionResult>();

    constructor(private readonly delegate: J14ModelPort) {}

    async execute(
        input: Parameters<J14ModelPort["execute"]>[0],
        signal: AbortSignal,
    ): Promise<J13ExecutionResult> {
        const result = await this.delegate.execute(input, signal);
        if (result.turnId !== input.authority.turnId) return result;
        this.captured.set(result.turnId, result);
        return result;
    }

    read(turnId: string): J13ExecutionResult | undefined {
        return this.captured.get(turnId);
    }

    clear(turnId: string): void {
        this.captured.delete(turnId);
    }
}

export interface J17ToolAwareTurnInput {
    turn: J14TurnPipelineInput;
    actorId: string;
    actorRole: "OWNER" | "DELEGATE" | "SERVICE" | "AGENT" | "SYSTEM";
    toolRequestId: string;
    toolCorrelationId: string;
    toolDeadlineEpochMs: number;
    toolMaxCostMinor: number;
    externalAllowed: boolean;
    approvalReference?: string;
}

export interface J17ToolAwareTurnResult {
    turn: J14TurnPipelineResult;
    tool: J17ToolExecutionResult | null;
}

function isToolProposalCandidate(value: unknown): boolean {
    return (
        typeof value === "object" &&
        value !== null &&
        "kind" in value &&
        (value as { kind?: unknown }).kind === "tool-proposal"
    );
}

function mayRetryWithApproval(error: unknown): boolean {
    return (
        error instanceof J17ToolAwareConversationError &&
        ["J17_APPROVAL_REQUIRED", "J17_APPROVAL_MISMATCH"].includes(error.code)
    );
}

export class J17ToolAwareTurnCoordinator {
    constructor(
        private readonly pipeline: J14TurnPipeline,
        private readonly capture: J17CapturingModelPort,
        private readonly tools: J17ToolAwareConversationService,
    ) {}

    async execute(
        input: J17ToolAwareTurnInput,
        signal: AbortSignal,
    ): Promise<J17ToolAwareTurnResult> {
        const turn = await this.pipeline.execute(input.turn, signal);
        const modelResult = this.capture.read(input.turn.turnId);

        if (turn.state !== "COMPLETED") {
            this.capture.clear(input.turn.turnId);
            return { turn, tool: null };
        }
        if (modelResult === undefined) return { turn, tool: null };
        if (
            turn.toolExecutionCommitted !== false ||
            turn.approvalCommitted !== false
        )
            throw new Error("J17_J14_BOUNDARY_INVALID");
        if (!isToolProposalCandidate(modelResult.result.structured)) {
            this.capture.clear(input.turn.turnId);
            return { turn, tool: null };
        }

        try {
            const tool = await this.tools.execute(
                {
                    authority: input.turn.authority,
                    actorId: input.actorId,
                    actorRole: input.actorRole,
                    modelResult,
                    requestId: input.toolRequestId,
                    correlationId: input.toolCorrelationId,
                    deadlineEpochMs: input.toolDeadlineEpochMs,
                    maxCostMinor: input.toolMaxCostMinor,
                    externalAllowed: input.externalAllowed,
                    ...(input.approvalReference !== undefined
                        ? { approvalReference: input.approvalReference }
                        : {}),
                },
                signal,
            );
            this.capture.clear(input.turn.turnId);
            return { turn, tool };
        } catch (error) {
            if (!mayRetryWithApproval(error))
                this.capture.clear(input.turn.turnId);
            throw error;
        }
    }
}
