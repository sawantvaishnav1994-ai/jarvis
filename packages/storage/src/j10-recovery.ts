import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { BoundaryError } from "@jarvis/shared";
import { canonical } from "@jarvis/identity";
import type { AuthorizationV3 } from "@jarvis/security";
import {
    RecoveryCompatibilitySchema,
    RecoveryEvidenceSchema,
    RecoveryManifestV2Schema,
    RecoverySafeModeSchema,
    RecoverySimulationSchema,
    RestorePlanSchema,
    type RecoveryManifestV2,
    type RestorePlan,
} from "./j10-contracts.js";

export const J10_BASELINE = "e9e943b90da9d1be748aedb4dc62ef7017020b39";
const PLAN_TTL_MS = 15 * 60 * 1000;
const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");

export function recoveryManifestDigest(input: Omit<RecoveryManifestV2, "manifestDigest">) {
    return sha256(input);
}

export function materializeRecoveryManifest(input: Omit<RecoveryManifestV2, "manifestDigest">): RecoveryManifestV2 {
    const parsed = RecoveryManifestV2Schema.omit({ manifestDigest: true }).parse(input);
    return RecoveryManifestV2Schema.parse({ ...parsed, manifestDigest: recoveryManifestDigest(parsed) });
}

export function verifyRecoveryManifest(manifest: RecoveryManifestV2, ownerId: string, now: number) {
    const parsed = RecoveryManifestV2Schema.parse(manifest);
    if (parsed.ownerId !== ownerId) throw new BoundaryError("RECOVERY_OWNER_MISMATCH");
    const { manifestDigest: _, ...unsigned } = parsed;
    if (sha256(unsigned) !== parsed.manifestDigest) throw new BoundaryError("RECOVERY_MANIFEST_TAMPERED");
    if (parsed.expiresAt !== null && parsed.expiresAt <= now) throw new BoundaryError("RECOVERY_PACKAGE_EXPIRED");
    if (parsed.secretsIncluded) throw new BoundaryError("RECOVERY_SECRET_CONTENT_DENIED");
    return parsed;
}

export function checkRecoveryCompatibility(manifest: RecoveryManifestV2, supported = { schema: 14, storage: 2, encryption: 1, vector: 1, audit: 3, event: 1 }) {
    const reasons: string[] = [];
    if (manifest.schemaVersion > supported.schema) reasons.push("SCHEMA_VERSION_UNSUPPORTED");
    if (manifest.storageVersion > supported.storage) reasons.push("STORAGE_VERSION_UNSUPPORTED");
    if (manifest.encryptionVersion > supported.encryption) reasons.push("ENCRYPTION_VERSION_UNSUPPORTED");
    if (manifest.vectorVersion > supported.vector) reasons.push("VECTOR_VERSION_UNSUPPORTED");
    if (manifest.auditVersion > supported.audit) reasons.push("AUDIT_VERSION_UNSUPPORTED");
    if (manifest.eventVersion > supported.event) reasons.push("EVENT_VERSION_UNSUPPORTED");
    if (manifest.components.some((c) => c.required && c.count < 1)) reasons.push("REQUIRED_COMPONENT_MISSING");
    return RecoveryCompatibilitySchema.parse({ compatible: reasons.length === 0, reasons });
}

export function buildRestorePlan(input: Omit<RestorePlan, "planDigest" | "state" | "createdAt" | "validUntil" | "version"> & { now: number }): RestorePlan {
    const { now, ...fields } = input;
    const unsigned = {
        version: 1 as const,
        ...fields,
        createdAt: now,
        validUntil: now + PLAN_TTL_MS,
        state: "PLANNED" as const,
    };
    return RestorePlanSchema.parse({ ...unsigned, planDigest: sha256(unsigned) });
}

