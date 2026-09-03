import { z } from "zod";
import { DataPolicySchema, IdentifierSchema } from "@jarvis/shared";
import { ProvenanceSchema } from "@jarvis/memory";

export const EntityLifecycleStateSchema = z.enum([
    "ACTIVE",
    "SUPERSEDED",
    "DELETION_REQUESTED",
    "DELETED",
    "PURGED",
]);

export const EntitySchema = z.strictObject({
    version: z.literal(1),
    id: z.uuid(),
    ownerId: IdentifierSchema,
    projectId: IdentifierSchema.nullable(),
    type: z.string().min(1).max(100),
    canonicalName: z.string().min(1).max(1000),
    aliases: z.array(z.string().min(1).max(1000)).max(100),
    policy: DataPolicySchema,
    lifecycle: EntityLifecycleStateSchema,
    provenance: z.array(ProvenanceSchema).min(1).max(100),
    recordVersion: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const RelationshipStatusSchema = z.enum([
    "ACTIVE",
    "DISPUTED",
    "SUPERSEDED",
    "UNSUPPORTED",
    "DELETED",
]);

export const RelationshipEvidenceSchema = z.strictObject({
    version: z.literal(1),
    id: z.uuid(),
    ownerId: IdentifierSchema,
    relationshipId: z.uuid(),
    sourceMemoryId: z.uuid().nullable(),
    sourceRecordId: z.uuid(),
    provenance: ProvenanceSchema,
    confidence: z.number().min(0).max(1),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
});
export type RelationshipEvidence = z.infer<typeof RelationshipEvidenceSchema>;

export const KnowledgeRelationshipSchema = z
    .strictObject({
        version: z.literal(1),
        id: z.uuid(),
        ownerId: IdentifierSchema,
        projectId: IdentifierSchema.nullable(),
        sourceEntityId: z.uuid(),
        predicate: z.string().min(1).max(200),
        target: z.discriminatedUnion("kind", [
            z.strictObject({ kind: z.literal("entity"), entityId: z.uuid() }),
            z.strictObject({
                kind: z.literal("literal"),
                value: z.string().min(1).max(10000),
                valueType: z.enum(["string", "number", "boolean", "date", "datetime"]),
            }),
        ]),
        policy: DataPolicySchema,
        status: RelationshipStatusSchema,
        confidence: z.number().min(0).max(1),
        validFrom: z.iso.datetime().nullable(),
        validUntil: z.iso.datetime().nullable(),
        evidenceIds: z.array(z.uuid()).min(1).max(100),
        recordVersion: z.number().int().positive(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
    })
    .refine(
        (value) =>
            value.validFrom === null ||
            value.validUntil === null ||
            Date.parse(value.validFrom) <= Date.parse(value.validUntil),
        "Relationship validity interval is inverted",
    );
export type KnowledgeRelationship = z.infer<typeof KnowledgeRelationshipSchema>;

export const GraphQuerySchema = z.strictObject({
    version: z.literal(1),
    ownerId: IdentifierSchema,
    projectId: IdentifierSchema.nullable(),
    startEntityIds: z.array(z.uuid()).min(1).max(25),
    predicates: z.array(z.string().min(1).max(200)).max(50),
    asOf: z.iso.datetime(),
    maxDepth: z.number().int().min(0).max(5),
    maxEdges: z.number().int().min(1).max(500),
    includeDisputed: z.boolean().default(false),
});
export type GraphQuery = z.infer<typeof GraphQuerySchema>;

export const GraphResultSchema = z.strictObject({
    version: z.literal(1),
    entities: z.array(EntitySchema).max(500),
    relationships: z.array(KnowledgeRelationshipSchema).max(500),
    evidence: z.array(RelationshipEvidenceSchema).max(2000),
    truncated: z.boolean(),
    maxDepthReached: z.number().int().min(0).max(5),
});
export type GraphResult = z.infer<typeof GraphResultSchema>;
