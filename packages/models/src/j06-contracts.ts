import { z } from "zod";
import { DataPolicySchema } from "@jarvis/shared";

export const ModelCapabilitySchema = z.enum([
    "text",
    "reasoning",
    "vision",
    "audio",
    "structured-output",
    "streaming",
    "tool-planning",
]);
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ProcessingTargetSchema = z.enum([
    "LOCAL",
    "PRIVATE_REMOTE",
    "APPROVED_EXTERNAL",
]);
export type ProcessingTarget = z.infer<typeof ProcessingTargetSchema>;

export const ProviderHealthSchema = z.enum([
    "HEALTHY",
    "DEGRADED",
    "UNAVAILABLE",
    "DISABLED",
]);
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;

export const ModelDescriptorSchema = z.strictObject({
    version: z.literal(1),
    providerId: z.string().min(1).max(100),
    modelId: z.string().min(1).max(200),
    modelFamily: z.string().min(1).max(200).optional(),
    revision: z.string().min(1).max(200).nullable().optional(),
    locality: ProcessingTargetSchema,
    capabilities: z.array(ModelCapabilitySchema).min(1).max(7),
    contextWindowTokens: z.number().int().positive().max(10_000_000),
    maxOutputTokens: z.number().int().positive().max(1_000_000),
    pricingKnown: z.boolean().optional(),
    inputCostPerMillion: z.number().finite().nonnegative().max(100_000),
    outputCostPerMillion: z.number().finite().nonnegative().max(100_000),
    latencyClass: z.enum(["low", "standard", "high"]).optional(),
    qualityTier: z.number().int().min(0).max(100).optional(),
    reliabilityTier: z.number().int().min(0).max(100).optional(),
    region: z.string().min(1).max(100).nullable().optional(),
    health: ProviderHealthSchema,
    credentialRef: z.string().min(1).max(300).nullable(),
});
export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;

export const ModelContextBoundarySchema = z.strictObject({
    packageId: z.string().min(1).max(200),
    classification: z.enum(["D0", "D1", "D2", "D3", "D4", "D5"]),
    privacy: z.enum(["local-only", "private-cloud", "ai-allow"]),
    externalAI: z.boolean(),
    minimized: z.literal(true),
    containsSecretMaterial: z.boolean(),
});
export type ModelContextBoundary = z.infer<typeof ModelContextBoundarySchema>;

export const J06ModelMessageSchema = z.strictObject({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().max(50_000),
});

export const J06ModelRequestSchema = z.strictObject({
    version: z.literal(1),
    requestId: z.string().min(1).max(200),
    ownerId: z.string().min(1).max(200),
    projectId: z.string().min(1).max(200).nullable(),
    messages: z.array(J06ModelMessageSchema).min(1).max(128),
    requiredCapabilities: z.array(ModelCapabilitySchema).max(7),
    processingTarget: ProcessingTargetSchema,
    dataPolicy: DataPolicySchema,
    context: ModelContextBoundarySchema,
    inputTokenEstimate: z.number().int().nonnegative().max(10_000_000),
    maxOutputTokens: z.number().int().positive().max(1_000_000),
    maxTotalTokens: z.number().int().positive().max(10_000_000),
    maxCost: z.number().finite().nonnegative().max(100_000),
    timeoutMs: z.number().int().min(1).max(300_000),
    responseFormat: z.enum(["text", "json"]),
    contractId: z.string().min(1).max(200).nullable(),
});
export type J06ModelRequest = z.infer<typeof J06ModelRequestSchema>;

export const NormalizedUsageSchema = z.strictObject({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    cost: z.number().finite().nonnegative().nullable(),
});
export type NormalizedUsage = z.infer<typeof NormalizedUsageSchema>;

