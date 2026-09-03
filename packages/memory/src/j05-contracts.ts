import { z } from "zod";
import { DataPolicySchema, IdentifierSchema } from "@jarvis/shared";
import { ProvenanceSchema } from "./records-v2.js";

export const MemoryLifecycleStateSchema = z.enum([
    "PROPOSED",
    "ACTIVE",
    "SUPERSEDED",
    "DISPUTED",
    "EXPIRED",
    "DELETION_REQUESTED",
    "DELETED",
    "PURGED",
]);
export type MemoryLifecycleState = z.infer<typeof MemoryLifecycleStateSchema>;

export const MemoryAssertionStatusSchema = z.enum([
    "OWNER_ASSERTED",
    "OBSERVED",
    "IMPORTED",
    "MODEL_INFERRED",
    "DERIVED",
]);
export type MemoryAssertionStatus = z.infer<typeof MemoryAssertionStatusSchema>;

export const MemoryKindSchema = z.enum([
    "working",
    "episodic",
    "semantic",
    "project",
    "preference",
    "procedural",
    "relationship",
    "device",
]);

export const MemoryTemporalSchema = z
    .strictObject({
        capturedAt: z.iso.datetime(),
        observedAt: z.iso.datetime().nullable(),
        validFrom: z.iso.datetime().nullable(),
        validUntil: z.iso.datetime().nullable(),
        verifiedAt: z.iso.datetime().nullable(),
        supersededAt: z.iso.datetime().nullable(),
    })
    .refine(
        (value) =>
            value.validFrom === null ||
            value.validUntil === null ||
            Date.parse(value.validFrom) <= Date.parse(value.validUntil),
        "Memory validity interval is inverted",
    );

export const MemoryCandidateSchema = z.strictObject({
    version: z.literal(1),
    candidateId: z.uuid(),
    ownerId: IdentifierSchema,
    projectId: IdentifierSchema.nullable(),
    kind: MemoryKindSchema,
    subject: IdentifierSchema,
    content: z.string().min(1).max(50000),
    assertion: MemoryAssertionStatusSchema,
    confidence: z.number().min(0).max(1),
    policy: DataPolicySchema,
    provenance: z.array(ProvenanceSchema).min(1).max(100),
    derivedFrom: z.array(z.uuid()).max(100),
    temporal: MemoryTemporalSchema,
    semanticKey: z.string().min(1).max(512).nullable(),
});
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;

export const MemoryAdmissionDecisionSchema = z.strictObject({
    version: z.literal(1),
    decision: z.enum([
        "ACCEPT",
        "ACCEPT_EPHEMERAL",
        "MERGE_WITH_EXISTING",
        "SUPERSEDE_EXISTING",
        "MARK_CONFLICT",
        "REQUIRE_OWNER_CONFIRMATION",
        "REJECT",
    ]),
    canonicalMemoryId: z.uuid().nullable(),
    relatedMemoryIds: z.array(z.uuid()).max(100),
    reasonCodes: z.array(z.string().min(1).max(100)).min(1).max(50),
});
export type MemoryAdmissionDecision = z.infer<typeof MemoryAdmissionDecisionSchema>;

