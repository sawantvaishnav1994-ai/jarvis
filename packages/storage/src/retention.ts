import { BoundaryError, type StorageRecord } from "@jarvis/shared";
import { canonical } from "@jarvis/identity";
import type { AuthorizationV3 } from "@jarvis/security";

/** Consistency checks only. These functions never issue execution authority. */
export function validateRecordRetention(record: StorageRecord): void {
    const r = record.retention, p = record.policy.retention;
    const expected = r.mode === "NEVER_STORE" ? "never-store"
        : r.mode === "DELETE_AFTER_SESSION" ? "session"
        : r.expiresAt === null ? "keep" : "until";
    if (p.mode !== expected ||
        (p.mode === "until" && Date.parse(p.expiresAt) !== r.expiresAt) ||
        (p.mode === "session" && p.sessionId !== r.sessionId))
        throw new BoundaryError("RETENTION_BOUNDARY_MISMATCH");
    if (r.mode === "KEEP_FOR_DURATION" &&
        r.expiresAt !== record.createdAt + r.durationMs!)
        throw new BoundaryError("RETENTION_DURATION_MISMATCH");
}

export function validateRetentionUpdate(
    previous: StorageRecord,
    next: StorageRecord,
    auth: AuthorizationV3,
    now: number,
): void {
    validateRecordRetention(previous);
    validateRecordRetention(next);
    if (previous.retention.expiresAt !== null && previous.retention.expiresAt <= now)
        throw new BoundaryError("DATA_EXPIRED");
    if (previous.createdAt !== next.createdAt)
        throw new BoundaryError("DATA_CREATED_TIME_IMMUTABLE");
    if (canonical(previous.retention) === canonical(next.retention)) return;
    if (auth.capability !== "data.retention.modify" || !auth.approvalId ||
        auth.assurance !== "A3" || auth.zone !== "Z4" ||
        auth.environment !== "development")
        throw new BoundaryError("RETENTION_OWNER_APPROVAL_REQUIRED");
    if (next.retention.id !== previous.retention.id ||
        next.retention.revision !== previous.retention.revision + 1)
        throw new BoundaryError("RETENTION_VERSION_CONFLICT");
}
