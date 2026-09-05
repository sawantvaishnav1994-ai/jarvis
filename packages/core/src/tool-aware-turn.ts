import type { J13ExecutionResult } from "./model-orchestration.js";
import type {
    J14ModelPort,
    J14TurnPipeline,
    J14TurnPipelineInput,
    J14TurnPipelineResult,
} from "./turn-pipeline.js";
import type {
    J17ToolAwareConversationService,
    J17ToolExecutionResult,
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

    take(turnId: string): J13ExecutionResult | undefined {
        const result = this.captured.get(turnId);
        this.captured.delete(turnId);
        return result;
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
        const modelResult = this.capture.take(input.turn.turnId);

        if (turn.state !== "COMPLETED" || modelResult === undefined)
            return { turn, tool: null };
        if (turn.toolExecutionCommitted !== false || turn.approvalCommitted !== false)
            throw new Error("J17_J14_BOUNDARY_INVALID");
        if (!isToolProposalCandidate(modelResult.result.structured))
            return { turn, tool: null };

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

        return { turn, tool };
    }
}
