import { randomUUID } from "node:crypto";
import { z } from "zod";
import { BoundaryError, DeletionRequestSchema } from "@jarvis/shared";
import type { AuthorizationV3 } from "@jarvis/security";
import { currentDataTransaction } from "./transaction.js";
import type { ObjectStorage } from "./objects.js";

/** Trusted, transaction-only primitive. Call after the J0.3 permit is consumed. */
export async function retireObjects(
    auth: AuthorizationV3,
    deletionId: string,
    objectIds: readonly string[],
) {
    if (
        auth.capability !== "data.delete" ||
        !auth.approvalId ||
        auth.assurance !== "A3"
    )
        throw new BoundaryError("OWNER_DELETE_APPROVAL_REQUIRED");
    const tx = currentDataTransaction();
    if (
        objectIds.length &&
        (
            await tx.query(
                "SELECT 1 FROM storage.record_catalog c WHERE c.owner_id=$1 AND c.domain='attachment' AND c.deleted=false AND NOT EXISTS(SELECT 1 FROM storage.attachment_objects l WHERE l.owner_id=c.owner_id AND l.attachment_id=c.id) LIMIT 1",
                [auth.ownerId],
            )
        ).rowCount
    )
        throw new BoundaryError("ATTACHMENT_LINKAGE_MIGRATION_REQUIRED");
    for (const objectId of objectIds) {
        z.uuid().parse(objectId);
        const row = (
            await tx.query<{
                object_key: string;
                data_class: string;
                deleted: boolean;
            }>(
                "SELECT object_key,data_class,deleted FROM storage.objects WHERE owner_id=$1 AND id=$2 FOR UPDATE",
                [auth.ownerId, objectId],
            )
        ).rows[0];
        if (
            !row ||
            row.deleted ||
            Number(row.data_class.slice(1)) > Number(auth.zone.slice(1))
        )
            throw new BoundaryError("OBJECT_DELETE_SCOPE_DENIED");
        if (
            (
                await tx.query(
                    "SELECT 1 FROM storage.attachment_objects WHERE owner_id=$1 AND object_id=$2 LIMIT 1",
                    [auth.ownerId, objectId],
                )
            ).rowCount
        )
            throw new BoundaryError("OBJECT_STILL_REFERENCED");
        await tx.query(
            "UPDATE storage.objects SET deleted=true,metadata=$3 WHERE owner_id=$1 AND id=$2",
            [auth.ownerId, objectId, '{"deleted":true}'],
        );
        await tx.query(
            "DELETE FROM storage.object_versions WHERE owner_id=$1 AND object_id=$2",
            [auth.ownerId, objectId],
        );
        await tx.query(
            "INSERT INTO storage.deletion_tombstones(owner_id,record_id,deleted_at,deletion_id) VALUES($1,$2,now(),$3) ON CONFLICT DO NOTHING",
            [auth.ownerId, objectId, deletionId],
        );
        await tx.query(
            "INSERT INTO storage.object_purges(id,owner_id,deletion_id,object_id,object_key,state) VALUES($1,$2,$3,$4,$5,'PENDING')",
            [randomUUID(), auth.ownerId, deletionId, objectId, row.object_key],
        );
    }
}

