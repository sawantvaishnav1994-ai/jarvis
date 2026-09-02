import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { z } from "zod";
import { ActorSchema, type Actor } from "@jarvis/identity";
import {
    BoundaryError,
    EnvironmentSchema,
    IdentifierSchema,
    DataPolicySchema,
    isDurablyStorable,
} from "@jarvis/shared";
import { immutableJson, policyDigest } from "./policy.js";
import type { SecretManager, SecretLease } from "./secrets.js";

export const EnvelopeBindingSchema = z.strictObject({
    version: z.literal(1),
    ownerId: IdentifierSchema,
    environment: EnvironmentSchema,
    domain: z.enum([
        "conversations",
        "memory",
        "knowledge",
        "projects",
        "files",
        "settings",
    ]),
    recordId: z.uuid(),
    recordVersion: z.number().int().positive(),
    policy: DataPolicySchema,
});
export type EnvelopeBinding = z.infer<typeof EnvelopeBindingSchema>;
const Base64Url = z.string().regex(/^[A-Za-z0-9_-]*$/);
const BoxSchema = z.strictObject({
    nonce: Base64Url.length(16),
    tag: Base64Url.length(22),
    ciphertext: Base64Url.max(64000),
});
export const EncryptedEnvelopeSchema = z.strictObject({
    version: z.literal(1),
    scheme: z.literal("jarvis-envelope-aes-256-gcm-v1"),
    keyId: IdentifierSchema,
    bindingHash: z.string().regex(/^[a-f0-9]{64}$/),
    payload: BoxSchema,
    wrappedKey: BoxSchema.extend({ ciphertext: Base64Url.length(43) }),
});
export type EncryptedEnvelope = z.infer<typeof EncryptedEnvelopeSchema>;
type Box = z.infer<typeof BoxSchema>;
type KeyPurpose = "wrap" | "unwrap";
/** Trusted storage-side dependency, never exposed as a model/agent tool. */
export interface EnvelopeKeyProvider {
    readonly activeKeyId: string;
    lease(
        keyId: string,
        purpose: KeyPurpose,
        binding: EnvelopeBinding,
    ): Promise<SecretLease>;
}
const RegistrySchema = z
    .array(
        z.strictObject({
            id: IdentifierSchema,
            handle: z
                .string()
                .regex(
                    /^secret:\/\/development\/storage\/kek\/[a-zA-Z0-9._-]+$/,
                ),
            state: z.enum(["created", "active", "retired", "destroyed"]),
        }),
    )
    .min(1)
    .max(100)
    .refine(
        (entries) =>
            entries.filter((e) => e.state === "active").length === 1 &&
            new Set(entries.map((e) => e.id)).size === entries.length &&
            new Set(entries.map((e) => e.handle)).size === entries.length,
        "Key registry requires one active key and unique IDs/handles",
    );
export type EnvelopeKeyRegistry = z.infer<typeof RegistrySchema>;

/** Immutable development key-ring snapshot. Lifecycle changes need a separate authorized ceremony. */
export class VaultEnvelopeKeys implements EnvelopeKeyProvider {
    readonly activeKeyId: string;
    private readonly entries: EnvelopeKeyRegistry;
    private readonly actor: Actor;
    private readonly ownerId: string;
    constructor(
        private readonly vault: SecretManager,
        ownerId: string,
        actor: Actor,
        entries: unknown,
    ) {
        this.ownerId = IdentifierSchema.parse(ownerId);
        this.actor = immutableJson(ActorSchema.parse(actor));
        if (
            this.actor.environment !== "development" ||
            this.actor.kind !== "service" ||
            this.actor.ownerId !== this.ownerId
        )
            throw new BoundaryError("KEY_SERVICE_DENIED");
        this.entries = immutableJson(RegistrySchema.parse(entries));
        this.activeKeyId = this.entries.find((e) => e.state === "active")!.id;
        Object.freeze(this);
    }
    async lease(
        keyId: string,
        purpose: KeyPurpose,
        binding: EnvelopeBinding,
    ): Promise<SecretLease> {
        const b = EnvelopeBindingSchema.parse(binding);
        const entry = this.entries.find((e) => e.id === keyId);
        if (
            b.ownerId !== this.ownerId ||
            b.environment !== this.actor.environment ||
            !entry ||
            (purpose !== "wrap" && purpose !== "unwrap") ||
            (purpose === "wrap"
                ? entry.state !== "active"
                : !["active", "retired"].includes(entry.state))
        )
            throw new BoundaryError("KEY_SCOPE_OR_STATE_DENIED");
        const parent = await this.vault.lease(
            entry.handle.slice("secret://".length),
            this.actor,
        );
        try {
            if (!/^[a-f0-9]{64}$/.test(parent.value.toString("utf8")))
                throw new BoundaryError("INVALID_ENVELOPE_KEY");
            const value = Buffer.from(parent.value.toString("utf8"), "hex");
            const expiresAt = parent.expiresAt;
            const timer = setTimeout(
                () => value.fill(0),
                Math.max(0, expiresAt - Date.now()),
            );
            timer.unref();
            return {
                value,
                expiresAt,
                destroy() {
                    clearTimeout(timer);
                    value.fill(0);
                },
            };
        } finally {
            parent.destroy();
        }
    }
}

