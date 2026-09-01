import { createHash, randomUUID } from "node:crypto";
import { BoundaryError } from "@jarvis/shared";
import {
    ExecutionContextSchema,
    type ExecutionContext,
    type Permission,
    type PolicyEngine,
    type ApprovalService,
} from "@jarvis/security";
import type { AuditSink, AuditRecord } from "@jarvis/audit";
export interface JarvisTool<Input = unknown, Output = unknown> {
    readonly version: 1;
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly requiredPermission: Permission;
    readonly scope: string;
    readonly risk: "low" | "sensitive" | "critical";
    validate(input: unknown): Input;
    execute(
        input: Input,
        context: ExecutionContext,
        signal: AbortSignal,
    ): Promise<Output>;
    verify(result: Output): boolean;
}
export class ToolGateway {
    constructor(
        private readonly policy: PolicyEngine,
        private readonly approvals: ApprovalService,
        private readonly audit: AuditSink,
    ) {}
    async invoke<I, O>(
        tool: JarvisTool<I, O>,
        input: unknown,
        context: ExecutionContext,
        signal: AbortSignal,
        approval?: string,
    ): Promise<O> {
        context = ExecutionContextSchema.parse(context);
        const value = tool.validate(input);
        const encoded = JSON.stringify(value);
        if (encoded === undefined || encoded.length > 100000)
            throw new BoundaryError("INVALID_TOOL_INPUT");
        const inputHash = createHash("sha256").update(encoded).digest("hex");
        const base = {
            version: 1 as const,
            actor: context.actor,
            environment: context.environment,
            requestId: context.requestId,
            operation: "tool.invoke",
            toolId: tool.id,
            permission: tool.requiredPermission,
            inputHash,
        };
        const record = async (
            result: AuditRecord["result"],
            status: AuditRecord["approval"],
        ) =>
            this.audit.append({
                ...base,
                id: randomUUID(),
                timestamp: new Date().toISOString(),
                result,
                approval: status,
            });
        await record("requested", "not-required");
        const decision = await this.policy.evaluate(
            {
                toolId: tool.id,
                permission: tool.requiredPermission,
                scope: tool.scope,
                risk: tool.risk,
            },
            context,
        );
        if (!decision.allowed || signal.aborted) {
            await record("denied", "denied");
            throw new BoundaryError("TOOL_DENIED");
        }
        const approved =
            !decision.requiresApproval ||
            (approval !== undefined &&
                (await this.approvals.consume(approval, {
                    actorId: context.actor.id,
                    requestId: context.requestId,
                    toolId: tool.id,
                    inputHash,
                })));
        if (!approved) {
            await record("denied", "denied");
            throw new BoundaryError("APPROVAL_REQUIRED");
        }
        const approvalStatus = decision.requiresApproval
            ? "approved"
            : "not-required";
        try {
            if (signal.aborted) throw new BoundaryError("TOOL_CANCELLED");
            const result = await tool.execute(value, context, signal);
            if (signal.aborted || !tool.verify(result))
                throw new BoundaryError("TOOL_VERIFICATION_FAILED");
            await record("success", approvalStatus);
            return result;
        } catch {
            await record("failed", approvalStatus);
            throw new BoundaryError("TOOL_FAILED");
        }
    }
}