export const J06ModelResultSchema = z.strictObject({
    version: z.literal(1),
    requestId: z.string().min(1).max(200),
    providerId: z.string().min(1).max(100),
    modelId: z.string().min(1).max(200),
    text: z.string().max(100_000),
    structured: z.unknown().nullable(),
    usage: NormalizedUsageSchema,
    finishReason: z.enum(["stop", "length", "cancelled", "error"]),
    verified: z.boolean(),
});
export type J06ModelResult = z.infer<typeof J06ModelResultSchema>;

export const RouteRejectionCodeSchema = z.enum([
    "PROVIDER_NOT_ALLOWED",
    "PROVIDER_DENIED",
    "PINNED_MODEL_MISMATCH",
    "LOCALITY_MISMATCH",
    "PRIVACY_MISMATCH",
    "CAPABILITY_MISMATCH",
    "UNAVAILABLE",
    "DEGRADED_NOT_ALLOWED",
    "CONTEXT_WINDOW",
    "OUTPUT_LIMIT",
    "TOKEN_BUDGET",
    "COST_BUDGET",
    "COST_UNKNOWN",
]);
export type RouteRejectionCode = z.infer<typeof RouteRejectionCodeSchema>;

export const ModelRoutingStrategySchema = z.enum([
    "balanced",
    "cheapest-eligible",
    "fastest-eligible",
    "highest-quality-eligible",
    "local-private-preferred",
    "pinned",
    "fallback-chain",
]);
export type ModelRoutingStrategy = z.infer<typeof ModelRoutingStrategySchema>;

export const ModelRoutePolicySchema = z.strictObject({
    allowedProviderIds: z.array(z.string().min(1).max(100)).max(100),
    deniedProviderIds: z.array(z.string().min(1).max(100)).max(100),
    preferredProviderIds: z.array(z.string().min(1).max(100)).max(100),
    allowDegraded: z.boolean(),
    allowUnknownCost: z.boolean().optional(),
    strategy: ModelRoutingStrategySchema.optional(),
    pinnedProviderId: z.string().min(1).max(100).nullable().optional(),
    pinnedModelId: z.string().min(1).max(200).nullable().optional(),
    maxAttempts: z.number().int().min(1).max(5),
});
export type ModelRoutePolicy = z.infer<typeof ModelRoutePolicySchema>;

export const RouteCandidateSchema = z.strictObject({
    providerId: z.string().min(1).max(100),
    modelId: z.string().min(1).max(200),
    eligible: z.boolean(),
    estimatedCost: z.number().finite().nonnegative().nullable(),
    rejectionCodes: z.array(RouteRejectionCodeSchema),
});
export type RouteCandidate = z.infer<typeof RouteCandidateSchema>;

export const ModelRouteDecisionSchema = z.strictObject({
    version: z.literal(1),
    requestId: z.string().min(1).max(200),
    selectedProviderId: z.string().min(1).max(100).nullable(),
    selectedModelId: z.string().min(1).max(200).nullable(),
    candidates: z.array(RouteCandidateSchema),
    reasons: z.array(z.string().min(1).max(200)).max(100),
});
export type ModelRouteDecision = z.infer<typeof ModelRouteDecisionSchema>;

export const ModelAuditRecordSchema = z.strictObject({
    version: z.literal(1),
    requestId: z.string().min(1).max(200),
    providerId: z.string().min(1).max(100).nullable(),
    modelId: z.string().min(1).max(200).nullable(),
    event: z.enum([
        "route.selected",
        "route.rejected",
        "provider.retry",
        "provider.fallback",
        "provider.success",
        "provider.failure",
        "provider.cancelled",
        "verification.completed",
    ]),
    processingTarget: ProcessingTargetSchema,
    classification: z.enum(["D0", "D1", "D2", "D3", "D4", "D5"]),
    capabilities: z.array(ModelCapabilitySchema).max(7),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    cost: z.number().finite().nonnegative().nullable(),
    code: z.string().min(1).max(200).nullable(),
});
export type ModelAuditRecord = z.infer<typeof ModelAuditRecordSchema>;
