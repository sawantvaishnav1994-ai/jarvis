import { z } from "zod";
import { DataClassSchema, DataPolicySchema } from "./data.js";

const Id = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Nat = z.number().int().nonnegative();
export const StorageLocationSchema = z.strictObject({
    version: z.literal(1),
    backend: z.enum(["postgres", "local-files", "s3-compatible"]),
    node: Id,
    region: Id,
    key: Id,
});
export const ExternalProcessingPolicySchema = z.strictObject({
    version: z.literal(1),
    mode: z.enum([
        "LOCAL_ONLY",
        "PRIVATE_INFRASTRUCTURE",
        "APPROVED_EXTERNAL_AI",
        "SPECIFIC_PROVIDER_ONLY",
        "NEVER_EXTERNAL",
    ]),
    providers: z.array(Id).max(20),
    regions: z.array(Id).max(20),
    fields: z.array(Id).max(50),
    maximumCharacters: z.number().int().min(0).max(16000),
});
export const RetentionPolicySchema = z
    .strictObject({
        version: z.literal(1),
        id: z.uuid(),
        revision: z.number().int().positive(),
        mode: z.enum([
            "KEEP_FOREVER",
            "KEEP_UNTIL_DATE",
            "KEEP_FOR_DURATION",
            "DELETE_AFTER_SESSION",
            "OWNER_MANAGED",
            "NEVER_STORE",
        ]),
        expiresAt: Nat.nullable(),
        durationMs: Nat.nullable(),
        sessionId: Id.nullable(),
    })
    .superRefine((r, c) => {
        if (
            (r.mode === "KEEP_UNTIL_DATE" && r.expiresAt === null) ||
            (r.mode === "KEEP_FOR_DURATION" &&
                (!r.durationMs || r.expiresAt === null)) ||
            (r.mode === "DELETE_AFTER_SESSION" && !r.sessionId)
        )
            c.addIssue({
                code: "custom",
                message: "Retention requires an explicit boundary",
            });
        if (
            (!["KEEP_UNTIL_DATE", "KEEP_FOR_DURATION"].includes(r.mode) &&
                r.expiresAt !== null) ||
            (r.mode !== "KEEP_FOR_DURATION" && r.durationMs !== null) ||
            (r.mode !== "DELETE_AFTER_SESSION" && r.sessionId !== null)
        )
            c.addIssue({
                code: "custom",
                message: "Retention contains conflicting boundaries",
            });
    });
export const StorageProvenanceSchema = z.strictObject({
    kind: z.enum([
        "owner-input",
        "conversation",
        "file",
        "import",
        "tool",
        "website",
        "agent",
        "device",
        "model-inference",
        "system",
    ]),
    sourceId: Id,
    sourceVersion: z.number().int().positive(),
    actorId: Id,
    capturedAt: Nat,
    confidence: z.number().min(0).max(1),
});
export const DataLineageSchema = z
    .strictObject({
        version: z.literal(1),
        sourceId: z.uuid(),
        derivedId: z.uuid(),
        ownerId: Id,
        sourceVersion: z.number().int().positive(),
        onDelete: z.enum(["cascade", "invalidate"]),
    })
    .refine((x) => x.sourceId !== x.derivedId, "Self lineage denied");
export const StorageDomainSchema = z.enum([
    "conversation",
    "message",
    "attachment",
    "memory",
    "embedding",
    "entity",
    "relationship",
    "evidence",
    "project",
    "setting",
]);
export const StorageRecordSchema = z
    .strictObject({
        version: z.literal(1),
        id: z.uuid(),
        ownerId: Id,
        actorId: Id,
        domain: StorageDomainSchema,
        revision: z.number().int().positive(),
        previousRevision: Nat.nullable(),
        projectId: Id.nullable(),
        createdAt: Nat,
        updatedAt: Nat,
        reason: z.string().max(500),
        policy: DataPolicySchema,
        retention: RetentionPolicySchema,
        external: ExternalProcessingPolicySchema,
        provenance: z.array(StorageProvenanceSchema).min(1).max(50),
        sources: z.array(z.uuid()).max(50),
        payload: z.record(z.string().min(1).max(100), z.json()),
    })
    .superRefine((r, c) => {
        if (r.policy.classification === "D5")
            c.addIssue({
                code: "custom",
                message: "D5 requires dedicated vault",
            });
        if (r.sources.includes(r.id))
            c.addIssue({ code: "custom", message: "Self lineage denied" });
        if (
            r.updatedAt < r.createdAt ||
            (r.revision === 1
                ? r.previousRevision !== null
                : r.previousRevision !== r.revision - 1)
        )
            c.addIssue({ code: "custom", message: "Invalid revision history" });
    });
