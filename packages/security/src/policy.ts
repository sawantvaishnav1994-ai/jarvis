import { createHash } from "node:crypto";
import { z } from "zod";
import {
    ActorSchema,
    ActorKindSchema,
    AssuranceSchema,
    DeviceTrustSchema,
} from "@jarvis/identity";
import {
    EnvironmentSchema,
    IdentifierSchema,
    TraceSchema,
} from "@jarvis/shared";
import { PermissionSchema } from "./permissions.js";

export const ModeSchema = z.enum([
    "assistant",
    "copilot",
    "autonomous",
    "focus",
    "private",
    "guest",
    "safe",
    "emergency",
]);
export const GovernedContextSchema = z
    .strictObject({
        version: z.literal(2),
        actor: ActorSchema,
        environment: EnvironmentSchema,
        requestId: IdentifierSchema,
        trace: TraceSchema,
        authority: z.strictObject({
            ownerId: IdentifierSchema,
            deviceId: IdentifierSchema,
            sessionId: IdentifierSchema,
            deviceTrust: DeviceTrustSchema,
            assurance: AssuranceSchema,
            verifiedAt: z.number().int().nonnegative(),
            expiresAt: z.number().int().positive(),
            scopes: z.array(IdentifierSchema).max(32),
            resources: z.array(IdentifierSchema).max(32),
        }),
    })
    .refine(
        (v) =>
            v.actor.environment === v.environment &&
            v.actor.ownerId === v.authority.ownerId &&
            (v.actor.kind !== "owner" || v.actor.id === v.authority.ownerId),
        "Authority binding mismatch",
    );
