import { BoundaryError } from "@jarvis/shared";
import { currentDataTransaction } from "./transaction.js";

export const DEVELOPMENT_BACKUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** The authenticated deletion transaction invalidates every older owner snapshot.
 * Conservative whole-snapshot exclusion avoids retaining a recoverable derived copy.
 * This records purge eligibility, never claims that physical bytes were removed.
 */
export async function linkBackupDeletion(ownerId: string, deletionId: string, ids: readonly string[], now: number) {
    if (!Number.isSafeInteger(now) || now < 0 || ids.length > 200)
        throw new BoundaryError("BACKUP_OBLIGATION_INPUT_INVALID");
    await currentDataTransaction().query(
        "INSERT INTO storage.backup_deletion_obligations(owner_id,backup_id,record_id,deletion_id,created_at,purge_eligible_at) SELECT b.owner_id,b.id,r.id,$2,$4,$4 FROM storage.backups b CROSS JOIN unnest($3::uuid[]) AS r(id) WHERE b.owner_id=$1 ON CONFLICT DO NOTHING",
        [ownerId, deletionId, ids, new Date(now)],
    );
}

export async function requireRestorableBackup(ownerId: string, backupId: string, now: number) {
    const tx = currentDataTransaction();
    const row = (await tx.query<{ expires_at: Date }>(
        "SELECT expires_at FROM storage.backup_retention WHERE owner_id=$1 AND backup_id=$2",
        [ownerId, backupId],
    )).rows[0];
    if (!row || !Number.isSafeInteger(now) || now < 0)
        throw new BoundaryError("BACKUP_RETENTION_REQUIRED");
    if (row.expires_at.getTime() <= now)
        throw new BoundaryError("BACKUP_EXPIRED");
    if ((await tx.query(
        "SELECT 1 FROM storage.backup_deletion_obligations WHERE owner_id=$1 AND backup_id=$2 LIMIT 1",
        [ownerId, backupId],
    )).rowCount)
        throw new BoundaryError("BACKUP_PREDATES_DELETION");
}
