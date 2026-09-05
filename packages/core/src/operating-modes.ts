import type {
    ContextAssemblyAuthority,
    ContextOperatingMode,
} from "./context-assembly.js";

export const j19OperatingModes = [
    "assistant",
    "copilot",
    "autonomous",
    "focus",
    "private",
    "guest",
    "safe",
    "emergency",
] as const satisfies readonly ContextOperatingMode[];

export const j19EmergencyControls = [
    "NONE",
    "PAUSE",
    "FREEZE",
    "DISCONNECT",
    "SAFE_MODE",
    "REVOKE",
    "SHUTDOWN",
] as const;

export type J19EmergencyControl = (typeof j19EmergencyControls)[number];
export type J19ActionKind =
    | "MODEL"
    | "TOOL_READ"
    | "TOOL_MUTATION"
    | "APPROVAL_REQUEST"
    | "NETWORK"
    | "BACKGROUND";

export interface J19ModeSnapshot {
    ownerId: string;
    projectId?: string | null;
    conversationId: string;
    sessionId: string;
    turnId: string;
    securityEpoch: number;
    mode: ContextOperatingMode;
    emergencyControl: J19EmergencyControl;
    issuedAtEpochMs: number;
    expiresAtEpochMs?: number | null;
    revoked: boolean;
    provenance: "J0_FOUNDATION";
}

export interface J19AutonomyEnvelope {
    ownerId: string;
    projectId?: string | null;
    conversationId: string;
    sessionId: string;
    securityEpoch: number;
    expiresAtEpochMs: number;
    allowedActions: readonly J19ActionKind[];
    maxCostMinor: number;
    externalAllowed: boolean;
    revoked: boolean;
    provenance: "J0_AUTHORITY";
}

export interface J19ModeAuthorityPort {
    resolve(authority: ContextAssemblyAuthority): Promise<J19ModeSnapshot>;
    resolveAutonomyEnvelope(
        authority: ContextAssemblyAuthority,
    ): Promise<J19AutonomyEnvelope | null>;
}

export interface J19EvaluationInput {
    authority: ContextAssemblyAuthority;
    action: J19ActionKind;
    costMinor?: number;
    external?: boolean;
    mutating?: boolean;
}

export interface J19EvaluationResult {
    allowed: boolean;
    effectiveMode: ContextOperatingMode;
    emergencyControl: J19EmergencyControl;
    reason:
        | "ALLOWED"
        | "MODE_BINDING_INVALID"
        | "MODE_EXPIRED"
        | "MODE_REVOKED"
        | "MODE_MISMATCH"
        | "EMERGENCY_PAUSED"
        | "EMERGENCY_FROZEN"
        | "EMERGENCY_DISCONNECTED"
        | "EMERGENCY_SAFE_MODE"
        | "EMERGENCY_REVOKED"
        | "EMERGENCY_SHUTDOWN"
        | "GUEST_PRIVILEGE_DENIED"
        | "SAFE_MUTATION_DENIED"
        | "EMERGENCY_POLICY_ONLY"
        | "AUTONOMY_ENVELOPE_REQUIRED"
        | "AUTONOMY_ENVELOPE_INVALID"
        | "AUTONOMY_SCOPE_DENIED"
        | "AUTONOMY_COST_DENIED"
        | "AUTONOMY_EXTERNAL_DENIED";
}

export class J19OperatingModeError extends Error {
    constructor(readonly code: string) {
        super(code);
        this.name = "J19OperatingModeError";
    }
}

function sameProject(a?: string | null, b?: string | null): boolean {
    return (a ?? null) === (b ?? null);
}

function bindingValid(
    snapshot: J19ModeSnapshot,
    authority: ContextAssemblyAuthority,
): boolean {
    return (
        snapshot.ownerId === authority.ownerId &&
        sameProject(snapshot.projectId, authority.projectId) &&
        snapshot.conversationId === authority.conversationId &&
        snapshot.sessionId === authority.sessionId &&
        snapshot.turnId === authority.turnId &&
        snapshot.securityEpoch === authority.securityEpoch &&
        snapshot.provenance === "J0_FOUNDATION"
    );
}

function envelopeValid(
    envelope: J19AutonomyEnvelope,
    authority: ContextAssemblyAuthority,
    now: number,
): boolean {
    return (
        envelope.ownerId === authority.ownerId &&
        sameProject(envelope.projectId, authority.projectId) &&
        envelope.conversationId === authority.conversationId &&
        envelope.sessionId === authority.sessionId &&
        envelope.securityEpoch === authority.securityEpoch &&
        envelope.provenance === "J0_AUTHORITY" &&
        !envelope.revoked &&
        envelope.expiresAtEpochMs > now
    );
}