export type GovernedContext = z.infer<typeof GovernedContextSchema>;
export const ToolDescriptorSchema = z.strictObject({
    version: z.literal(2),
    id: IdentifierSchema,
    scope: IdentifierSchema,
    permission: PermissionSchema,
    effect: z.enum(["observe", "suggest", "prepare", "write"]),
    data: z.enum(["synthetic", "public", "private", "secret"]),
    external: z.boolean(),
    destructive: z.boolean(),
    securityChange: z.boolean(),
    financial: z.boolean(),
    physical: z.enum(["none", "low", "high"]),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;
const RuleSchema = z.strictObject({
    id: IdentifierSchema,
    effect: z.enum(["allow", "deny"]),
    actorKinds: z.array(ActorKindSchema).min(1).max(8),
    actorIds: z.array(IdentifierSchema).max(32).optional(),
    toolId: IdentifierSchema,
    scope: IdentifierSchema,
    resource: IdentifierSchema,
    permissions: z.array(PermissionSchema).min(1).max(6),
    modes: z.array(ModeSchema).min(1).max(8),
    minimumAssurance: AssuranceSchema,
    requireApproval: z.boolean(),
});
export const PolicyDocumentSchema = z
    .strictObject({
        version: z.literal(1),
        revision: IdentifierSchema,
        environment: EnvironmentSchema,
        rules: z.array(RuleSchema).max(128),
    })
    .refine(
        (v) => new Set(v.rules.map((r) => r.id)).size === v.rules.length,
        "Duplicate rule ID",
    );
export type PolicyDocument = z.infer<typeof PolicyDocumentSchema>;
export const ControlStateSchema = z.strictObject({
    version: z.literal(1),
    epoch: z.number().int().nonnegative(),
    mode: ModeSchema,
    paused: z.boolean(),
    frozen: z.boolean(),
    disconnected: z.boolean(),
    shutdown: z.boolean(),
    focusResource: IdentifierSchema.optional(),
    // External effects cannot be enabled in this foundation increment.
    allowExternalActions: z.literal(false),
});
export type ControlState = z.infer<typeof ControlStateSchema>;
export interface ControlStatePort {
    read(): ControlState;
}

/** Only JSON is accepted. Copy before freezing so callers retain their own objects. */
export function immutableJson<T>(value: T): T {
    const encoded = JSON.stringify(z.json().parse(value));
    if (encoded === undefined || Buffer.byteLength(encoded) > 100000)
        throw new Error("INVALID_JSON_SIZE");
    const copy = z.json().parse(JSON.parse(encoded)) as T;
    function freeze(v: unknown): void {
        if (v !== null && typeof v === "object") {
            Object.values(v).forEach(freeze);
            Object.freeze(v);
        }
    }
    freeze(copy);
    return copy;
}
/** Canonical JSON for internal versioned bindings; not a general signing standard. */
export function policyDigest(value: unknown): string {
    function sorted(v: unknown): unknown {
        if (Array.isArray(v)) return v.map(sorted);
        if (v !== null && typeof v === "object")
            return Object.fromEntries(
                Object.entries(v)
                    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                    .map(([k, x]) => [k, sorted(x)]),
            );
        return v;
    }
    return createHash("sha256")
        .update(JSON.stringify(sorted(immutableJson(value))))
        .digest("hex");
}
export type GovernedDecision = {
    allowed: boolean;
    requiresApproval: boolean;
    reason: string;
    risk: "low" | "sensitive" | "critical";
    policyRevision: string;
    policyHash: string;
    matchedRuleIds: string[];
};
export class DeterministicPolicy {
    private readonly document: PolicyDocument;
    readonly revision: string;
    readonly hash: string;
    constructor(document: unknown) {
        this.document = immutableJson(PolicyDocumentSchema.parse(document));
        this.revision = this.document.revision;
        this.hash = policyDigest(this.document);
        Object.freeze(this);
    }
    evaluate(
        descriptor: ToolDescriptor,
        resource: string,
        context: GovernedContext,
        controls: ControlState,
        now: number,
    ): GovernedDecision {
        const tool = ToolDescriptorSchema.parse(descriptor),
            ctx = GovernedContextSchema.parse(context);
        const state = ControlStateSchema.parse(controls),
            auth = ctx.authority;
        IdentifierSchema.parse(resource);
        const critical =
            tool.destructive ||
            tool.securityChange ||
            tool.financial ||
            tool.physical === "high" ||
            tool.permission === "P5";
        const sensitive =
            tool.data === "private" ||
            tool.data === "secret" ||
            tool.physical === "low" ||
            tool.permission === "P4";
        const risk = critical ? "critical" : sensitive ? "sensitive" : "low";
        const decision = (
            reason: string,
            allowed = false,
            requiresApproval = false,
            rules: string[] = [],
        ): GovernedDecision => ({
            allowed,
            requiresApproval,
            reason,
            risk,
            policyRevision: this.revision,
            policyHash: this.hash,
            matchedRuleIds: rules,
        });
        if (
            ctx.environment !== this.document.environment ||
            ctx.environment !== "development"
        )
            return decision("environment-denied");
        if (critical) return decision("critical-owner-ceremony-unavailable");
        const permission = Number(tool.permission[1]);
        const floor = Math.max(
            { observe: 0, suggest: 1, prepare: 2, write: 3 }[tool.effect],
            sensitive ? 4 : 0,
        );
        if (permission < floor) return decision("underclassified-tool");
        if (
            !Number.isSafeInteger(now) ||
            auth.verifiedAt > now ||
            auth.expiresAt <= now ||
            auth.expiresAt <= auth.verifiedAt ||
            auth.assurance === "A0" ||
            auth.assurance === "A4"
        )
            return decision("authentication-invalid");
        if (!["trusted", "privileged"].includes(auth.deviceTrust))
            return decision("device-trust-denied");
        if (
            !auth.scopes.includes(tool.scope) ||
            !auth.resources.includes(resource)
        )
            return decision("scope-or-resource-denied");
        if (
            state.shutdown ||
            state.frozen ||
            state.mode === "emergency" ||
            (state.paused && ctx.actor.kind !== "owner")
        )
            return decision("runtime-stopped");
        if (tool.external) return decision("external-actions-disabled");
        if (
            state.mode === "safe" &&
            (permission !== 0 || tool.effect !== "observe")
        )
            return decision("safe-mode-read-only");
        if (
            (state.mode === "assistant" || state.mode === "guest") &&
            permission > 1
        )
            return decision("mode-permission-denied");
        if (
            state.mode === "guest" &&
            tool.data !== "public" &&
            tool.data !== "synthetic"
        )
            return decision("guest-data-denied");
        if (state.mode === "focus" && state.focusResource !== resource)
            return decision("focus-resource-denied");
        const matches = this.document.rules.filter(
            (r) =>
                r.actorKinds.includes(ctx.actor.kind) &&
                (!r.actorIds || r.actorIds.includes(ctx.actor.id)) &&
                r.toolId === tool.id &&
                r.scope === tool.scope &&
                r.resource === resource &&
                r.permissions.includes(tool.permission) &&
                r.modes.includes(state.mode),
        );
        const ids = matches.map((r) => r.id).sort();
        if (matches.some((r) => r.effect === "deny"))
            return decision("explicit-deny", false, false, ids);
        if (!matches.length) return decision("default-deny");
        const minimum = Math.max(
            sensitive ? 3 : 1,
            ...matches.map((r) => Number(r.minimumAssurance[1])),
        );
        if (
            Number(auth.assurance[1]) < minimum ||
            (minimum >= 3 &&
                (now - auth.verifiedAt > 60000 ||
                    auth.deviceTrust !== "privileged"))
        )
            return decision("step-up-required", false, false, ids);
        const requiresApproval =
            sensitive ||
            matches.some((r) => r.requireApproval) ||
            (permission >= 2 && state.mode !== "autonomous");
        return decision("explicit-allow", true, requiresApproval, ids);
    }
}
export type ApprovalBindingV2 = {
    version: 2;
    ownerId: string;
    actorId: string;
    deviceId: string;
    sessionId: string;
    environment: string;
    requestId: string;
    toolId: string;
    resource: string;
    inputHash: string;
    descriptorHash: string;
    policyHash: string;
    policyRevision: string;
    controlHash: string;
    controlEpoch: number;
};
/** Implementations must atomically consume a short-lived, owner-authorized exact binding. */
export interface ApprovalAuthorityV2 {
    consume(proof: string, binding: ApprovalBindingV2): Promise<boolean>;
}