export const MemoryConflictSchema = z.strictObject({
    version: z.literal(1),
    id: z.uuid(),
    ownerId: IdentifierSchema,
    projectId: IdentifierSchema.nullable(),
    memoryIds: z.array(z.uuid()).min(2).max(20),
    semanticKey: z.string().min(1).max(512),
    state: z.enum(["OPEN", "RESOLVED", "OWNER_CONFIRMATION_REQUIRED"]),
    resolution: z
        .enum([
            "SUPERSEDE",
            "PRESERVE_TEMPORAL_HISTORY",
            "DISPUTED",
            "OWNER_CORRECTED",
            "REJECT_LOW_AUTHORITY",
        ])
        .nullable(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
});
export type MemoryConflict = z.infer<typeof MemoryConflictSchema>;

export const MemoryRevisionSchema = z.strictObject({
    version: z.literal(1),
    id: z.uuid(),
    memoryId: z.uuid(),
    ownerId: IdentifierSchema,
    recordVersion: z.number().int().positive(),
    lifecycle: MemoryLifecycleStateSchema,
    assertion: MemoryAssertionStatusSchema,
    contentHash: z.string().min(32).max(128),
    changedAt: z.iso.datetime(),
    reason: z.string().min(1).max(500),
    supersedesRevisionId: z.uuid().nullable(),
});
export type MemoryRevision = z.infer<typeof MemoryRevisionSchema>;

export const MemoryQuerySchema = z.strictObject({
    version: z.literal(1),
    ownerId: IdentifierSchema,
    projectId: IdentifierSchema.nullable(),
    query: z.string().min(1).max(10000),
    kinds: z.array(MemoryKindSchema).max(20),
    entityIds: z.array(z.uuid()).max(100),
    includeDisputed: z.boolean().default(false),
    asOf: z.iso.datetime(),
    limit: z.number().int().min(1).max(100),
});
export type MemoryQuery = z.infer<typeof MemoryQuerySchema>;

export const RetrievalReasonSchema = z.enum([
    "EXACT_MATCH",
    "PROJECT_SCOPE",
    "ENTITY_MATCH",
    "LEXICAL_MATCH",
    "SEMANTIC_SIMILARITY",
    "TEMPORAL_RELEVANCE",
    "VERIFIED_SOURCE",
    "OWNER_ASSERTED",
    "PINNED",
    "GRAPH_EXPANSION",
]);
export type RetrievalReason = z.infer<typeof RetrievalReasonSchema>;

export const MemoryRetrievalCandidateSchema = z.strictObject({
    memoryId: z.uuid(),
    score: z.number().min(0).max(1),
    reasons: z.array(RetrievalReasonSchema).min(1).max(20),
    lifecycle: MemoryLifecycleStateSchema,
    assertion: MemoryAssertionStatusSchema,
    confidence: z.number().min(0).max(1),
});
export type MemoryRetrievalCandidate = z.infer<typeof MemoryRetrievalCandidateSchema>;

export const MemoryRetrievalResultSchema = z.strictObject({
    version: z.literal(1),
    query: MemoryQuerySchema,
    candidates: z.array(MemoryRetrievalCandidateSchema).max(100),
    degraded: z.boolean(),
    degradationReasons: z.array(z.string().min(1).max(100)).max(20),
});
export type MemoryRetrievalResult = z.infer<typeof MemoryRetrievalResultSchema>;

export const ContextBudgetSchema = z.strictObject({
    maxMemories: z.number().int().min(1).max(100),
    maxGraphFacts: z.number().int().min(0).max(200),
    maxCharacters: z.number().int().min(1).max(500000),
    maxRelationshipDepth: z.number().int().min(0).max(5),
    maxAgeDays: z.number().int().positive().nullable(),
});
export type ContextBudget = z.infer<typeof ContextBudgetSchema>;

export const ContextRequestSchema = z.strictObject({
    version: z.literal(1),
    ownerId: IdentifierSchema,
    projectId: IdentifierSchema.nullable(),
    purpose: z.string().min(1).max(1000),
    query: z.string().min(1).max(10000),
    processingTarget: z.enum([
        "LOCAL_ONLY",
        "PRIVATE_INFRASTRUCTURE",
        "APPROVED_EXTERNAL_AI",
        "SPECIFIC_PROVIDER_ONLY",
    ]),
    providerId: IdentifierSchema.nullable(),
    budget: ContextBudgetSchema,
});
export type ContextRequest = z.infer<typeof ContextRequestSchema>;

export const ContextItemSchema = z.strictObject({
    memoryId: z.uuid(),
    content: z.string().min(1).max(50000),
    confidence: z.number().min(0).max(1),
    assertion: MemoryAssertionStatusSchema,
    reasons: z.array(RetrievalReasonSchema).min(1).max(20),
    provenanceCount: z.number().int().positive(),
});
export type ContextItem = z.infer<typeof ContextItemSchema>;

export const ContextExclusionSchema = z.strictObject({
    recordId: z.uuid().nullable(),
    reason: z.enum([
        "OWNER_SCOPE",
        "PROJECT_SCOPE",
        "LIFECYCLE",
        "EXPIRED",
        "DISPUTED",
        "D5_SECRET",
        "NEVER_EXTERNAL",
        "PROCESSING_POLICY",
        "BUDGET",
        "LOW_RELEVANCE",
        "MALFORMED",
    ]),
});
export type ContextExclusion = z.infer<typeof ContextExclusionSchema>;

export const ContextPackageSchema = z.strictObject({
    version: z.literal(1),
    ownerId: IdentifierSchema,
    projectId: IdentifierSchema.nullable(),
    items: z.array(ContextItemSchema).max(100),
    exclusions: z.array(ContextExclusionSchema).max(1000),
    totalCharacters: z.number().int().nonnegative(),
    processingAllowed: z.boolean(),
    degraded: z.boolean(),
});
export type ContextPackage = z.infer<typeof ContextPackageSchema>;
