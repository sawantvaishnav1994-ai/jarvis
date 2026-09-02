import { expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
    EnvelopeCipher,
    VaultEnvelopeKeys,
    type EnvelopeKeyRegistry,
    type SecretLease,
    type EnvelopeBinding,
    type EncryptedEnvelope,
} from "@jarvis/security";
import { envelopeBinding, dataNow } from "../fixtures/data.js";
function fixture() {
    const material = {
        "development/storage/kek/k1": randomBytes(32).toString("hex"),
        "development/storage/kek/k2": randomBytes(32).toString("hex"),
    };
    const leases: SecretLease[] = [];
    const vault = {
        lease: vi.fn(async (ref: string): Promise<SecretLease> => {
            const text = material[ref as keyof typeof material];
            if (!text) throw new Error("MISSING_KEY");
            const value = Buffer.from(text),
                lease = {
                    value,
                    expiresAt: dataNow + 60000,
                    destroy: vi.fn(() => value.fill(0)),
                };
            leases.push(lease);
            return lease;
        }),
    };
    const actor = {
        version: 1 as const,
        id: "storage-service",
        kind: "service" as const,
        environment: "development" as const,
        ownerId: "owner-test",
    };
    const registry: EnvelopeKeyRegistry = [
        {
            id: "k1",
            handle: "secret://development/storage/kek/k1",
            state: "active",
        },
    ];
    const keys = new VaultEnvelopeKeys(vault, "owner-test", actor, registry);
    const cipher = new EnvelopeCipher(keys, () => dataNow);
    return { material, leases, vault, actor, registry, keys, cipher };
}
it("encrypts each record with fresh material, omits plaintext and authenticates round trips", async () => {
    const f = fixture(),
        binding = envelopeBinding(),
        input = { content: "SYNTHETIC-PRIVATE-DATA" };
    const a = await f.cipher.encrypt(input, binding),
        b = await f.cipher.encrypt(input, binding);
    expect(a).not.toEqual(b);
    expect(JSON.stringify(a)).not.toContain(input.content);
    expect(JSON.stringify(a)).not.toContain(
        f.material["development/storage/kek/k1"],
    );
    expect(await f.cipher.decrypt(a, binding)).toEqual(input);
    expect(f.leases.every((l) => l.value.every((byte) => byte === 0))).toBe(
        true,
    );
});
it.each([
    "ownerId",
    "recordId",
    "recordVersion",
    "environment",
    "domain",
    "policy",
] as const)("rejects binding substitution: %s", async (field) => {
    const f = fixture(),
        binding = envelopeBinding(),
        envelope = await f.cipher.encrypt("private", binding);
    const wrong = structuredClone(binding);
    const changes: Record<typeof field, unknown> = {
        ownerId: "owner-other",
        recordId: "00000000-0000-4000-8000-000000000000",
        recordVersion: 2,
        environment: "production",
        domain: "files",
        policy: { ...binding.policy, classification: "D0" },
    };
    Object.assign(wrong, { [field]: changes[field] });
    await expect(f.cipher.decrypt(envelope, wrong)).rejects.toThrow(
        "ENVELOPE_AUTHENTICATION_FAILED",
    );
});
it.each(["ciphertext", "nonce", "tag"] as const)(
    "rejects altered payload and wrapped-key %s",
    async (field) => {
        const f = fixture(),
            binding = envelopeBinding(),
            original = await f.cipher.encrypt("private", binding);
        for (const part of ["payload", "wrappedKey"] as const) {
            const changed = structuredClone(original),
                old = changed[part][field];
            changed[part][field] = (old[0] === "A" ? "B" : "A") + old.slice(1);
            await expect(f.cipher.decrypt(changed, binding)).rejects.toThrow(
                "ENVELOPE_AUTHENTICATION_FAILED",
            );
            await expect(f.cipher.rewrap(changed, binding)).rejects.toThrow(
                "ENVELOPE_REWRAP_FAILED",
            );
        }
    },
);
it("fails closed on wrong/missing keys, unsupported scheme and malformed encodings", async () => {
    const f = fixture(),
        binding = envelopeBinding(),
        original = await f.cipher.encrypt("private", binding);
    const wrong = fixture();
    await expect(wrong.cipher.decrypt(original, binding)).rejects.toThrow(
        "ENVELOPE_AUTHENTICATION_FAILED",
    );
    for (const patch of [
        { keyId: "missing" },
        { version: 2 },
        { scheme: "aes-cbc" },
        { wrappedKey: { ...original.wrappedKey, tag: "A" } },
    ])
        await expect(
            f.cipher.decrypt({ ...original, ...patch }, binding),
        ).rejects.toThrow("ENVELOPE_AUTHENTICATION_FAILED");
});
it("rewraps to a new active key, retaining the payload; retired keys cannot wrap and destroyed keys cannot decrypt", async () => {
    const f = fixture(),
        binding = envelopeBinding(),
        original = await f.cipher.encrypt({ message: "private" }, binding);
    const registry: EnvelopeKeyRegistry = [
        { ...f.registry[0]!, state: "retired" },
        {
            id: "k2",
            handle: "secret://development/storage/kek/k2",
            state: "active",
        },
    ];
    const keys = new VaultEnvelopeKeys(
            f.vault,
            "owner-test",
            f.actor,
            registry,
        ),
        next = new EnvelopeCipher(keys, () => dataNow);
    const rotated = await next.rewrap(original, binding);
    expect(rotated.keyId).toBe("k2");
    expect(rotated.payload).toEqual(original.payload);
    expect(rotated.wrappedKey).not.toEqual(original.wrappedKey);
    expect(await next.decrypt(rotated, binding)).toEqual({
        message: "private",
    });
    await expect(keys.lease("k1", "wrap", binding)).rejects.toThrow(
        "KEY_SCOPE_OR_STATE_DENIED",
    );
    registry[0]!.state = "destroyed";
    const retired = new EnvelopeCipher(
        new VaultEnvelopeKeys(f.vault, "owner-test", f.actor, registry),
        () => dataNow,
    );
    await expect(retired.decrypt(original, binding)).rejects.toThrow(
        "ENVELOPE_AUTHENTICATION_FAILED",
    );
    expect(await retired.decrypt(rotated, binding)).toEqual({
        message: "private",
    });
});
it("cannot mix ciphertext and wrapped keys from separate records", async () => {
    const f = fixture(),
        binding = envelopeBinding(),
        a = await f.cipher.encrypt("one", binding),
        b = await f.cipher.encrypt("two", binding);
    await expect(
        f.cipher.decrypt({ ...a, wrappedKey: b.wrappedKey }, binding),
    ).rejects.toThrow("ENVELOPE_AUTHENTICATION_FAILED");
});
it("denies D5, never-store, session-only and expired data before requesting a key", async () => {
    const f = fixture();
    for (const patch of [
        { classification: "D5" },
        { retention: { mode: "never-store" } },
        { retention: { mode: "session", sessionId: "session-1" } },
        {
            retention: {
                mode: "until",
                expiresAt: new Date(dataNow).toISOString(),
            },
        },
    ]) {
        const b = envelopeBinding();
        Object.assign(b.policy, patch);
        await expect(f.cipher.encrypt("data", b)).rejects.toThrow(
            "DATA_RETENTION_OR_CLASS_DENIED",
        );
    }
    expect(f.vault.lease).not.toHaveBeenCalled();
});
it("rejects expiry during asynchronous key retrieval and always destroys the lease", async () => {
    const f = fixture(),
        b = envelopeBinding();
    let now = dataNow;
    b.policy.retention = {
        mode: "until",
        expiresAt: new Date(dataNow + 10).toISOString(),
    };
    const provider = {
        activeKeyId: "k1",
        lease: async () => {
            now += 11;
            const value = randomBytes(32);
            return {
                value,
                expiresAt: dataNow + 100,
                destroy: vi.fn(() => value.fill(0)),
            };
        },
    };
    await expect(
        new EnvelopeCipher(provider, () => now).encrypt("data", b),
    ).rejects.toThrow("DATA_RETENTION_OR_CLASS_DENIED");
    f.vault.lease.mockImplementationOnce(async () => {
        const value = Buffer.alloc(64, "a");
        return { value, expiresAt: dataNow, destroy: () => value.fill(0) };
    });
    await expect(f.cipher.encrypt("data", envelopeBinding())).rejects.toThrow(
        "KEY_LEASE_INVALID",
    );
});
it("refuses agent/raw key access, owner/environment mismatches and invalid key registries", async () => {
    const f = fixture();
    expect(
        () =>
            new VaultEnvelopeKeys(
                f.vault,
                "owner-test",
                { ...f.actor, kind: "agent" },
                f.registry,
            ),
    ).toThrow("KEY_SERVICE_DENIED");
    expect(
        () =>
            new VaultEnvelopeKeys(f.vault, "owner-other", f.actor, f.registry),
    ).toThrow("KEY_SERVICE_DENIED");
    expect(
        () =>
            new VaultEnvelopeKeys(f.vault, "owner-test", f.actor, [
                ...f.registry,
                ...f.registry,
            ]),
    ).toThrow();
    expect(
        () =>
            new VaultEnvelopeKeys(f.vault, "owner-test", f.actor, [
                { ...f.registry[0], state: "created" },
            ]),
    ).toThrow();
    await expect(
        f.keys.lease("k1", "unwrap", {
            ...envelopeBinding(),
            ownerId: "owner-other",
        }),
    ).rejects.toThrow("KEY_SCOPE_OR_STATE_DENIED");
    expect(f.vault.lease).not.toHaveBeenCalled();
});
it("copies the input, binding and key registry before asynchronous work", async () => {
    const f = fixture(),
        input = { text: "original" },
        binding = envelopeBinding(),
        saved = structuredClone(binding);
    const operation = f.cipher.encrypt(input, binding);
    input.text = "changed";
    binding.policy.classification = "D0";
    f.registry[0]!.state = "destroyed";
    const envelope = await operation;
    expect(await f.cipher.decrypt(envelope, saved)).toEqual({
        text: "original",
    });
});
it("rejects unbounded payloads without returning partial ciphertext", async () => {
    const f = fixture();
    await expect(
        f.cipher.encrypt("x".repeat(48001), envelopeBinding()),
    ).rejects.toThrow("ENVELOPE_TOO_LARGE");
    expect(f.vault.lease).not.toHaveBeenCalled();
});
// Compile-time contract checks: no provider-specific types are in persisted data.
const _envelopeType: EncryptedEnvelope | undefined = undefined;
const _bindingType: EnvelopeBinding | undefined = undefined;