function bytes(encoded: string, length?: number): Buffer {
    const value = Buffer.from(encoded, "base64url");
    if (
        value.toString("base64url") !== encoded ||
        (length !== undefined && value.length !== length)
    )
        throw new BoundaryError("INVALID_ENVELOPE_ENCODING");
    return value;
}
function seal(key: Buffer, plaintext: Buffer, aad: string): Box {
    const nonce = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, nonce, {
            authTagLength: 16,
        });
    cipher.setAAD(Buffer.from(aad));
    return {
        nonce: nonce.toString("base64url"),
        ciphertext: Buffer.concat([
            cipher.update(plaintext),
            cipher.final(),
        ]).toString("base64url"),
        tag: cipher.getAuthTag().toString("base64url"),
    };
}
function open(key: Buffer, box: Box, aad: string): Buffer {
    const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes(box.nonce, 12),
        { authTagLength: 16 },
    );
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(bytes(box.tag, 16));
    const partial = decipher.update(bytes(box.ciphertext));
    try {
        return Buffer.concat([partial, decipher.final()]);
    } finally {
        partial.fill(0);
    }
}
function wrapAAD(bindingHash: string, keyId: string, payload: Box): string {
    return (
        "jarvis.envelope.wrap.v1:" +
        policyDigest({ bindingHash, keyId, payload })
    );
}
export class EnvelopeCipher {
    constructor(
        private readonly keys: EnvelopeKeyProvider,
        private readonly clock: () => number = Date.now,
    ) {}
    private binding(input: EnvelopeBinding): EnvelopeBinding {
        const b = immutableJson(EnvelopeBindingSchema.parse(input));
        if (!isDurablyStorable(b.policy, this.clock()))
            throw new BoundaryError("DATA_RETENTION_OR_CLASS_DENIED");
        return b;
    }
    private async key<T>(
        id: string,
        purpose: KeyPurpose,
        binding: EnvelopeBinding,
        use: (key: Buffer) => T,
    ): Promise<T> {
        const lease = await this.keys.lease(id, purpose, binding);
        try {
            if (
                lease.value.length !== 32 ||
                !Number.isSafeInteger(lease.expiresAt) ||
                lease.expiresAt <= this.clock()
            )
                throw new BoundaryError("KEY_LEASE_INVALID");
            // Recheck expiry/retention after asynchronous key retrieval.
            this.binding(binding);
            const key = Buffer.from(lease.value);
            try {
                return use(key);
            } finally {
                key.fill(0);
            }
        } finally {
            lease.destroy();
        }
    }
    async encrypt(
        input: unknown,
        binding: EnvelopeBinding,
    ): Promise<EncryptedEnvelope> {
        const b = this.binding(binding),
            value = immutableJson(input);
        const plaintext = Buffer.from(JSON.stringify(value));
        if (plaintext.length > 48000) {
            plaintext.fill(0);
            throw new BoundaryError("ENVELOPE_TOO_LARGE");
        }
        const dataKey = randomBytes(32),
            keyId = IdentifierSchema.parse(this.keys.activeKeyId),
            bindingHash = policyDigest(b);
        try {
            const payload = seal(
                dataKey,
                plaintext,
                "jarvis.envelope.data.v1:" + bindingHash,
            );
            const wrappedKey = await this.key(keyId, "wrap", b, (key) =>
                seal(key, dataKey, wrapAAD(bindingHash, keyId, payload)),
            );
            return immutableJson(
                EncryptedEnvelopeSchema.parse({
                    version: 1,
                    scheme: "jarvis-envelope-aes-256-gcm-v1",
                    keyId,
                    bindingHash,
                    payload,
                    wrappedKey,
                }),
            );
        } finally {
            dataKey.fill(0);
            plaintext.fill(0);
        }
    }
    private async unwrap(
        input: unknown,
        binding: EnvelopeBinding,
    ): Promise<{
        envelope: EncryptedEnvelope;
        dataKey: Buffer;
        binding: EnvelopeBinding;
    }> {
        const b = this.binding(binding),
            envelope = immutableJson(EncryptedEnvelopeSchema.parse(input));
        if (envelope.bindingHash !== policyDigest(b))
            throw new BoundaryError("ENVELOPE_BINDING_MISMATCH");
        const dataKey = await this.key(envelope.keyId, "unwrap", b, (key) =>
            open(
                key,
                envelope.wrappedKey,
                wrapAAD(envelope.bindingHash, envelope.keyId, envelope.payload),
            ),
        );
        if (dataKey.length !== 32) {
            dataKey.fill(0);
            throw new BoundaryError("INVALID_DATA_KEY");
        }
        return { envelope, dataKey, binding: b };
    }
    async decrypt(input: unknown, binding: EnvelopeBinding): Promise<unknown> {
        try {
            const { envelope, dataKey } = await this.unwrap(input, binding);
            try {
                const plaintext = open(
                    dataKey,
                    envelope.payload,
                    "jarvis.envelope.data.v1:" + envelope.bindingHash,
                );
                try {
                    return z
                        .json()
                        .parse(JSON.parse(plaintext.toString("utf8")));
                } finally {
                    plaintext.fill(0);
                }
            } finally {
                dataKey.fill(0);
            }
        } catch {
            throw new BoundaryError("ENVELOPE_AUTHENTICATION_FAILED");
        }
    }
    /** Returns a replacement envelope; does not mutate storage or destroy the old key. */
    async rewrap(
        input: unknown,
        binding: EnvelopeBinding,
    ): Promise<EncryptedEnvelope> {
        try {
            const {
                envelope,
                dataKey,
                binding: b,
            } = await this.unwrap(input, binding);
            try {
                const keyId = IdentifierSchema.parse(this.keys.activeKeyId);
                const wrappedKey = await this.key(keyId, "wrap", b, (key) =>
                    seal(
                        key,
                        dataKey,
                        wrapAAD(envelope.bindingHash, keyId, envelope.payload),
                    ),
                );
                return immutableJson({ ...envelope, keyId, wrappedKey });
            } finally {
                dataKey.fill(0);
            }
        } catch {
            throw new BoundaryError("ENVELOPE_REWRAP_FAILED");
        }
    }
}
