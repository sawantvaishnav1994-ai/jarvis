import { z } from "zod";

export const ToolCategorySchema = z.enum(["READ","SEARCH","CREATE","UPDATE","DELETE","EXECUTE","COMMUNICATE","FINANCIAL","ADMINISTRATIVE","DEVICE","PHYSICAL","SECURITY","SYSTEM"]);
export const SideEffectClassSchema = z.enum(["READ_ONLY","REVERSIBLE_WRITE","MUTATING","DESTRUCTIVE","IRREVERSIBLE","CRITICAL"]);
export const ToolBoundarySchema = z.enum(["LOCAL_ONLY","PRIVATE_INFRA","EXTERNAL_SERVICE"]);
export const ToolHealthSchema = z.enum(["HEALTHY","DEGRADED","UNAVAILABLE","DISABLED","UNKNOWN"]);
export const ToolModeSchema = z.enum(["INSPECT","SIMULATE","DRY_RUN","EXECUTE","VERIFY_ONLY","RECONCILE"]);
export const ToolSourceSchema = z.enum(["USER","MODEL","AGENT","WORKFLOW","SYSTEM"]);
export const ToolStateSchema = z.enum(["REQUESTED","VALIDATED","AUTHORIZED","SIMULATED","APPROVAL_REQUIRED","APPROVED","DISPATCHING","RUNNING","SUCCEEDED","FAILED","CANCEL_REQUESTED","CANCELLED","TIMED_OUT","UNKNOWN_OUTCOME","VERIFYING","VERIFIED","RECONCILING","RECONCILED","ROLLED_BACK"]);
export const ToolErrorCodeSchema = z.enum(["TOOL_NOT_FOUND","TOOL_DISABLED","INVALID_INPUT","CAPABILITY_DENIED","AUTHORIZATION_INVALID","AUTHORIZATION_EXPIRED","APPROVAL_REQUIRED","APPROVAL_MISMATCH","PRIVACY_DENIED","EMERGENCY_STOP","CREDENTIAL_UNAVAILABLE","TOOL_UNAVAILABLE","TIMEOUT","CANCELLED","UNKNOWN_OUTCOME","RATE_LIMITED","RETRY_EXHAUSTED","INVALID_OUTPUT","VERIFICATION_FAILED","RECONCILIATION_FAILED","IDEMPOTENCY_CONFLICT","INTERNAL_GATEWAY_ERROR"]);
export const DataClassificationSchema = z.enum(["D0","D1","D2","D3","D4","D5"]);

export const ToolOperationSchema = z.strictObject({
  operation: z.string().min(1).max(80),
  capability: z.string().min(1).max(120),
  sideEffectClass: SideEffectClassSchema,
  supportsDryRun: z.boolean(),
  supportsIdempotency: z.boolean(),
  supportsCancellation: z.boolean(),
  supportsVerification: z.boolean(),
  rollback: z.enum(["NONE","COMPENSATING_ACTION","NATIVE_ROLLBACK","TRANSACTIONAL"]),
  maxAttempts: z.number().int().min(1).max(5),
  timeoutMs: z.number().int().min(1).max(120000),
});
export type ToolOperation = z.infer<typeof ToolOperationSchema>;

export const ToolDefinitionMetadataSchema = z.strictObject({
  toolId: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/),
  version: z.number().int().positive(),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  category: ToolCategorySchema,
  operations: z.array(ToolOperationSchema).min(1).max(40),
  boundary: ToolBoundarySchema,
  allowedClassifications: z.array(DataClassificationSchema).min(1),
  credentialRequirements: z.array(z.string().min(1).max(120)).max(20),
  networkRequired: z.boolean(),
  health: ToolHealthSchema,
});
export type ToolDefinitionMetadata = z.infer<typeof ToolDefinitionMetadataSchema>;

export const ToolActorSchema = z.strictObject({ ownerId: z.string().min(1), actorId: z.string().min(1), role: z.enum(["OWNER","DELEGATE","SERVICE","AGENT","SYSTEM"]) });
export const ToolRequestSchema = z.strictObject({
  requestId: z.string().min(1), correlationId: z.string().min(1), actor: ToolActorSchema,
  projectId: z.string().min(1).nullable().default(null), source: ToolSourceSchema,
  toolId: z.string().min(1), toolVersion: z.number().int().positive(), operation: z.string().min(1),
  input: z.unknown(), resource: z.string().min(1), privacyClass: DataClassificationSchema,
  requestedMode: ToolModeSchema, idempotencyKey: z.string().min(1).max(200).optional(),
  deadlineEpochMs: z.number().int().positive(), authorizationReference: z.string().min(1).optional(),
  approvalReference: z.string().min(1).optional(), inputHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  metadata: z.record(z.string(), z.string()).default({}),
});
export type ToolRequest = z.infer<typeof ToolRequestSchema>;

