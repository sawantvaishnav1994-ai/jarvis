import { KeyMetadataSchema, BoundaryError } from "@jarvis/shared";
import {
    EnvelopeCipher,
    VaultEnvelopeKeys,
    RecordCipher,
    type SecretManager,
    type EnvelopeKeyRegistry,
    EnvelopeBindingSchema,
    type AuthorizationV3,
} from "@jarvis/security";
import { currentDataTransaction } from "./transaction.js";

export class DataKeys {
    constructor(
        private readonly vault: SecretManager,
        private readonly actorId: string,
        private readonly metadataCipher: RecordCipher,
    ) {}
    async metadata(ownerId: string) {
        const tx = currentDataTransaction();
        let rows = (
            await tx.query<{ id: string; payload: string }>(
                "SELECT id,payload FROM security.key_metadata WHERE owner_id=$1 ORDER BY id",
                [ownerId],
            )
        ).rows;
        if (!rows.length) {
            for (const [id, state, keyVersion] of [
                ["k1", "ACTIVE", 1],
                ["k2", "CREATED", 2],
            ] as const) {
                const meta = KeyMetadataSchema.parse({
                    version: 1,
                    id,
                    keyVersion,
                    ownerId,
                    role: "kek",
                    state,
                    createdAt: Date.now(),
                    activatedAt: state === "ACTIVE" ? Date.now() : null,
                    rotatedAt: null,
                    retiredAt: null,
                    destroyedAt: null,
                    domain: "storage",
                    backingStore: "local-vault",
                    algorithm: "aes-256-gcm",
                    purposes: ["wrap", "unwrap"],
                    recoveryPolicy: "separate-owner-key-kit",
                });
                await tx.query(
                    "INSERT INTO security.key_metadata(id,owner_id,payload) VALUES($1,$2,$3)",
                    [
                        id,
                        ownerId,
                        this.metadataCipher.encrypt(meta, "storage:key:" + id),
                    ],
                );
            }
            rows = (
                await tx.query<{ id: string; payload: string }>(
                    "SELECT id,payload FROM security.key_metadata WHERE owner_id=$1 ORDER BY id",
                    [ownerId],
                )
            ).rows;
        }
        return rows.map((r) =>
            KeyMetadataSchema.parse(
                this.metadataCipher.decrypt(r.payload, "storage:key:" + r.id),
            ),
        );
    }
    async cipher(ownerId: string) {
        const metadata = await this.metadata(ownerId);
        const entries: EnvelopeKeyRegistry = metadata.map((m) => {
            if (
                m.ownerId !== ownerId ||
                m.role !== "kek" ||
                !["CREATED", "ACTIVE", "RETIRED", "DESTROYED"].includes(m.state)
            )
                throw new BoundaryError("KEY_STATE_INVALID");
            return {
                id: m.id,
                handle: `secret://development/storage/kek/${m.id}`,
                state: m.state.toLowerCase() as EnvelopeKeyRegistry[number]["state"],
            };
        });
        return new EnvelopeCipher(
            new VaultEnvelopeKeys(
                this.vault,
                ownerId,
                {
                    version: 1,
                    id: this.actorId,
                    kind: "service",
                    environment: "development",
                    ownerId,
                },
                entries,
            ),
        );
    }
    async rotate(auth: AuthorizationV3) {
        if (
            auth.capability !== "storage.keys.rotate" ||
            !auth.approvalId ||
            auth.assurance !== "A3"
        )
            throw new BoundaryError("KEY_ROTATION_APPROVAL_REQUIRED");
        const tx = currentDataTransaction(),
            metadata = await this.metadata(auth.ownerId);
        if (
            metadata.find((m) => m.id === "k1")?.state !== "ACTIVE" ||
            metadata.find((m) => m.id === "k2")?.state !== "CREATED"
        )
            throw new BoundaryError("KEY_ROTATION_STATE_INVALID");
        for (const m of metadata) {
            m.state = m.id === "k2" ? "ACTIVE" : "RETIRED";
            m.rotatedAt = Date.now();
            if (m.state === "ACTIVE") m.activatedAt = Date.now();
            else m.retiredAt = Date.now();
            await tx.query(
                "UPDATE security.key_metadata SET payload=$1 WHERE id=$2 AND owner_id=$3",
                [
                    this.metadataCipher.encrypt(m, "storage:key:" + m.id),
                    m.id,
                    auth.ownerId,
                ],
            );
        }
        const cipher = await this.cipher(auth.ownerId);
        const tables = [
            "conversations.conversations",
            "conversations.messages",
            "conversations.attachments",
            "knowledge.entities",
            "knowledge.relationships",
            "knowledge.relationship_evidence",
            "projects.records",
            "settings.owner_records",
            "memory.records",
            "memory.embeddings",
            "storage.record_versions",
        ];
        let count = 0;
        for (const table of tables) {
            const payload =
                    table === "memory.embeddings"
                        ? "encrypted_payload"
                        : "payload",
                meta = table.startsWith("memory.")
                    ? "storage_metadata"
                    : "metadata",
                id = table === "storage.record_versions" ? "record_id" : "id";
            const rows = (
                await tx.query<{
                    id: string;
                    payload: string;
                    metadata: unknown;
                    revision?: number;
                }>(
                    `SELECT ${id} AS id,${payload} AS payload,${meta} AS metadata${table === "storage.record_versions" ? ",revision" : ""} FROM ${table} WHERE owner_id=$1 AND ${meta} IS NOT NULL`,
                    [auth.ownerId],
                )
            ).rows;
            for (const row of rows) {
                const envelope = await cipher.rewrap(
                    JSON.parse(row.payload),
                    EnvelopeBindingSchema.parse(row.metadata),
                );
                await tx.query(
                    `UPDATE ${table} SET ${payload}=$1 WHERE owner_id=$2 AND ${id}=$3${table === "storage.record_versions" ? " AND revision=$4" : ""}`,
                    [
                        JSON.stringify(envelope),
                        auth.ownerId,
                        row.id,
                        ...(row.revision === undefined ? [] : [row.revision]),
                    ],
                );
                count++;
            }
        }
        return { activeKeyId: "k2", rewrapped: count, oldKeyState: "RETIRED" };
    }
}
