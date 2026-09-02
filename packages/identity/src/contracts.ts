import { z } from "zod";
import { IdentifierSchema } from "@jarvis/shared";
export const AssuranceSchema = z.enum(["A0", "A1", "A2", "A3", "A4"]);
export type Assurance = z.infer<typeof AssuranceSchema>;
export const DeviceTrustSchema = z.enum([
    "unknown",
    "temporary",
    "trusted",
    "privileged",
    "hardware-root",
    "revoked",
]);
export const DeviceInputSchema = z.strictObject({
    name: z.string().trim().min(1).max(80),
    type: z.enum([
        "laptop",
        "phone",
        "desktop",
        "tablet",
        "hardware",
        "browser",
    ]),
    publicKey: z.string().min(60).max(512),
});
export type DeviceInput = z.infer<typeof DeviceInputSchema>;
export type OwnerProfile = {
    id: string;
    displayName: string;
    createdAt: number;
    ownershipVersion: 1;
    epoch: number;
    recoveryHash: string | null;
    recoveryGeneration: number;
};
export type TrustedDevice = DeviceInput & {
    id: string;
    ownerId: string;
    enrolledAt: number;
    lastSeen: number;
    trust: z.infer<typeof DeviceTrustSchema>;
    posture: "unknown" | "normal" | "suspicious";
    revokedAt: number | null;
    expiresAt: number | null;
};
export type PasskeyRecord = {
    id: string;
    ownerId: string;
    deviceId: string;
    publicKey: string;
    counter: number;
    backedUp: boolean;
    deviceType: "singleDevice" | "multiDevice";
    revoked: boolean;
};
export type SessionRecord = {
    id: string;
    tokenHash: string;
    ownerId: string;
    deviceId: string;
    assurance: "A1" | "A2";
    createdAt: number;
    lastActivity: number;
    expiresAt: number;
    epoch: number;
    revoked: boolean;
    risk: "normal" | "restricted";
    contextHash: string;
    scopes: string[];
};
export type SubjectRecord = {
    id: string;
    ownerId: string;
    kind: "agent" | "service" | "tool" | "integration" | "human";
    role: "restricted" | "guest";
    name: string;
    publicKey: string;
    scopes: string[];
    resources: string[];
    revoked: boolean;
    createdAt: number;
};
export type DelegationRecord = {
    id: string;
    tokenHash: string;
    subjectId: string;
    ownerId: string;
    deviceId: string;
    sessionId: string;
    scope: string;
    resource: string;
    expiresAt: number;
    epoch: number;
    revoked: boolean;
    audience: "jarvis.mock";
    governance?: {
        version: 1;
        environment: "development" | "staging" | "production";
        maximumRisk: number;
        maximumUses: number;
        uses: number;
        toolId: string | null;
    };
};
export type ChallengeRecord = {
    id: string;
    kind:
        | "root"
        | "enroll"
        | "login"
        | "action"
        | "step-up"
        | "delegated"
        | "recovery";
    payload: string;
    webChallenge: string;
    expiresAt: number;
    consumed: boolean;
    ownerId: string;
    deviceId: string;
    sessionId: string;
    operation: string;
    inputHash: string;
    device: DeviceInput | null;
    recoveryOwner: OwnerProfile | null;
};
export type ApprovalEvidence = {
    envelope: string;
    challenge: string;
    credentialId: string;
    credentialPublicKey: string;
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    origin: string;
    rpID: string;
    counterBefore: number;
};
export type ApprovalRecord = {
    id: string;
    ownerId: string;
    deviceId: string;
    sessionId: string;
    operation: string;
    inputHash: string;
    expiresAt: number;
    consumed: boolean;
    evidence: ApprovalEvidence;
};
export type SecurityEvent = {
    version: 1;
    id: string;
    type: string;
    timestamp: number;
    actorId: string;
    deviceId: string | null;
    subjectId: string | null;
    operation: string;
    outcome: "success" | "denied";
    code: string;
    assurance: Assurance;
    approval: ApprovalEvidence | null;
    details?: Record<string, unknown>;
};
export type IdentityState = {
    owner: OwnerProfile | null;
    devices: Record<string, TrustedDevice>;
    passkeys: Record<string, PasskeyRecord>;
    sessions: Record<string, SessionRecord>;
    subjects: Record<string, SubjectRecord>;
    delegations: Record<string, DelegationRecord>;
    challenges: Record<string, ChallengeRecord>;
    approvals: Record<string, ApprovalRecord>;
    replays: Record<string, { id: string; expiresAt: number }>;
    /** Validated by Security; persisted atomically with identity and audit. */
    security?: unknown;
};
export type SecurityPrincipal = {
    actorId: string;
    ownerId: string;
    kind: "owner" | SubjectRecord["kind"];
    sessionId: string | null;
    deviceId: string | null;
    assurance: "A1" | "A2" | "A3";
    evidence: ApprovalEvidence | null;
};
export type SecurityCommandHandler = (
    state: IdentityState,
    events: SecurityEvent[],
    principal: SecurityPrincipal,
    input: unknown,
) => Promise<unknown>;
export const emptyIdentityState = (): IdentityState => ({
    owner: null,
    devices: {},
    passkeys: {},
    sessions: {},
    subjects: {},
    delegations: {},
    challenges: {},
    approvals: {},
    replays: {},
});
export interface IdentityRepository {
    transaction<T>(
        work: (state: IdentityState, events: SecurityEvent[]) => Promise<T>,
    ): Promise<T>;
    audit(limit: number): Promise<SecurityEvent[]>;
}
export const ActionSchema = z.enum([
    "identity.inspect",
    "device.approve",
    "device.revoke",
    "session.revoke",
    "subject.create",
    "delegation.issue",
    "recovery.prepare",
    "privacy.inspect",
    "critical.confirm",
    "owner.transfer",
    "security.command",
    "security.inspect",
]);
export type IdentityAction = z.infer<typeof ActionSchema>;
export const ActionInputSchemas = {
    "identity.inspect": z.strictObject({}),
    "device.approve": z.strictObject({
        deviceId: IdentifierSchema,
        trust: z.enum(["temporary", "trusted", "privileged"]),
    }),
    "device.revoke": z.strictObject({ deviceId: IdentifierSchema }),
    "session.revoke": z.strictObject({
        sessionId: IdentifierSchema.optional(),
        exceptCurrent: z.boolean().optional(),
    }),
    "subject.create": z.strictObject({
        name: z.string().min(1).max(80),
        kind: z.enum(["agent", "service", "tool", "integration", "human"]),
        publicKey: z.string().max(512),
        scopes: z
            .array(z.enum(["mock.read"]))
            .max(1)
            .default([]),
        resources: z.array(IdentifierSchema).max(8).default([]),
    }),
    "delegation.issue": z.strictObject({
        subjectId: IdentifierSchema,
        scope: z.literal("mock.read"),
        resource: IdentifierSchema,
        ttlSeconds: z.number().int().min(1).max(900),
    }),
    "recovery.prepare": z.strictObject({}),
    "privacy.inspect": z.strictObject({ sharedDisplay: z.boolean() }),
    "critical.confirm": z.strictObject({}),
    "owner.transfer": z.strictObject({}),
    "security.command": z.strictObject({
        command: z.string().min(1).max(60),
        data: z.json(),
    }),
    "security.inspect": z.strictObject({}),
};
export type DeviceProof = { challengeId: string; signature: string };
export type SessionProof = DeviceProof & { token: string; approvalId?: string };