export const AuthorizationDecisionSchema = z.strictObject({
  allowed: z.boolean(), authorizationReference: z.string().min(1).optional(), approvalReference: z.string().min(1).optional(),
  bindingHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), capability: z.string().min(1), resource: z.string().min(1),
  expiresAt: z.number().int().positive(), emergencyEpoch: z.number().int().nonnegative(), reason: z.string().min(1),
});
export type AuthorizationDecision = z.infer<typeof AuthorizationDecisionSchema>;

export const ToolResultSchema = z.strictObject({
  executionId: z.string().min(1), requestId: z.string().min(1), toolId: z.string().min(1), toolVersion: z.number().int().positive(), operation: z.string().min(1),
  status: ToolStateSchema, startedAt: z.string().datetime(), finishedAt: z.string().datetime(), output: z.unknown().optional(),
  externalReferences: z.array(z.string()).default([]), sideEffects: z.array(z.string()).default([]), verified: z.boolean(),
  attemptCount: z.number().int().nonnegative(), costMinor: z.number().int().nonnegative().default(0),
  provenance: z.literal("UNTRUSTED_EXTERNAL_DATA"), warnings: z.array(z.string()).default([]), error: ToolErrorCodeSchema.optional(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ToolAuditEventSchema = z.strictObject({
  event: z.enum(["TOOL_REQUESTED","TOOL_VALIDATION_FAILED","TOOL_AUTHORIZATION_DENIED","TOOL_SIMULATED","TOOL_DISPATCHED","TOOL_SUCCEEDED","TOOL_FAILED","TOOL_TIMED_OUT","TOOL_UNKNOWN_OUTCOME","TOOL_CANCEL_REQUESTED","TOOL_CANCELLED","TOOL_VERIFIED","TOOL_RECONCILED"]),
  requestId: z.string(), executionId: z.string().optional(), actorId: z.string(), toolId: z.string(), toolVersion: z.number().int(), operation: z.string(),
  resourceHash: z.string().regex(/^[a-f0-9]{64}$/), inputHash: z.string().regex(/^[a-f0-9]{64}$/), authorizationReference: z.string().optional(),
  approvalReference: z.string().optional(), state: ToolStateSchema, reason: z.string(), timestamp: z.string().datetime(),
});
export type ToolAuditEvent = z.infer<typeof ToolAuditEventSchema>;

export interface CredentialLease { readonly handle: string; readonly expiresAt: number; use<T>(consumer: (secret: string) => Promise<T>): Promise<T>; }
export interface CredentialBroker { lease(requirements: readonly string[], request: ToolRequest): Promise<CredentialLease | undefined>; }
export interface ToolAuthorizationPort {
  authorize(request: ToolRequest, operation: ToolOperation, inputHash: string): Promise<AuthorizationDecision>;
  revalidate(request: ToolRequest, decision: AuthorizationDecision, inputHash: string): Promise<boolean>;
}
export interface ToolAuditSink { append(event: ToolAuditEvent): Promise<void>; }
export interface ToolAdapterContext { request: ToolRequest; signal: AbortSignal; credential?: CredentialLease | undefined; }
export interface ToolAdapter<I = unknown, O = unknown> {
  execute(input: I, context: ToolAdapterContext): Promise<O>;
  simulate?(input: I, context: ToolAdapterContext): Promise<unknown>;
  dryRun?(input: I, context: ToolAdapterContext): Promise<unknown>;
  verify?(input: I, output: O, context: ToolAdapterContext): Promise<boolean>;
  reconcile?(input: I, context: ToolAdapterContext): Promise<{ occurred: boolean; output?: O }>;
}
export interface J07ToolDefinition<I = unknown, O = unknown> { metadata: ToolDefinitionMetadata; inputSchema: z.ZodType<I>; outputSchema: z.ZodType<O>; adapter: ToolAdapter<I, O>; }