export type StorageRecord = z.infer<typeof StorageRecordSchema>;
export type StorageDomain = z.infer<typeof StorageDomainSchema>;

export const ObjectMetadataSchema = z.strictObject({
    version: z.literal(1),
    id: z.uuid(),
    ownerId: Id,
    filename: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(100),
    size: Nat,
    contentHash: Hash,
    ciphertextHash: Hash,
    classification: DataClassSchema,
    location: StorageLocationSchema,
    keyId: Id,
    revision: z.number().int().positive(),
    createdAt: Nat,
    deletionState: z.enum([
        "ACTIVE",
        "DELETION_REQUESTED",
        "DELETING",
        "DELETED",
        "PURGED",
    ]),
});
export const KeyMetadataSchema = z.strictObject({
    version: z.literal(1),
    id: Id,
    keyVersion: z.number().int().positive(),
    ownerId: Id,
    role: z.enum([
        "owner-root",
        "kek",
        "dek",
        "signing",
        "backup",
        "device",
        "service",
    ]),
    state: z.enum([
        "CREATED",
        "ACTIVE",
        "ROTATING",
        "RETIRED",
        "REVOKED",
        "DESTROYED",
    ]),
    createdAt: Nat,
    activatedAt: Nat.nullable(),
    rotatedAt: Nat.nullable(),
    retiredAt: Nat.nullable(),
    destroyedAt: Nat.nullable(),
    domain: Id,
    backingStore: Id,
    algorithm: Id,
    purposes: z.array(Id).min(1),
    recoveryPolicy: Id,
});
export const SecretReferenceSchema = z
    .string()
    .regex(/^secret:\/\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)+$/);
export const DeletionRequestSchema = z.strictObject({
    version: z.literal(1),
    id: z.uuid(),
    ownerId: Id,
    targetId: z.uuid(),
    authorizationId: Id,
    createdAt: Nat,
    state: z.enum(["DELETION_REQUESTED", "DELETING", "DELETED", "PURGED"]),
    affectedIds: z.array(z.uuid()),
    backupExpiryRequired: z.boolean(),
});
export const DeletionTombstoneSchema = z.strictObject({
    version: z.literal(1),
    ownerId: Id,
    recordId: z.uuid(),
    deletedAt: Nat,
    deletionId: z.uuid(),
});
const ManifestItem = z.strictObject({
    path: z.string().regex(/^[a-z0-9_-]+\/[a-zA-Z0-9._-]+$/),
    sha256: Hash,
    size: Nat,
});
export const ExportManifestSchema = z.strictObject({
    version: z.literal(1),
    id: z.uuid(),
    ownerId: Id,
    generatedAt: Nat,
    domains: z.array(Id),
    encryption: z.enum(["owner-plaintext-export", "encrypted"]),
    schemaVersions: z.record(z.string(), z.number().int().positive()),
    items: z.array(ManifestItem).max(10000),
    secretsIncluded: z.literal(false),
});
export const BackupManifestSchema = z.strictObject({
    version: z.literal(1),
    id: z.uuid(),
    ownerId: Id,
    createdAt: Nat,
    sourceVersion: Id,
    schemaHash: Hash,
    domains: z.array(Id),
    objectCount: Nat,
    keyId: Id,
    keyVersion: z.number().int().positive(),
    algorithm: z.literal("aes-256-gcm"),
    items: z.array(ManifestItem).max(10000),
    state: z.enum(["PENDING", "VALID", "INVALID"]),
    validatedAt: Nat.nullable(),
});
export const RestoreJobSchema = z.strictObject({
    version: z.literal(1),
    id: z.uuid(),
    backupId: z.uuid(),
    ownerId: Id,
    target: Id,
    authorizationId: Id,
    createdAt: Nat,
    state: z.enum(["VALIDATING", "RESTORING", "VERIFIED", "FAILED"]),
});
export const IntegrityCheckSchema = z
    .strictObject({
        version: z.literal(1),
        id: z.uuid(),
        targetId: Id,
        checkedAt: Nat,
        expectedHash: Hash,
        actualHash: Hash,
        valid: z.boolean(),
    })
    .refine(
        (x) => x.valid === (x.expectedHash === x.actualHash),
        "Integrity result mismatch",
    );
export const StorageHealthSchema = z.strictObject({
    version: z.literal(1),
    checkedAt: Nat,
    status: z.enum(["healthy", "degraded", "unavailable"]),
    postgres: z.boolean(),
    migrations: z.boolean(),
    pgvector: z.boolean(),
    objects: z.boolean(),
    vault: z.boolean(),
    keys: z.boolean(),
    backupFresh: z.boolean(),
    backupIntegrity: z.enum(["valid", "invalid", "none"]),
    availableBytes: Nat.nullable(),
});