export function verifyRestorePlan(plan: RestorePlan, ownerId: string, now: number, securityEpoch: number, manifestDigest: string) {
    const parsed = RestorePlanSchema.parse(plan);
    if (parsed.ownerId !== ownerId) throw new BoundaryError("RESTORE_PLAN_OWNER_MISMATCH");
    if (parsed.validUntil <= now) throw new BoundaryError("RESTORE_PLAN_EXPIRED");
    if (parsed.securityEpoch !== securityEpoch) throw new BoundaryError("RESTORE_SECURITY_EPOCH_CHANGED");
    if (parsed.manifestDigest !== manifestDigest) throw new BoundaryError("RESTORE_MANIFEST_CHANGED");
    const { planDigest: _, ...unsigned } = parsed;
    if (sha256(unsigned) !== parsed.planDigest) throw new BoundaryError("RESTORE_PLAN_TAMPERED");
    return parsed;
}

export interface RecoveryAuthorizationPort {
    revalidate(input: { authorization: AuthorizationV3; planDigest: string; securityEpoch: number }): Promise<void>;
}
export interface IsolatedActivationPort {
    verify(targetId: string, plan: RestorePlan): Promise<void>;
    activate(targetId: string, plan: RestorePlan): Promise<void>;
}
export interface RecoveryAuditPort {
    append(input: { ownerId: string; action: string; result: "SUCCESS" | "DENIED" | "FAILED"; correlationId: string; planId: string | null; metadata: Record<string, string | number | boolean | null> }): Promise<void>;
}

export class RecoveryControlPlane {
    constructor(
        private readonly pool: pg.Pool,
        private readonly authorization: RecoveryAuthorizationPort,
        private readonly activation: IsolatedActivationPort,
        private readonly audit: RecoveryAuditPort,
        private readonly clock: () => number = Date.now,
    ) {}

    private requireRecoveryAuth(auth: AuthorizationV3, capability: "storage.backup.create" | "storage.backup.restore") {
        if (auth.capability !== capability || !auth.approvalId || auth.assurance !== "A3")
            throw new BoundaryError("RECOVERY_STEP_UP_APPROVAL_REQUIRED");
    }

    async persistManifest(auth: AuthorizationV3, manifest: RecoveryManifestV2) {
        this.requireRecoveryAuth(auth, "storage.backup.create");
        const value = verifyRecoveryManifest(manifest, auth.ownerId, this.clock());
        await this.pool.query(
            `INSERT INTO recovery.manifests(id,owner_id,project_id,source_installation_id,manifest_version,manifest_digest,payload,expires_at,status)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,'VALID')`,
            [value.id, value.ownerId, value.projectId, value.sourceInstallationId, value.version, value.manifestDigest, value, value.expiresAt === null ? null : new Date(value.expiresAt)],
        );
        await this.evidence(value.ownerId, null, "backup.verified", "SUCCESS", "backup:" + value.id, { backupId: value.backupId, manifestDigest: value.manifestDigest });
        return value;
    }

    async createPlan(auth: AuthorizationV3, manifest: RecoveryManifestV2, targetId: string, securityEpoch: number, secretRebind: string[] = []) {
        this.requireRecoveryAuth(auth, "storage.backup.restore");
        const checked = verifyRecoveryManifest(manifest, auth.ownerId, this.clock());
        const compatibility = checkRecoveryCompatibility(checked);
        if (!compatibility.compatible) throw new BoundaryError("RECOVERY_INCOMPATIBLE");
        const plan = buildRestorePlan({
            id: randomUUID(), ownerId: auth.ownerId, backupId: checked.backupId, manifestDigest: checked.manifestDigest,
            targetId, targetKind: "ISOLATED_DATABASE", securityEpoch, invalidateSessions: true, preserveRootOwner: true,
            preserveRevocations: true, suppressDeletedData: true, requiresSecretRebind: secretRebind, migrationsRequired: [],
            expectedCounts: Object.fromEntries(checked.components.map((c) => [c.name, c.count])), auditCheckpointHash: checked.auditCheckpoint?.hash ?? null,
            rollbackTarget: "active-current", now: this.clock(),
        });
        await this.pool.query(
            `INSERT INTO recovery.restore_plans(id,owner_id,backup_id,plan_digest,security_epoch,payload,state,valid_until)
             VALUES($1,$2,$3,$4,$5,$6,'PLANNED',$7)`,
            [plan.id, plan.ownerId, plan.backupId, plan.planDigest, plan.securityEpoch, plan, new Date(plan.validUntil)],
        );
        await this.evidence(plan.ownerId, plan.id, "restore.plan.created", "SUCCESS", "restore:" + plan.id, { targetId, planDigest: plan.planDigest });
        return plan;
    }

