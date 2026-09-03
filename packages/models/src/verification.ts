import {
    J06ModelRequestSchema,
    J06ModelResultSchema,
    type J06ModelRequest,
    type J06ModelResult,
    type ModelRoutePolicy,
} from "./j06-contracts.js";
import { ModelRouter, ModelRoutingError } from "./router.js";

export type IndependentVerification = {
    original: J06ModelResult;
    verifier: J06ModelResult;
    valid: boolean;
};

export async function verifyWithIndependentModel(
    router: ModelRouter,
    originalInput: J06ModelResult,
    verificationRequestInput: J06ModelRequest,
    policyInput: ModelRoutePolicy,
    signal: AbortSignal,
): Promise<IndependentVerification> {
    const original = J06ModelResultSchema.parse(originalInput);
    const request = J06ModelRequestSchema.parse(verificationRequestInput);
    if (request.processingTarget === "APPROVED_EXTERNAL" && !request.dataPolicy.consent.externalAI) {
        throw new ModelRoutingError("EXTERNAL_AI_NOT_ALLOWED", "Verification cannot bypass external AI consent");
    }
    const deniedProviderIds = Array.from(new Set([...policyInput.deniedProviderIds, original.providerId]));
    const policy: ModelRoutePolicy = {
        ...policyInput,
        deniedProviderIds,
    };
    const verification = await router.execute(request, policy, signal);
    if (verification.result.providerId === original.providerId) {
        throw new ModelRoutingError("VERIFIER_NOT_INDEPENDENT", "Verifier must use a distinct provider");
    }
    const structured = verification.result.structured;
    const valid =
        typeof structured === "object" &&
        structured !== null &&
        "valid" in structured &&
        (structured as { valid?: unknown }).valid === true;
    return {
        original: { ...original, verified: valid },
        verifier: verification.result,
        valid,
    };
}
