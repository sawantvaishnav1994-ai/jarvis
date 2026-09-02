import { z } from "zod";
import {
    IdentifierSchema,
    DataPolicySchema,
    isDurablyStorable,
    BoundaryError,
} from "@jarvis/shared";

export const ProvenanceSchema = z.strictObject({
    kind: z.enum([
        "owner-stated",
        "imported",
        "tool-observed",
        "model-inferred",
    ]),
    source: z.strictObject({
        kind: z.enum([
            "conversation",
            "file",
            "website",
            "tool",
            "person",
            "sensor",
            "model",
        ]),
        id: IdentifierSchema,
        version: z.number().int().positive(),
    }),
    capturedAt: z.iso.datetime(),
    confidence: z.number().min(0).max(1),
    verifiedAt: z.iso.datetime().nullable(),
});
export const DataRecordMetadataSchema = z
    .strictObject({
        id: z.uuid(),
        ownerId: IdentifierSchema,
        projectId: IdentifierSchema.nullable(),
        recordVersion: z.number().int().positive(),
        createdAt: z.iso.datetime(),
        policy: DataPolicySchema,
        provenance: z.array(ProvenanceSchema).min(1).max(100),
        derivedFrom: z.array(z.uuid()).max(100),
    })
    .refine((v) => !v.derivedFrom.includes(v.id), "Self-derived record");
export const MemoryRecordV2Schema = z
    .strictObject({
        version: z.literal(2),
        metadata: DataRecordMetadataSchema,
        kind: z.enum([
            "working",
            "episodic",
            "semantic",
            "project",
            "preference",
            "procedural",
            "relationship",
            "device",
        ]),
        subject: IdentifierSchema,
        content: z.string().min(1).max(50000),
        relationshipIds: z.array(z.uuid()).max(100),
        embeddingIds: z.array(z.uuid()).max(100),
    })
    .refine(
        (v) => v.metadata.policy.classification !== "D5",
        "Secrets require the vault",
    )
    .refine(
        (v) => v.metadata.policy.consent.createMemory,
        "Explicit memory consent required",
    );
export type MemoryRecordV2 = z.infer<typeof MemoryRecordV2Schema>;
export const ConversationRecordSchema = z
    .strictObject({
        version: z.literal(1),
        metadata: DataRecordMetadataSchema,
        participantIds: z.array(IdentifierSchema).min(1).max(100),
        messages: z
            .array(
                z.strictObject({
                    id: z.uuid(),
                    authorId: IdentifierSchema,
                    role: z.enum(["human", "assistant", "tool", "service"]),
                    timestamp: z.iso.datetime(),
                    content: z.string().max(50000),
                    contentType: z.enum(["text/plain", "text/markdown"]),
                    attachmentIds: z.array(z.uuid()).max(100),
                    modelUsed: z
                        .strictObject({
                            provider: IdentifierSchema,
                            model: IdentifierSchema,
                        })
                        .nullable(),
                }),
            )
            .max(1000),
    })
    .refine(
        (v) => v.metadata.policy.classification !== "D5",
        "Secrets require the vault",
    )
    .refine(
        (v) => v.metadata.policy.consent.storeConversation,
        "Conversation retention consent required",
    )
    .refine(
        (v) =>
            v.metadata.policy.consent.keepAttachments ||
            v.messages.every((m) => m.attachmentIds.length === 0),
        "Attachment retention consent required",
    )
    .refine(
        (v) => new Set(v.messages.map((m) => m.id)).size === v.messages.length,
        "Duplicate message ID",
    )
    .refine(
        (v) => v.messages.every((m) => v.participantIds.includes(m.authorId)),
        "Message author must be a participant",
    );
export type ConversationRecord = z.infer<typeof ConversationRecordSchema>;

export function assertRecordRetention(
    metadata: z.infer<typeof DataRecordMetadataSchema>,
    now: number,
): void {
    const m = DataRecordMetadataSchema.parse(metadata);
    if (!isDurablyStorable(m.policy, now) || Date.parse(m.createdAt) > now)
        throw new BoundaryError("DATA_RETENTION_DENIED");
}
/** Implementations need owner authorization, transactional audit, CAS and deletion lineage. */
export interface ClassifiedMemoryRepository {
    create(record: MemoryRecordV2): Promise<void>;
    read(ownerId: string, id: string): Promise<MemoryRecordV2 | null>;
    replace(record: MemoryRecordV2, expectedVersion: number): Promise<boolean>;
}