/** Files are purged only after a separately committed revocation transaction. */
export class ObjectDeletion {
    constructor(private readonly objects: ObjectStorage) {}
    private approved(auth: AuthorizationV3) {
        if (
            auth.capability !== "data.delete" ||
            !auth.approvalId ||
            auth.assurance !== "A3"
        )
            throw new BoundaryError("OWNER_DELETE_APPROVAL_REQUIRED");
    }
    async request(auth: AuthorizationV3, objectId: string) {
        this.approved(auth);
        z.uuid().parse(objectId);
        const deletion = DeletionRequestSchema.parse({
            version: 1,
            id: randomUUID(),
            ownerId: auth.ownerId,
            targetId: objectId,
            authorizationId: auth.id,
            createdAt: Date.now(),
            state: "DELETING",
            affectedIds: [objectId],
            backupExpiryRequired: true,
        });
        await currentDataTransaction().query(
            "INSERT INTO storage.deletion_requests(id,owner_id,payload) VALUES($1,$2,$3)",
            [deletion.id, auth.ownerId, JSON.stringify(deletion)],
        );
        await retireObjects(auth, deletion.id, [objectId]);
        return deletion;
    }
    async purge(auth: AuthorizationV3, deletionId: string) {
        this.approved(auth);
        z.uuid().parse(deletionId);
        const tx = currentDataTransaction();
        const row = (
            await tx.query<{ payload: string }>(
                "SELECT payload FROM storage.deletion_requests WHERE owner_id=$1 AND id=$2 FOR UPDATE",
                [auth.ownerId, deletionId],
            )
        ).rows[0];
        if (!row) throw new BoundaryError("DELETION_NOT_FOUND");
        const deletion = DeletionRequestSchema.parse(JSON.parse(row.payload));
        if (
            deletion.ownerId !== auth.ownerId ||
            deletion.id !== deletionId ||
            !["DELETING", "PURGED"].includes(deletion.state)
        )
            throw new BoundaryError("DELETION_STATE_INVALID");
        const pending = (
            await tx.query<{
                id: string;
                object_id: string;
                object_key: string;
            }>(
                "SELECT id,object_id,object_key FROM storage.object_purges WHERE owner_id=$1 AND deletion_id=$2 AND state='PENDING' ORDER BY id FOR UPDATE",
                [auth.ownerId, deletionId],
            )
        ).rows;
        if (pending.length > 100) throw new BoundaryError("OBJECT_PURGE_LIMIT");
        if (deletion.state === "DELETING" && pending.length === 0)
            throw new BoundaryError("DELETION_PURGE_EVIDENCE_MISSING");
        // Validate the entire target set before touching any filesystem byte.
        for (const ticket of pending) {
            const object = (
                await tx.query<{
                    deleted: boolean;
                    object_key: string;
                    data_class: string;
                }>(
                    "SELECT deleted,object_key,data_class FROM storage.objects WHERE owner_id=$1 AND id=$2",
                    [auth.ownerId, ticket.object_id],
                )
            ).rows[0];
            if (
                !object?.deleted ||
                object.object_key !== ticket.object_key ||
                Number(object.data_class.slice(1)) > Number(auth.zone.slice(1))
            )
                throw new BoundaryError("OBJECT_PURGE_TARGET_INVALID");
            if (
                (
                    await tx.query(
                        "SELECT 1 FROM storage.attachment_objects WHERE owner_id=$1 AND object_id=$2 LIMIT 1",
                        [auth.ownerId, ticket.object_id],
                    )
                ).rowCount
            )
                throw new BoundaryError("OBJECT_STILL_REFERENCED");
        }
        for (const ticket of pending) {
            try {
                await this.objects.delete(auth.ownerId, ticket.object_key);
            } catch (error) {
                // A prior interrupted purge may already have removed an inactive file.
                if (!(
                    error instanceof Error &&
                    "code" in error &&
                    error.code === "ENOENT"
                ))
                    throw error;
            }
            if (
                (await this.objects.list(auth.ownerId)).includes(
                    ticket.object_key,
                )
            )
                throw new BoundaryError("OBJECT_PURGE_VERIFICATION_FAILED");
            await tx.query(
                "UPDATE storage.object_purges SET state='PURGED',purged_at=now() WHERE owner_id=$1 AND id=$2",
                [auth.ownerId, ticket.id],
            );
        }
        deletion.state = "PURGED";
        await tx.query(
            "UPDATE storage.deletion_requests SET payload=$3 WHERE owner_id=$1 AND id=$2",
            [auth.ownerId, deletionId, JSON.stringify(deletion)],
        );
        return deletion;
    }
}
