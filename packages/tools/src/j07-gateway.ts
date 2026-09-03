import { createHash, randomUUID } from "node:crypto";
import { BoundaryError } from "@jarvis/shared";
import {
  AuthorizationDecisionSchema, ToolAuditEventSchema, ToolRequestSchema, ToolResultSchema,
  type AuthorizationDecision, type CredentialBroker, type J07ToolDefinition, type ToolAdapterContext,
  type ToolAuditEvent, type ToolAuditSink, type ToolOperation, type ToolRequest, type ToolResult,
} from "./j07-contracts.js";
import { UniversalToolRegistry } from "./j07-registry.js";
import type { ToolAuthorizationPort } from "./j07-contracts.js";

const stable = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(k => `${JSON.stringify(k)}:${stable(object[k])}`).join(",")}}`;
};
const digest = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex");
const mutating = (op: ToolOperation) => op.sideEffectClass !== "READ_ONLY";

export class ToolExecutionError extends Error {
  constructor(public readonly code: string, public readonly outcomeMayHaveChanged = false) { super(code); }
}

export class MemoryToolExecutionStore {
  private readonly byIdempotency = new Map<string, { hash: string; result?: ToolResult }>();
  get(key: string) { return this.byIdempotency.get(key); }
  reserve(key: string, hash: string): void {
    const existing = this.byIdempotency.get(key);
    if (existing && existing.hash !== hash) throw new BoundaryError("IDEMPOTENCY_CONFLICT");
    if (!existing) this.byIdempotency.set(key, { hash });
  }
  complete(key: string, hash: string, result: ToolResult): void { this.byIdempotency.set(key, { hash, result }); }
}

export class UniversalToolGateway {
  constructor(
    private readonly registry: UniversalToolRegistry,
    private readonly authorization: ToolAuthorizationPort,
    private readonly credentials: CredentialBroker,
    private readonly audit: ToolAuditSink,
    private readonly store = new MemoryToolExecutionStore(),
    private readonly clock: () => number = Date.now,
  ) {}

  private operation(definition: J07ToolDefinition, request: ToolRequest): ToolOperation {
    const operation = definition.metadata.operations.find(o => o.operation === request.operation);
    if (!operation) throw new BoundaryError("TOOL_NOT_FOUND");
    return operation;
  }
  private async emit(request: ToolRequest, inputHash: string, state: ToolAuditEvent["state"], event: ToolAuditEvent["event"], reason: string, decision?: AuthorizationDecision, executionId?: string) {
    await this.audit.append(ToolAuditEventSchema.parse({ event, requestId: request.requestId, executionId, actorId: request.actor.actorId, toolId: request.toolId, toolVersion: request.toolVersion, operation: request.operation, resourceHash: digest(request.resource), inputHash, authorizationReference: decision?.authorizationReference, approvalReference: decision?.approvalReference, state, reason, timestamp: new Date(this.clock()).toISOString() }));
  }
  private privacy(definition: J07ToolDefinition, request: ToolRequest): void {
    if (!definition.metadata.allowedClassifications.includes(request.privacyClass)) throw new BoundaryError("PRIVACY_DENIED");
    if (definition.metadata.boundary !== "LOCAL_ONLY" && request.privacyClass === "D5") throw new BoundaryError("PRIVACY_DENIED");
    if (definition.metadata.boundary === "EXTERNAL_SERVICE" && request.metadata.externalAllowed !== "true") throw new BoundaryError("PRIVACY_DENIED");
  }

  async invoke(raw: ToolRequest, outerSignal: AbortSignal = new AbortController().signal): Promise<ToolResult> {
    const request = ToolRequestSchema.parse(raw);
    const definition = this.registry.get(request.toolId, request.toolVersion);
    const operation = this.operation(definition, request);
    let input: unknown;
    try { input = definition.inputSchema.parse(request.input); } catch { throw new BoundaryError("INVALID_INPUT"); }
    const inputHash = digest({ toolId: request.toolId, toolVersion: request.toolVersion, operation: request.operation, resource: request.resource, input });
    if (request.inputHash && request.inputHash !== inputHash) throw new BoundaryError("AUTHORIZATION_INVALID");
    this.privacy(definition, request);
    await this.emit(request, inputHash, "REQUESTED", "TOOL_REQUESTED", "validated-request");

    if (request.requestedMode === "INSPECT") return ToolResultSchema.parse({ executionId: randomUUID(), requestId: request.requestId, toolId: request.toolId, toolVersion: request.toolVersion, operation: request.operation, status: "VALIDATED", startedAt: new Date(this.clock()).toISOString(), finishedAt: new Date(this.clock()).toISOString(), output: { metadata: definition.metadata }, externalReferences: [], sideEffects: [], verified: false, attemptCount: 0, costMinor: 0, provenance: "UNTRUSTED_EXTERNAL_DATA", warnings: [] });

    let decision: AuthorizationDecision;
    try { decision = AuthorizationDecisionSchema.parse(await this.authorization.authorize(request, operation, inputHash)); }
    catch { await this.emit(request, inputHash, "FAILED", "TOOL_AUTHORIZATION_DENIED", "authorization-invalid"); throw new BoundaryError("AUTHORIZATION_INVALID"); }
    if (!decision.allowed || decision.bindingHash !== inputHash || decision.resource !== request.resource || decision.capability !== operation.capability || decision.expiresAt <= this.clock()) {
      await this.emit(request, inputHash, "FAILED", "TOOL_AUTHORIZATION_DENIED", "authorization-denied", decision); throw new BoundaryError("AUTHORIZATION_INVALID");
    }
    if (request.authorizationReference && request.authorizationReference !== decision.authorizationReference) throw new BoundaryError("AUTHORIZATION_INVALID");
    if (request.approvalReference && request.approvalReference !== decision.approvalReference) throw new BoundaryError("APPROVAL_MISMATCH");

    const executionId = randomUUID();
    const startedAt = new Date(this.clock()).toISOString();
    const controller = new AbortController();
    const abort = () => controller.abort();
    outerSignal.addEventListener("abort", abort, { once: true });
    const remaining = Math.min(operation.timeoutMs, request.deadlineEpochMs - this.clock());
    if (remaining <= 0) throw new BoundaryError("TIMEOUT");
    const timer = setTimeout(() => controller.abort(), remaining);
    const contextBase = { request, signal: controller.signal };
    try {
      if (request.requestedMode === "SIMULATE" || request.requestedMode === "DRY_RUN") {
        const fn = request.requestedMode === "DRY_RUN" ? definition.adapter.dryRun : definition.adapter.simulate;
        if (!fn) throw new BoundaryError("TOOL_UNAVAILABLE");
        const output = await fn.call(definition.adapter, input, contextBase);
        await this.emit(request, inputHash, "SIMULATED", "TOOL_SIMULATED", request.requestedMode.toLowerCase(), decision, executionId);
        return ToolResultSchema.parse({ executionId, requestId: request.requestId, toolId: request.toolId, toolVersion: request.toolVersion, operation: request.operation, status: "SIMULATED", startedAt, finishedAt: new Date(this.clock()).toISOString(), output, externalReferences: [], sideEffects: [], verified: false, attemptCount: 0, costMinor: 0, provenance: "UNTRUSTED_EXTERNAL_DATA", warnings: ["simulation-is-not-execution-authorization"] });
      }
      if (request.requestedMode === "VERIFY_ONLY") throw new BoundaryError("VERIFICATION_FAILED");
      if (request.requestedMode === "RECONCILE") {
        if (!definition.adapter.reconcile) throw new BoundaryError("RECONCILIATION_FAILED");
        const reconciliation = await definition.adapter.reconcile(input, contextBase);
        await this.emit(request, inputHash, "RECONCILED", "TOOL_RECONCILED", reconciliation.occurred ? "occurred" : "not-observed", decision, executionId);
        return ToolResultSchema.parse({ executionId, requestId: request.requestId, toolId: request.toolId, toolVersion: request.toolVersion, operation: request.operation, status: "RECONCILED", startedAt, finishedAt: new Date(this.clock()).toISOString(), output: reconciliation.output, externalReferences: [], sideEffects: reconciliation.occurred ? ["reconciled-effect"] : [], verified: reconciliation.occurred, attemptCount: 0, costMinor: 0, provenance: "UNTRUSTED_EXTERNAL_DATA", warnings: [] });
      }

      if (!(await this.authorization.revalidate(request, decision, inputHash))) throw new BoundaryError("EMERGENCY_STOP");
      if (outerSignal.aborted) throw new BoundaryError("CANCELLED");
      if (mutating(operation) && !request.idempotencyKey) throw new BoundaryError("IDEMPOTENCY_CONFLICT");
      if (request.idempotencyKey) {
        const existing = this.store.get(request.idempotencyKey);
        if (existing && existing.hash !== inputHash) throw new BoundaryError("IDEMPOTENCY_CONFLICT");
        if (existing?.result) return existing.result;
        this.store.reserve(request.idempotencyKey, inputHash);
      }
      const credential = definition.metadata.credentialRequirements.length ? await this.credentials.lease(definition.metadata.credentialRequirements, request) : undefined;
      if (definition.metadata.credentialRequirements.length && !credential) throw new BoundaryError("CREDENTIAL_UNAVAILABLE");
      if (!(await this.authorization.revalidate(request, decision, inputHash))) throw new BoundaryError("EMERGENCY_STOP");
      await this.emit(request, inputHash, "DISPATCHING", "TOOL_DISPATCHED", "pre-dispatch-authorized", decision, executionId);

      let attempt = 0; let output: unknown; let ambiguous = false;
      const retrySafe = operation.sideEffectClass === "READ_ONLY" || operation.supportsIdempotency;
      while (attempt < operation.maxAttempts) {
        attempt += 1;
        try {
          const context: ToolAdapterContext = { request, signal: controller.signal, credential };
          output = await definition.adapter.execute(input, context);
          break;
        } catch (error) {
          const changed = error instanceof ToolExecutionError && error.outcomeMayHaveChanged;
          ambiguous ||= changed;
          if (controller.signal.aborted || changed || !retrySafe || attempt >= operation.maxAttempts) break;
        }
      }
      if (output === undefined) {
        if (ambiguous && mutating(operation)) {
          await this.emit(request, inputHash, "UNKNOWN_OUTCOME", "TOOL_UNKNOWN_OUTCOME", "mutation-may-have-occurred", decision, executionId);
          if (definition.adapter.reconcile) {
            const reconciliation = await definition.adapter.reconcile(input, { request, signal: controller.signal, credential });
            await this.emit(request, inputHash, "RECONCILED", "TOOL_RECONCILED", reconciliation.occurred ? "occurred" : "not-observed", decision, executionId);
            const result = ToolResultSchema.parse({ executionId, requestId: request.requestId, toolId: request.toolId, toolVersion: request.toolVersion, operation: request.operation, status: "RECONCILED", startedAt, finishedAt: new Date(this.clock()).toISOString(), output: reconciliation.output, externalReferences: [], sideEffects: reconciliation.occurred ? ["reconciled-effect"] : [], verified: reconciliation.occurred, attemptCount: attempt, costMinor: 0, provenance: "UNTRUSTED_EXTERNAL_DATA", warnings: ["unknown-outcome-reconciled"] });
            if (request.idempotencyKey) this.store.complete(request.idempotencyKey, inputHash, result);
            return result;
          }
          throw new BoundaryError("UNKNOWN_OUTCOME");
        }
        if (controller.signal.aborted) { await this.emit(request, inputHash, mutating(operation) ? "UNKNOWN_OUTCOME" : "CANCELLED", mutating(operation) ? "TOOL_UNKNOWN_OUTCOME" : "TOOL_CANCELLED", "deadline-or-cancel", decision, executionId); throw new BoundaryError(mutating(operation) ? "UNKNOWN_OUTCOME" : "CANCELLED"); }
        await this.emit(request, inputHash, "FAILED", "TOOL_FAILED", "retry-exhausted", decision, executionId); throw new BoundaryError("RETRY_EXHAUSTED");
      }
      let parsed: unknown;
      try { parsed = definition.outputSchema.parse(output); } catch { throw new BoundaryError("INVALID_OUTPUT"); }
      let verified = false;
      if (operation.supportsVerification && definition.adapter.verify) verified = await definition.adapter.verify(input, parsed, { request, signal: controller.signal, credential });
      if (operation.supportsVerification && !verified) throw new BoundaryError("VERIFICATION_FAILED");
      if (verified) await this.emit(request, inputHash, "VERIFIED", "TOOL_VERIFIED", "independently-verified", decision, executionId);
      const result = ToolResultSchema.parse({ executionId, requestId: request.requestId, toolId: request.toolId, toolVersion: request.toolVersion, operation: request.operation, status: verified ? "VERIFIED" : "SUCCEEDED", startedAt, finishedAt: new Date(this.clock()).toISOString(), output: parsed, externalReferences: [], sideEffects: mutating(operation) ? ["synthetic-effect"] : [], verified, attemptCount: attempt, costMinor: 0, provenance: "UNTRUSTED_EXTERNAL_DATA", warnings: [] });
      if (request.idempotencyKey) this.store.complete(request.idempotencyKey, inputHash, result);
      await this.emit(request, inputHash, result.status, "TOOL_SUCCEEDED", verified ? "verified-success" : "success", decision, executionId);
      return result;
    } catch (error) {
      if (error instanceof BoundaryError) throw error;
      await this.emit(request, inputHash, "FAILED", "TOOL_FAILED", "gateway-failure", decision, executionId);
      throw new BoundaryError("INTERNAL_GATEWAY_ERROR");
    } finally { clearTimeout(timer); outerSignal.removeEventListener("abort", abort); }
  }
}

export { digest as toolInputDigest };
