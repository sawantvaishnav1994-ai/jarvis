import { randomUUID } from "node:crypto";
import { BoundaryError, IdentifierSchema } from "@jarvis/shared";
import {
    GovernedContextSchema,
    ToolDescriptorSchema,
    ControlStateSchema,
    immutableJson,
    policyDigest,
    DeterministicPolicy,
    type GovernedContext,
    type ToolDescriptor,
    type ControlStatePort,
    type ApprovalAuthorityV2,
} from "@jarvis/security";
import type { PolicyAuditRecord, PolicyAuditSink } from "@jarvis/audit";

export interface GovernedTool<Input = unknown, Output = unknown> {
    descriptor: ToolDescriptor;
    validate(input: unknown): Input;
    resource(input: Input): string;
    execute(
        input: Input,
        context: GovernedContext,
        signal: AbortSignal,
    ): Promise<Output>;
    verify(output: Output): boolean;
}
/** Trusted composition registers tools, not requests. No arbitrary handler is accepted by invoke. */
export class GovernedToolGateway {
    private readonly tools = new Map<string, GovernedTool>();
    constructor(
        registered: GovernedTool[],
        private readonly policy: DeterministicPolicy,
        private readonly controls: ControlStatePort,
        private readonly approvals: ApprovalAuthorityV2,
        private readonly audit: PolicyAuditSink,
        private readonly clock: () => number = Date.now,
    ) {
        for (const tool of registered) {
            const descriptor = immutableJson(
                ToolDescriptorSchema.parse(tool.descriptor),
            );
            if (this.tools.has(descriptor.id))
                throw new BoundaryError("DUPLICATE_TOOL");
            this.tools.set(
                descriptor.id,
                Object.freeze({
                    descriptor,
                    validate: tool.validate.bind(tool),
                    resource: tool.resource.bind(tool),
                    execute: tool.execute.bind(tool),
                    verify: tool.verify.bind(tool),
                }),
            );
        }
    }
    async invoke(
        toolId: string,
        input: unknown,
        context: GovernedContext,
        signal: AbortSignal,
        proof?: string,
    ): Promise<unknown> {
        const tool = this.tools.get(toolId);
        if (!tool) throw new BoundaryError("UNKNOWN_TOOL");
        const ctx = immutableJson(GovernedContextSchema.parse(context));
        const value = immutableJson(tool.validate(immutableJson(input)));
        const resource = IdentifierSchema.parse(tool.resource(value));
        const inputHash = policyDigest(value);
        const controls = immutableJson(
            ControlStateSchema.parse(this.controls.read()),
        );
        const controlHash = policyDigest(controls);
        const decision = this.policy.evaluate(
            tool.descriptor,
            resource,
            ctx,
            controls,
            this.clock(),
        );
        let approval: PolicyAuditRecord["approval"] = "not-required";
        const record = async (
            result: PolicyAuditRecord["result"],
            reason: string,
        ) =>
            this.audit.append({
                version: 2,
                id: randomUUID(),
                actor: ctx.actor,
                environment: ctx.environment,
                requestId: ctx.requestId,
                operation: "tool.invoke",
                toolId,
                permission: tool.descriptor.permission,
                inputHash,
                resourceHash: policyDigest(resource),
                policyHash: decision.policyHash,
                policyRevision: decision.policyRevision,
                controlEpoch: controls.epoch,
                risk: decision.risk,
                matchedRuleIds: decision.matchedRuleIds,
                timestamp: new Date(this.clock()).toISOString(),
                approval,
                result,
                reason,
            });
        const deny = async (reason: string): Promise<never> => {
            approval = "denied";
            await record("denied", reason);
            throw new BoundaryError("TOOL_DENIED");
        };
        // No effect may happen unless both request and authorization are durably recorded.
        await record("requested", decision.reason);
        if (!decision.allowed || signal.aborted)
            return deny(signal.aborted ? "cancelled" : decision.reason);
        if (decision.requiresApproval) {
            const accepted =
                proof !== undefined &&
                (await this.approvals.consume(
                    proof,
                    immutableJson({
                        version: 2 as const,
                        ownerId: ctx.authority.ownerId,
                        actorId: ctx.actor.id,
                        deviceId: ctx.authority.deviceId,
                        sessionId: ctx.authority.sessionId,
                        environment: ctx.environment,
                        requestId: ctx.requestId,
                        toolId,
                        resource,
                        inputHash,
                        descriptorHash: policyDigest(tool.descriptor),
                        policyHash: decision.policyHash,
                        policyRevision: decision.policyRevision,
                        controlHash,
                        controlEpoch: controls.epoch,
                    }),
                ));
            if (!accepted) return deny("approval-required");
            approval = "approved";
        }
        const stillAllowed = () => {
            const current = ControlStateSchema.parse(this.controls.read());
            return (
                !signal.aborted &&
                policyDigest(current) === controlHash &&
                this.policy.evaluate(
                    tool.descriptor,
                    resource,
                    ctx,
                    current,
                    this.clock(),
                ).allowed
            );
        };
        if (!stillAllowed()) return deny("authority-or-controls-changed");
        await record("authorized", decision.reason);
        // Recheck after the final asynchronous operation before execute.
        if (!stillAllowed()) return deny("authority-or-controls-changed");
        let output: unknown;
        try {
            output = immutableJson(await tool.execute(value, ctx, signal));
            if (!stillAllowed() || !tool.verify(output))
                throw new BoundaryError("TOOL_VERIFICATION_FAILED");
        } catch {
            await record("failed", "execution-or-verification-failed");
            throw new BoundaryError("TOOL_FAILED");
        }
        // If this append fails, the effect may have happened. Never report success or retry it here.
        await record("success", "verified-success");
        if (!stillAllowed()) return deny("authority-or-controls-changed");
        return output;
    }
}