    async simulate(auth: AuthorizationV3, plan: RestorePlan, probes: Omit<ReturnType<typeof RecoverySimulationSchema.parse>, "version" | "planId" | "checkedAt" | "approved" | "result">) {
        this.requireRecoveryAuth(auth, "storage.backup.restore");
        verifyRestorePlan(plan, auth.ownerId, this.clock(), plan.securityEpoch, plan.manifestDigest);
        const pass = Object.values(probes).every(Boolean);
        const result = RecoverySimulationSchema.parse({ version: 1, planId: plan.id, checkedAt: this.clock(), ...probes, approved: false, result: pass ? "PASS" : "FAIL" });
        await this.pool.query("UPDATE recovery.restore_plans SET state=$2 WHERE id=$1 AND owner_id=$3 AND state='PLANNED'", [plan.id, pass ? "SIMULATED" : "FAILED", plan.ownerId]);
        await this.evidence(plan.ownerId, plan.id, "restore.simulated", pass ? "SUCCESS" : "FAILED", "restore:" + plan.id, { result: result.result });
        return result;
    }

    async enterSafeMode(ownerId: string, planId: string | null, reasonCode: string) {
        const state = RecoverySafeModeSchema.parse({ version: 1, ownerId, enabled: true, reasonCode, planId, updatedAt: this.clock(), externalActionsAllowed: false, agentsAllowed: false, mutatingToolsAllowed: false });
        await this.pool.query(
            `INSERT INTO recovery.safe_mode(owner_id,enabled,reason_code,plan_id,updated_at) VALUES($1,true,$2,$3,$4)
             ON CONFLICT(owner_id) DO UPDATE SET enabled=true,reason_code=EXCLUDED.reason_code,plan_id=EXCLUDED.plan_id,updated_at=EXCLUDED.updated_at`,
            [ownerId, reasonCode, planId, new Date(state.updatedAt)],
        );
        await this.evidence(ownerId, planId, "recovery.safe_mode.entered", "SUCCESS", "recovery-safe:" + ownerId, { reasonCode });
        return state;
    }

    async prepareCutover(auth: AuthorizationV3, plan: RestorePlan, securityEpoch: number) {
        this.requireRecoveryAuth(auth, "storage.backup.restore");
        const checked = verifyRestorePlan(plan, auth.ownerId, this.clock(), securityEpoch, plan.manifestDigest);
        await this.authorization.revalidate({ authorization: auth, planDigest: checked.planDigest, securityEpoch });
        const state = await this.pool.query<{ state: string }>("SELECT state FROM recovery.restore_plans WHERE id=$1 AND owner_id=$2", [checked.id, checked.ownerId]);
        if (state.rows[0]?.state !== "VERIFIED") throw new BoundaryError("RESTORE_NOT_VERIFIED");
        await this.activation.verify(checked.targetId, checked);
        await this.pool.query(
            `INSERT INTO recovery.cutover_markers(owner_id,plan_id,target_id,state,security_epoch,plan_digest) VALUES($1,$2,$3,'PREPARED',$4,$5)
             ON CONFLICT(owner_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,target_id=EXCLUDED.target_id,state='PREPARED',security_epoch=EXCLUDED.security_epoch,plan_digest=EXCLUDED.plan_digest,updated_at=now()`,
            [checked.ownerId, checked.id, checked.targetId, securityEpoch, checked.planDigest],
        );
        await this.evidence(checked.ownerId, checked.id, "restore.cutover.prepared", "SUCCESS", "restore:" + checked.id, { targetId: checked.targetId });
    }

