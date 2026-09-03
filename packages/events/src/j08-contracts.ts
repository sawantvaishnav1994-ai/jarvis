import { z } from "zod";
import { DataClassSchema, PrivacySchema } from "@jarvis/shared";

export const J08EventTypeSchema = z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/).max(160);
export const J08ProducerTypeSchema = z.enum(["INTERNAL","EXTERNAL","SCHEDULED","SYSTEM"]);
export const J08ConsumerBoundarySchema = z.enum(["LOCAL","PRIVATE_INFRA","EXTERNAL_SERVICE"]);
export const J08DeliveryStateSchema = z.enum(["PENDING","CLAIMED","PROCESSING","COMPLETED","RETRY_SCHEDULED","DEAD_LETTERED","CANCELLED"]);
export const J08ReplayPolicySchema = z.enum(["DENY","OWNER_ONLY","AUTHORIZED"]);
export const J08DurableDataClassSchema = z.enum(["D0","D1","D2","D3","D4"]);

export const JarvisEventEnvelopeSchema = z.strictObject({
  eventId: z.uuid(), eventType: J08EventTypeSchema, schemaVersion: z.number().int().positive(),
  occurredAt: z.iso.datetime(), receivedAt: z.iso.datetime(), ownerId: z.string().min(1).max(128),
  projectId: z.string().min(1).max(128).optional(), correlationId: z.string().min(1).max(128),
  causationId: z.uuid().optional(), traceId: z.string().min(1).max(128).optional(),
  producerId: z.string().min(1).max(128), producerType: J08ProducerTypeSchema, sourceEventId: z.string().min(1).max(256).optional(),
  subject: z.string().min(1).max(256), payload: z.record(z.string(), z.json()),
  payloadClassification: DataClassSchema, privacy: PrivacySchema,
  sequenceKey: z.string().min(1).max(256).optional(), sequence: z.number().int().nonnegative().optional(),
  chainDepth: z.number().int().min(0).max(32).default(0), replayOf: z.uuid().optional(), replayReason: z.string().min(1).max(256).optional(),
}).superRefine((v,ctx)=>{
  if ((v.sequenceKey===undefined)!==(v.sequence===undefined)) ctx.addIssue({code:"custom",message:"sequenceKey and sequence must be paired"});
  if (v.payloadClassification==="D5" && v.privacy!=="local-only") ctx.addIssue({code:"custom",message:"D5 events are local-only"});
  if ((v.replayOf===undefined)!==(v.replayReason===undefined)) ctx.addIssue({code:"custom",message:"replay metadata must be paired"});
});
export type JarvisEventEnvelope = z.infer<typeof JarvisEventEnvelopeSchema>;

export const EventTypeDefinitionSchema = z.strictObject({
  eventType: J08EventTypeSchema, schemaVersion: z.number().int().positive(), payloadSchema: z.custom<z.ZodType>(),
  allowedProducerTypes: z.array(J08ProducerTypeSchema).min(1), maxClassification: J08DurableDataClassSchema,
  replayPolicy: J08ReplayPolicySchema, maxPayloadBytes: z.number().int().positive().max(1_048_576),
});
export type EventTypeDefinition = z.infer<typeof EventTypeDefinitionSchema>;

export const EventSubscriptionSchema = z.strictObject({
  subscriptionId: z.string().min(1).max(128), consumerId: z.string().min(1).max(128), consumerType: z.enum(["SERVICE","AGENT","WORKFLOW","SYSTEM"]),
  eventType: J08EventTypeSchema, ownerId: z.string().min(1).max(128), projectId: z.string().min(1).max(128).optional(),
  boundary: J08ConsumerBoundarySchema, maxClassification: DataClassSchema, enabled: z.boolean(),
  maxAttempts: z.number().int().min(1).max(10), baseBackoffMs: z.number().int().min(0).max(60_000),
  ordered: z.boolean(), deadLetter: z.boolean(),
});
export type EventSubscription = z.infer<typeof EventSubscriptionSchema>;

export const ExternalIngressRequestSchema = z.strictObject({
  producerId: z.string().min(1).max(128), sourceEventId: z.string().min(1).max(256), timestamp: z.number().int().nonnegative(),
  nonce: z.string().min(1).max(256).optional(), signature: z.string().min(1).max(1024), rawBody: z.string().max(1_048_576),
});
export type ExternalIngressRequest = z.infer<typeof ExternalIngressRequestSchema>;

export const EventScheduleSchema = z.strictObject({
  scheduleId: z.string().min(1).max(128), ownerId: z.string().min(1).max(128), projectId: z.string().min(1).max(128).optional(),
  eventType: J08EventTypeSchema, schemaVersion: z.number().int().positive(), subject: z.string().min(1).max(256), payload: z.record(z.string(),z.json()),
  classification: J08DurableDataClassSchema, privacy: PrivacySchema, timezone: z.string().min(1).max(80), nextDueAt: z.iso.datetime(),
  intervalSeconds: z.number().int().positive().max(31_536_000).optional(), enabled: z.boolean(), occurrence: z.number().int().nonnegative(),
});
export type EventSchedule = z.infer<typeof EventScheduleSchema>;

export type EventEvidenceType = "EVENT_ACCEPTED"|"EVENT_REJECTED"|"EVENT_AUTHENTICATED"|"EVENT_DEDUPLICATED"|"EVENT_ROUTED"|"EVENT_PROCESSING_STARTED"|"EVENT_PROCESSING_COMPLETED"|"EVENT_RETRY_SCHEDULED"|"EVENT_DEAD_LETTERED"|"EVENT_REPLAY_REQUESTED"|"EVENT_REPLAY_COMPLETED"|"EVENT_CANCELLED";
export type EventEvidence = {type:EventEvidenceType; eventId:string; consumerId?:string; code?:string; at:string};

export class EventSystemError extends Error { constructor(readonly code:string){super(code);this.name="EventSystemError";} }
