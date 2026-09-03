import { z } from "zod";

const Id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Nat = z.number().int().nonnegative();
const Component = z.strictObject({
    name: Id,
    digest: Hash,
    count: Nat,
    required: z.boolean(),
});

export const RecoveryManifestV2Schema = z.strictObject({
    version: z.literal(2),
    id: z.uuid(),
    ownerId: Id,
    projectId: Id.nullable(),
    sourceInstallationId: Id,
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    createdAt: Nat,
    expiresAt: Nat.nullable(),
    schemaVersion: z.number().int().positive(),
    schemaHash: Hash,
    storageVersion: z.number().int().positive(),
    encryptionVersion: z.number().int().positive(),
    vectorVersion: z.number().int().positive(),
    auditVersion: z.number().int().positive(),
    eventVersion: z.number().int().positive(),
    backupId: z.uuid(),
    backupType: z.enum(["FULL", "INCREMENTAL"]),
    parentBackupId: z.uuid().nullable(),
    components: z.array(Component).min(1).max(100),
    auditCheckpoint: z.strictObject({ sequence: Nat, hash: Hash }).nullable(),
    keyReferences: z.array(Id).max(100),
    vaultReferences: z.array(z.string().regex(/^secret:\/\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)+$/)).max(200),
    tombstoneCount: Nat,
    deletionObligationCount: Nat,
    secretsIncluded: z.literal(false),
    manifestDigest: Hash,
});
export type RecoveryManifestV2 = z.infer<typeof RecoveryManifestV2Schema>;

export const RecoveryCompatibilitySchema = z.strictObject({
    compatible: z.boolean(),
    reasons: z.array(z.enum([
        "SCHEMA_VERSION_UNSUPPORTED",
        "STORAGE_VERSION_UNSUPPORTED",
        "ENCRYPTION_VERSION_UNSUPPORTED",
        "VECTOR_VERSION_UNSUPPORTED",
        "AUDIT_VERSION_UNSUPPORTED",
        "EVENT_VERSION_UNSUPPORTED",
        "REQUIRED_COMPONENT_MISSING",
        "EXPIRED",
    ])).max(20),
});

export const RestorePlanSchema = z.strictObject({
    version: z.literal(1),
    id: z.uuid(),
    ownerId: Id,
    backupId: z.uuid(),
    manifestDigest: Hash,
    targetId: Id,
    targetKind: z.enum(["ISOLATED_DATABASE", "ISOLATED_SCHEMA", "ISOLATED_NAMESPACE"]),
    createdAt: Nat,
    validUntil: Nat,
    securityEpoch: Nat,
    invalidateSessions: z.literal(true),
    preserveRootOwner: z.literal(true),
    preserveRevocations: z.literal(true),
    suppressDeletedData: z.literal(true),
    requiresSecretRebind: z.array(Id).max(100),
    migrationsRequired: z.array(z.number().int().positive()).max(100),
    expectedCounts: z.record(Id, Nat),
    auditCheckpointHash: Hash.nullable(),
    rollbackTarget: Id,
    state: z.enum(["PLANNED", "SIMULATED", "APPROVED", "RESTORING", "VERIFIED", "CUTOVER_READY", "COMPLETED", "ABORTED", "FAILED"]),
    planDigest: Hash,
}).superRefine((p, c) => {
    if (p.validUntil <= p.createdAt || p.validUntil > p.createdAt + 15 * 60 * 1000)
        c.addIssue({ code: "custom", message: "Restore plan lifetime invalid" });
});
export type RestorePlan = z.infer<typeof RestorePlanSchema>;

export const RecoverySimulationSchema = z.strictObject({
    version: z.literal(1),
    planId: z.uuid(),
    checkedAt: Nat,
    decryptable: z.boolean(),
    integrityValid: z.boolean(),
    compatible: z.boolean(),
    objectsAvailable: z.boolean(),
    keysAvailable: z.boolean(),
    deletionReconciled: z.boolean(),
    auditCompatible: z.boolean(),
    destinationReady: z.boolean(),
    approved: z.literal(false),
    result: z.enum(["PASS", "FAIL"]),
});

export const RecoverySafeModeSchema = z.strictObject({
    version: z.literal(1),
    ownerId: Id,
    enabled: z.boolean(),
    reasonCode: Id,
    planId: z.uuid().nullable(),
    updatedAt: Nat,
    externalActionsAllowed: z.literal(false),
    agentsAllowed: z.literal(false),
    mutatingToolsAllowed: z.literal(false),
});

export const RecoveryEvidenceSchema = z.strictObject({
    version: z.literal(1),
    id: z.uuid(),
    ownerId: Id,
    planId: z.uuid().nullable(),
    action: z.enum([
        "backup.created", "backup.verified", "restore.plan.created", "restore.simulated",
        "restore.started", "restore.verified", "restore.cutover.prepared", "restore.cutover.completed",
        "restore.aborted", "recovery.safe_mode.entered", "recovery.safe_mode.exited", "recovery.failed",
    ]),
    result: z.enum(["SUCCESS", "DENIED", "FAILED"]),
    correlationId: Id,
    createdAt: Nat,
    metadata: z.record(Id, z.union([z.string().max(256), z.number(), z.boolean(), z.null()])),
});

export const PortableOwnerExportV2Schema = z.strictObject({
    version: z.literal(2),
    id: z.uuid(),
    ownerId: Id,
    generatedAt: Nat,
    sourceInstallationId: Id,
    schemaVersion: z.number().int().positive(),
    domains: z.array(Id).min(1).max(100),
    componentDigests: z.record(Id, Hash),
    tombstoneDigest: Hash,
    auditCheckpointHash: Hash.nullable(),
    providerIndependent: z.literal(true),
    secretsIncluded: z.literal(false),
    exportDigest: Hash,
});
