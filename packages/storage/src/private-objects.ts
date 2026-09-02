import { z } from "zod";
import {
    BoundaryError,
    DataPolicySchema,
    ObjectMetadataSchema,
} from "@jarvis/shared";
import {
    EnvelopeBindingSchema,
    RecordCipher,
    rejectGenericSecrets,
    type AuthorizationV3,
    type EnvelopeCipher,
} from "@jarvis/security";
import { currentDataTransaction } from "./transaction.js";
import { storageHash, type ObjectStorage } from "./objects.js";

export const ObjectUploadSchema = z.strictObject({
    id: z.uuid(),
    filename: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(100),
    contentBase64: z.string().max(24000),
    policy: DataPolicySchema,
});
export class PrivateObjects {
    constructor(
        readonly store: ObjectStorage,
        private readonly cipher: (ownerId: string) => Promise<EnvelopeCipher>,
        private readonly metadataCipher: RecordCipher,
    ) {}
    async put(auth: AuthorizationV3, raw: unknown) {
        const v = ObjectUploadSchema.parse(raw),
            bytes = Buffer.from(v.contentBase64, "base64");
        if (
            v.policy.classification === "D5" ||
            !v.policy.consent.keepAttachments ||
            bytes.length > 16000 ||
            bytes.toString("base64") !== v.contentBase64
        )
            throw new BoundaryError("OBJECT_INPUT_DENIED");
        rejectGenericSecrets(bytes.toString("utf8"));
        rejectGenericSecrets({ filename: v.filename, mimeType: v.mimeType });
        if (
            (
                await currentDataTransaction().query(
                    "SELECT 1 FROM storage.record_catalog WHERE id=$1",
                    [v.id],
                )
            ).rowCount
        )
            throw new BoundaryError("DATA_ID_CONFLICT");
        const binding = EnvelopeBindingSchema.parse({
            version: 1,
            ownerId: auth.ownerId,
            environment: "development",
            domain: "files",
            recordId: v.id,
            recordVersion: 1,
            policy: v.policy,
        });
        const envelope = await (
            await this.cipher(auth.ownerId)
        ).encrypt({ contentBase64: v.contentBase64 }, binding);
        const encrypted = Buffer.from(
            JSON.stringify({ version: 1, binding, envelope }),
        );
        const key = await this.store.put(auth.ownerId, encrypted);
        const metadata = ObjectMetadataSchema.parse({
            version: 1,
            id: v.id,
            ownerId: auth.ownerId,
            filename: v.filename,
            mimeType: v.mimeType,
            size: bytes.length,
            contentHash: storageHash(bytes),
            ciphertextHash: key,
            classification: v.policy.classification,
            location: {
                version: 1,
                backend: "local-files",
                node: "primary",
                region: "local",
                key,
            },
            keyId: envelope.keyId,
            revision: 1,
            createdAt: Date.now(),
            deletionState: "ACTIVE",
        });
        const tx = currentDataTransaction(),
            payload = this.metadataCipher.encrypt(
                metadata,
                "storage:object:" + auth.ownerId + ":" + v.id,
            );
        await tx.query(
            "INSERT INTO storage.objects(id,owner_id,object_key,metadata,data_class) VALUES($1,$2,$3,$4,$5)",
            [v.id, auth.ownerId, key, payload, v.policy.classification],
        );
        await tx.query(
            "INSERT INTO storage.object_versions(id,owner_id,object_id,revision,payload) VALUES($1,$2,$1,1,$3)",
            [v.id, auth.ownerId, payload],
        );
        return {
            id: v.id,
            contentHash: metadata.contentHash,
            size: bytes.length,
        };
    }
    async get(auth: AuthorizationV3, id: string, classification: string) {
        z.uuid().parse(id);
        const row = (
            await currentDataTransaction().query<{
                metadata: string;
                object_key: string;
                data_class: string;
            }>(
                "SELECT metadata,object_key,data_class FROM storage.objects WHERE owner_id=$1 AND id=$2 AND deleted=false",
                [auth.ownerId, id],
            )
        ).rows[0];
        if (!row) throw new BoundaryError("OBJECT_NOT_FOUND");
        if (row.data_class !== classification)
            throw new BoundaryError("OBJECT_ZONE_MISMATCH");
        const metadata = ObjectMetadataSchema.parse(
            this.metadataCipher.decrypt(
                row.metadata,
                "storage:object:" + auth.ownerId + ":" + id,
            ),
        );
        const raw = JSON.parse(
            (await this.store.get(auth.ownerId, row.object_key)).toString(
                "utf8",
            ),
        );
        const binding = EnvelopeBindingSchema.parse(raw.binding);
        if (
            binding.ownerId !== auth.ownerId ||
            binding.recordId !== id ||
            binding.policy.classification !== classification ||
            binding.domain !== "files" ||
            binding.recordVersion !== metadata.revision
        )
            throw new BoundaryError("OBJECT_BINDING_MISMATCH");
        const value = z
            .strictObject({ contentBase64: z.string() })
            .parse(
                await (
                    await this.cipher(auth.ownerId)
                ).decrypt(raw.envelope, binding),
            );
        const bytes = Buffer.from(value.contentBase64, "base64");
        if (
            bytes.length !== metadata.size ||
            storageHash(bytes) !== metadata.contentHash
        )
            throw new BoundaryError("OBJECT_CONTENT_HASH_MISMATCH");
        return { metadata, contentBase64: value.contentBase64 };
    }
}