export class J19OperatingModeCoordinator {
    constructor(
        private readonly modes: J19ModeAuthorityPort,
        private readonly clock: () => number = Date.now,
    ) {}

    async evaluate(input: J19EvaluationInput): Promise<J19EvaluationResult> {
        const snapshot = await this.modes.resolve(input.authority);
        const now = this.clock();

        if (!bindingValid(snapshot, input.authority))
            return this.deny(snapshot, "MODE_BINDING_INVALID");
        if (snapshot.revoked) return this.deny(snapshot, "MODE_REVOKED");
        if (
            snapshot.expiresAtEpochMs !== undefined &&
            snapshot.expiresAtEpochMs !== null &&
            snapshot.expiresAtEpochMs <= now
        )
            return this.deny(snapshot, "MODE_EXPIRED");
        if (snapshot.mode !== input.authority.operatingMode)
            return this.deny(snapshot, "MODE_MISMATCH");

        const emergency = this.evaluateEmergency(snapshot, input);
        if (emergency) return emergency;

        if (
            snapshot.mode === "guest" &&
            (input.action === "APPROVAL_REQUEST" ||
                input.action === "TOOL_MUTATION" ||
                input.action === "BACKGROUND")
        )
            return this.deny(snapshot, "GUEST_PRIVILEGE_DENIED");

        if (
            snapshot.mode === "safe" &&
            (input.action === "TOOL_MUTATION" || input.mutating === true)
        )
            return this.deny(snapshot, "SAFE_MUTATION_DENIED");

        if (
            snapshot.mode === "emergency" &&
            input.action !== "MODEL" &&
            input.action !== "TOOL_READ"
        )
            return this.deny(snapshot, "EMERGENCY_POLICY_ONLY");

        if (snapshot.mode === "autonomous") {
            const envelope = await this.modes.resolveAutonomyEnvelope(
                input.authority,
            );
            if (!envelope)
                return this.deny(snapshot, "AUTONOMY_ENVELOPE_REQUIRED");
            if (!envelopeValid(envelope, input.authority, now))
                return this.deny(snapshot, "AUTONOMY_ENVELOPE_INVALID");
            if (!envelope.allowedActions.includes(input.action))
                return this.deny(snapshot, "AUTONOMY_SCOPE_DENIED");
            if ((input.costMinor ?? 0) > envelope.maxCostMinor)
                return this.deny(snapshot, "AUTONOMY_COST_DENIED");
            if (input.external === true && !envelope.externalAllowed)
                return this.deny(snapshot, "AUTONOMY_EXTERNAL_DENIED");
        }

        return {
            allowed: true,
            effectiveMode: snapshot.mode,
            emergencyControl: snapshot.emergencyControl,
            reason: "ALLOWED",
        };
    }

    private evaluateEmergency(
        snapshot: J19ModeSnapshot,
        input: J19EvaluationInput,
    ): J19EvaluationResult | null {
        switch (snapshot.emergencyControl) {
            case "NONE":
                return null;
            case "SHUTDOWN":
                return this.deny(snapshot, "EMERGENCY_SHUTDOWN");
            case "REVOKE":
                return this.deny(snapshot, "EMERGENCY_REVOKED");
            case "FREEZE":
                return this.deny(snapshot, "EMERGENCY_FROZEN");
            case "PAUSE":
                if (input.action !== "MODEL")
                    return this.deny(snapshot, "EMERGENCY_PAUSED");
                return null;
            case "DISCONNECT":
                if (input.action === "NETWORK" || input.external === true)
                    return this.deny(snapshot, "EMERGENCY_DISCONNECTED");
                return null;
            case "SAFE_MODE":
                if (
                    input.action === "TOOL_MUTATION" ||
                    input.action === "APPROVAL_REQUEST" ||
                    input.action === "BACKGROUND" ||
                    input.mutating === true
                )
                    return this.deny(snapshot, "EMERGENCY_SAFE_MODE");
                return null;
        }
    }

    private deny(
        snapshot: J19ModeSnapshot,
        reason: Exclude<J19EvaluationResult["reason"], "ALLOWED">,
    ): J19EvaluationResult {
        return {
            allowed: false,
            effectiveMode: snapshot.mode,
            emergencyControl: snapshot.emergencyControl,
            reason,
        };
    }
}
