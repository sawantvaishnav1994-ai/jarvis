import {
    J06ModelRequestSchema,
    ModelRoutePolicySchema,
    type J06ModelRequest,
    type ModelRouteDecision,
    type ModelRoutePolicy,
} from "./j06-contracts.js";
import {
    ModelProviderFailure,
    ModelProviderRegistry,
    ModelRouter,
    ModelRoutingError,
} from "./router.js";

export type ModelStreamChunk = {
    sequence: number;
    text: string;
    done: boolean;
};

export async function* streamModel(
    registry: ModelProviderRegistry,
    router: ModelRouter,
    requestInput: J06ModelRequest,
    policyInput: ModelRoutePolicy,
    signal: AbortSignal,
): AsyncIterable<ModelStreamChunk & { decision: ModelRouteDecision }> {
    const request = J06ModelRequestSchema.parse(requestInput);
    const policy = ModelRoutePolicySchema.parse(policyInput);
    if (!request.requiredCapabilities.includes("streaming")) {
        throw new ModelRoutingError(
            "STREAMING_CAPABILITY_REQUIRED",
            "Streaming requests must require the streaming capability",
        );
    }
    const decision = router.select(request, policy);
    const candidates = decision.candidates.filter((candidate) => candidate.eligible);
    if (candidates.length === 0) {
        throw new ModelRoutingError("NO_ELIGIBLE_PROVIDER", "No eligible streaming provider", decision);
    }
    let lastError: unknown;
    for (const candidate of candidates) {
        const adapter = registry.get(candidate.providerId, candidate.modelId)!;
        if (!adapter.stream) continue;
        let expectedSequence = 0;
        try {
            for await (const chunk of adapter.stream(request, signal)) {
                if (signal.aborted) {
                    throw new ModelRoutingError("MODEL_CANCELLED", "Streaming cancelled", decision);
                }
                if (chunk.sequence !== expectedSequence) {
                    throw new ModelProviderFailure("STREAM_SEQUENCE_INVALID", false);
                }
                expectedSequence += 1;
                yield { ...chunk, decision };
                if (chunk.done) return;
            }
            throw new ModelProviderFailure("STREAM_INCOMPLETE", false);
        } catch (error) {
            lastError = error;
            if (signal.aborted) {
                throw new ModelRoutingError("MODEL_CANCELLED", "Streaming cancelled", decision);
            }
        }
    }
    throw new ModelRoutingError(
        "ALL_ELIGIBLE_STREAM_PROVIDERS_FAILED",
        lastError instanceof Error ? lastError.message : "All streaming providers failed",
        decision,
    );
}
