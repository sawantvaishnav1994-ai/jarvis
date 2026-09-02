import { z } from "zod";
import { ActorSchema } from "@jarvis/identity";
import {
    ContractVersionSchema,
    EnvironmentSchema,
    IdentifierSchema,
    TraceSchema,
} from "@jarvis/shared";
import type { Permission } from "./permissions.js";
export { PermissionSchema, type Permission } from "./permissions.js";
export const ExecutionContextSchema = z
    .strictObject({
        version: ContractVersionSchema,
        actor: ActorSchema,
        environment: EnvironmentSchema,
        requestId: IdentifierSchema,
        grantedScopes: z.array(IdentifierSchema).max(32),
        trace: TraceSchema,
    })
    .refine(
        (v) => v.actor.environment === v.environment,
        "Actor environment mismatch",
    );
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
export type PolicyDecision = {
    allowed: boolean;
    requiresApproval: boolean;
    reason: string;
};
export interface PolicyEngine {
    evaluate(
        action: {
            toolId: string;
            permission: Permission;
            scope: string;
            risk: "low" | "sensitive" | "critical";
        },
        context: ExecutionContext,
    ): Promise<PolicyDecision>;
}
export interface ApprovalService {
    consume(
        proof: string,
        binding: {
            actorId: string;
            requestId: string;
            toolId: string;
            inputHash: string;
        },
    ): Promise<boolean>;
}
/** Legacy v1 reference policy. The active API uses DeterministicPolicy and v2 contexts. */
export class FoundationPolicy implements PolicyEngine {
    async evaluate(
        action: {
            permission: Permission;
            scope: string;
            risk: "low" | "sensitive" | "critical";
        },
        context: ExecutionContext,
    ): Promise<PolicyDecision> {
        ExecutionContextSchema.parse(context);
        const allowed =
            context.environment === "development" &&
            context.actor.kind === "owner" &&
            context.grantedScopes.includes(action.scope) &&
            action.risk === "low" &&
            ["P0", "P1", "P2", "P3"].includes(action.permission);
        return {
            allowed,
            requiresApproval: action.permission !== "P0",
            reason: allowed ? "explicit-owner-scope" : "default-deny",
        };
    }
}
export * from "./secrets.js";
export * from "./policy.js";
export * from "./governance-contracts.js";
export * from "./governance-policy.js";
export * from "./governance.js";
