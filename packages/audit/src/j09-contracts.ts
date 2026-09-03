import { z } from "zod";
import { DataClassSchema } from "@jarvis/shared";

export const J09AuditActions = [
    "identity.owner.authenticated","identity.authentication.failed","identity.device.trusted","identity.device.revoked","identity.session.created","identity.session.revoked",
    "security.policy.evaluated","security.request.denied","security.approval.requested","security.approval.granted","security.approval.rejected","security.emergency.changed",
    "storage.record.created","storage.record.deleted","storage.retention.applied","storage.key_rotation.started","storage.key_rotation.completed",
    "memory.admission.accepted","memory.admission.rejected","memory.record.created","memory.record.corrected","memory.record.superseded","memory.record.forgotten","memory.record.retrieved",
    "model.route.selected","model.request.started","model.request.completed","model.request.failed","model.request.cancelled",
    "tool.execution.requested","tool.execution.authorized","tool.execution.denied","tool.execution.started","tool.execution.completed","tool.execution.verified","tool.execution.failed","tool.execution.unknown","tool.execution.cancelled","tool.execution.reconciled","tool.rollback.executed",
    "event.accepted","event.rejected","event.deduplicated","event.routed","event.processed","event.retry_scheduled","event.dead_lettered","event.replayed","event.scheduled","event.cancelled","event.claim_reclaimed",
    "audit.read","audit.exported","audit.integrity.verified","audit.integrity.failed","audit.redaction.applied",
    "system.started","system.stopped","system.dependency.failed","system.dependency.recovered"
] as const;
export const AuditActionSchema = z.enum(J09AuditActions);
export const AuditResultV3Schema = z.enum(["REQUESTED","AUTHORIZED","DENIED","SUCCESS","FAILED","UNKNOWN","CANCELLED"]);
export const AuditSeveritySchema = z.enum(["TRACE","INFO","NOTICE","WARN","ERROR","CRITICAL"]);
export const AuditActorTypeSchema = z.enum(["OWNER","HUMAN","DEVICE","CORE","AGENT","SERVICE","TOOL","INTEGRATION","SYSTEM"]);
export const AuditRetentionClassSchema = z.enum(["SECURITY","OWNER_ACTIVITY","OPERATIONAL","EPHEMERAL_TRACE"]);
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const SafeReferenceSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9._:/@-]+$/);
export const TraceContextSchema = z.strictObject({
    traceId: SafeReferenceSchema,
    spanId: SafeReferenceSchema,
    parentSpanId: SafeReferenceSchema.optional(),
    correlationId: SafeReferenceSchema,
    causationId: SafeReferenceSchema.optional(),
});
export const AuditTargetSchema = z.strictObject({type:SafeReferenceSchema,id:SafeReferenceSchema.optional()});
export const AuditRecordV3Schema = z.strictObject({
    version:z.literal(3), auditId:z.uuid(), sequence:z.number().int().positive(),
    occurredAt:z.iso.datetime(), recordedAt:z.iso.datetime(), ownerId:SafeReferenceSchema,
    projectId:SafeReferenceSchema.nullable(), actor:z.strictObject({id:SafeReferenceSchema,type:AuditActorTypeSchema}),
    sessionId:SafeReferenceSchema.optional(), deviceId:SafeReferenceSchema.optional(), action:AuditActionSchema,
    target:AuditTargetSchema, result:AuditResultV3Schema, severity:AuditSeveritySchema,
    classification:DataClassSchema.exclude(["D5"]), trace:TraceContextSchema,
    policyDecisionId:SafeReferenceSchema.optional(), approvalId:SafeReferenceSchema.optional(), toolExecutionId:SafeReferenceSchema.optional(),
    modelRequestId:SafeReferenceSchema.optional(), memoryId:SafeReferenceSchema.optional(), eventId:SafeReferenceSchema.optional(),
    inputDigest:Sha256Schema.optional(), outputDigest:Sha256Schema.optional(), previousHash:Sha256Schema.nullable(), recordHash:Sha256Schema,
    redactions:z.array(SafeReferenceSchema).max(64), retentionClass:AuditRetentionClassSchema,
    safeMetadata:z.record(z.string().max(64),z.union([z.string().max(256),z.number().finite(),z.boolean(),z.null()])).max(32),
});
export type AuditRecordV3=z.infer<typeof AuditRecordV3Schema>;
export type AuditRecordDraft=Omit<AuditRecordV3,"version"|"sequence"|"recordedAt"|"previousHash"|"recordHash">;