    async executeCutover(auth: AuthorizationV3, plan: RestorePlan, securityEpoch: number) {
        this.requireRecoveryAuth(auth, "storage.backup.restore");
        const checked = verifyRestorePlan(plan, auth.ownerId, this.clock(), securityEpoch, plan.manifestDigest);
        await this.authorization.revalidate({ authorization: auth, planDigest: checked.planDigest, securityEpoch });
        const marker = await this.pool.query<{ state: string; plan_digest: string; target_id: string; security_epoch: string }>(
            "SELECT state,plan_digest,target_id,security_epoch FROM recovery.cutover_markers WHERE owner_id=$1 AND plan_id=$2", [checked.ownerId, checked.id],
        );
        const m = marker.rows[0];
        if (!m || m.state !== "PREPARED" || m.plan_digest !== checked.planDigest || m.target_id !== checked.targetId || Number(m.security_epoch) !== securityEpoch)
            throw new BoundaryError("CUTOVER_MARKER_INVALID");
        await this.activation.activate(checked.targetId, checked);
        await this.pool.query("UPDATE recovery.cutover_markers SET state='ACTIVE',updated_at=now() WHERE owner_id=$1 AND plan_id=$2", [checked.ownerId, checked.id]);
        await this.pool.query("UPDATE recovery.restore_plans SET state='COMPLETED' WHERE id=$1 AND owner_id=$2", [checked.id, checked.ownerId]);
        await this.evidence(checked.ownerId, checked.id, "restore.cutover.completed", "SUCCESS", "restore:" + checked.id, { targetId: checked.targetId });
    }

    async recordVerified(ownerId: string, planId: string, targetId: string, correlationId: string) {
        await this.pool.query("UPDATE recovery.restore_plans SET state='VERIFIED' WHERE id=$1 AND owner_id=$2 AND state IN ('SIMULATED','RESTORING')", [planId, ownerId]);
        await this.evidence(ownerId, planId, "restore.verified", "SUCCESS", correlationId, { targetId });
    }

    async abort(ownerId: string, planId: string, correlationId: string) {
        await this.pool.query("UPDATE recovery.restore_plans SET state='ABORTED' WHERE id=$1 AND owner_id=$2 AND state <> 'COMPLETED'", [planId, ownerId]);
        await this.pool.query("UPDATE recovery.cutover_markers SET state='ABORTED',updated_at=now() WHERE owner_id=$1 AND plan_id=$2 AND state <> 'ACTIVE'", [ownerId, planId]);
        await this.evidence(ownerId, planId, "restore.aborted", "SUCCESS", correlationId, {});
    }

    async readiness(ownerId: string) {
        const safe = await this.pool.query<{ enabled: boolean }>("SELECT enabled FROM recovery.safe_mode WHERE owner_id=$1", [ownerId]);
        const cutover = await this.pool.query("SELECT 1 FROM recovery.cutover_markers WHERE owner_id=$1 AND state IN ('PREPARED','ACTIVATING')", [ownerId]);
        return { live: true, ready: !safe.rows[0]?.enabled && cutover.rowCount === 0, recoverySafeMode: Boolean(safe.rows[0]?.enabled), unresolvedCutover: cutover.rowCount !== 0 };
    }

    private async evidence(ownerId: string, planId: string | null, action: Parameters<typeof RecoveryEvidenceSchema.parse>[0] extends infer _ ? string : never, result: "SUCCESS" | "DENIED" | "FAILED", correlationId: string, metadata: Record<string, string | number | boolean | null>) {
        const record = RecoveryEvidenceSchema.parse({ version: 1, id: randomUUID(), ownerId, planId, action, result, correlationId, createdAt: this.clock(), metadata });
        await this.pool.query("INSERT INTO recovery.evidence(id,owner_id,plan_id,action,result,correlation_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)", [record.id, record.ownerId, record.planId, record.action, record.result, record.correlationId, record.metadata]);
        await this.audit.append({ ownerId, action, result, correlationId, planId, metadata });
    }
}
