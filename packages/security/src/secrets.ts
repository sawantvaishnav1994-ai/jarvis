import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import {
    readFile,
    writeFile,
    mkdir,
    lstat,
    rename,
    unlink,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { BoundaryError, type Environment } from "@jarvis/shared";
import { ActorSchema, type Actor } from "@jarvis/identity";
const BoxSchema = z.strictObject({
    nonce: z.string(),
    ciphertext: z.string(),
    tag: z.string(),
});
const VaultSchema = z.strictObject({
    version: z.literal(1),
    environment: z.enum(["development", "staging", "production"]),
    records: z.record(z.string(), BoxSchema),
});
export type SecretLease = { value: Buffer; expiresAt: number; destroy(): void };
export interface SecretManager {
    lease(ref: string, actor: Actor, ttlMs?: number): Promise<SecretLease>;
}
async function privateFile(path: string): Promise<Buffer> {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
        throw new BoundaryError("INSECURE_SECRET_FILE");
    return readFile(path);
}
async function privateDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const stat = await lstat(path);
    if (
        stat.isSymbolicLink() ||
        !stat.isDirectory() ||
        (stat.mode & 0o077) !== 0
    )
        throw new BoundaryError("INSECURE_SECRET_DIRECTORY");
}
export class RecordCipher {
    constructor(private readonly key: Buffer) {
        if (key.length !== 32)
            throw new BoundaryError("INVALID_ENCRYPTION_KEY");
    }
    encrypt(value: unknown, context: string): string {
        const nonce = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
        cipher.setAAD(Buffer.from(context));
        const ciphertext = Buffer.concat([
            cipher.update(JSON.stringify(value), "utf8"),
            cipher.final(),
        ]);
        return JSON.stringify({
            nonce: nonce.toString("base64"),
            ciphertext: ciphertext.toString("base64"),
            tag: cipher.getAuthTag().toString("base64"),
        });
    }
    decrypt(value: string, context: string): unknown {
        try {
            const box = BoxSchema.parse(JSON.parse(value));
            const decipher = createDecipheriv(
                "aes-256-gcm",
                this.key,
                Buffer.from(box.nonce, "base64"),
            );
            decipher.setAAD(Buffer.from(context));
            decipher.setAuthTag(Buffer.from(box.tag, "base64"));
            return JSON.parse(
                Buffer.concat([
                    decipher.update(Buffer.from(box.ciphertext, "base64")),
                    decipher.final(),
                ]).toString("utf8"),
            );
        } catch {
            throw new BoundaryError("CIPHERTEXT_AUTHENTICATION_FAILED");
        }
    }
}
export class FileSecretManager implements SecretManager {
    constructor(
        private readonly vaultPath: string,
        private readonly keyPath: string,
        private readonly environment: Environment,
        private readonly actorId: string,
        private readonly allowedRefs: ReadonlySet<string>,
    ) {}
    async lease(
        ref: string,
        actor: Actor,
        ttlMs = 30000,
    ): Promise<SecretLease> {
        ActorSchema.parse(actor);
        if (
            !Number.isInteger(ttlMs) ||
            ttlMs < 1 ||
            ttlMs > 60000 ||
            actor.environment !== this.environment ||
            actor.id !== this.actorId ||
            !["owner", "service", "core"].includes(actor.kind) ||
            !this.allowedRefs.has(ref) ||
            !ref.startsWith(this.environment + "/")
        )
            throw new BoundaryError("SECRET_SCOPE_DENIED");
        const key = await privateFile(this.keyPath);
        try {
            const vault = VaultSchema.parse(
                JSON.parse(
                    (await privateFile(this.vaultPath)).toString("utf8"),
                ),
            );
            if (vault.environment !== this.environment || !vault.records[ref])
                throw new BoundaryError("SECRET_UNAVAILABLE");
            const plaintext = new RecordCipher(key).decrypt(
                JSON.stringify(vault.records[ref]),
                "secret:" + ref,
            );
            if (typeof plaintext !== "string")
                throw new BoundaryError("INVALID_SECRET");
            const value = Buffer.from(plaintext, "utf8");
            const timer = setTimeout(() => value.fill(0), ttlMs);
            timer.unref();
            return {
                value,
                expiresAt: Date.now() + ttlMs,
                destroy() {
                    clearTimeout(timer);
                    value.fill(0);
                },
            };
        } finally {
            key.fill(0);
        }
    }
}
export async function initializeDevelopmentVault(
    vaultPath: string,
    keyPath: string,
): Promise<"created" | "existing"> {
    if (resolve(keyPath).startsWith(dirname(resolve(vaultPath)) + "/"))
        throw new BoundaryError("KEY_MUST_BE_SEPARATE");
    await privateDirectory(dirname(vaultPath));
    await privateDirectory(dirname(keyPath));
    try {
        await lstat(vaultPath);
        await privateFile(keyPath);
        return "existing";
    } catch (error) {
        if (!(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
        ))
            throw error;
    }
    let key: Buffer;
    try {
        key = await privateFile(keyPath);
    } catch (error) {
        if (!(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
        ))
            throw error;
        key = randomBytes(32);
        await writeFile(keyPath, key, { mode: 0o600, flag: "wx" });
    }
    try {
        const records: Record<string, z.infer<typeof BoxSchema>> = {};
        const cipher = new RecordCipher(key);
        for (const name of [
            "database/runtime",
            "database/migrator",
            "redis/runtime",
            "storage/data-key",
        ]) {
            const ref = "development/" + name;
            records[ref] = BoxSchema.parse(
                JSON.parse(
                    cipher.encrypt(
                        randomBytes(32).toString("hex"),
                        "secret:" + ref,
                    ),
                ),
            );
        }
        await writeFile(
            vaultPath,
            JSON.stringify({ version: 1, environment: "development", records }),
            { mode: 0o600, flag: "wx" },
        );
        return "created";
    } finally {
        key.fill(0);
    }
}
// Explicit, additive vault migration. Existing credentials and the master key
// are never rotated or replaced by installing identity support.
export async function ensureIdentitySecrets(
    vaultPath: string,
    keyPath: string,
): Promise<void> {
    const lock = vaultPath + ".identity-lock";
    await writeFile(lock, "identity-v1", { flag: "wx", mode: 0o600 });
    const temporary = vaultPath + ".identity-" + randomBytes(8).toString("hex");
    let key: Buffer | undefined;
    try {
        key = await privateFile(keyPath);
        const vault = VaultSchema.parse(
            JSON.parse((await privateFile(vaultPath)).toString("utf8")),
        );
        if (vault.environment !== "development")
            throw new BoundaryError("ENVIRONMENT_NOT_ENABLED");
        const cipher = new RecordCipher(key);
        let changed = false;
        for (const ref of [
            "development/identity/bootstrap",
            "development/identity/web-transport",
        ]) {
            if (vault.records[ref]) {
                cipher.decrypt(
                    JSON.stringify(vault.records[ref]),
                    "secret:" + ref,
                );
                continue;
            }
            vault.records[ref] = BoxSchema.parse(
                JSON.parse(
                    cipher.encrypt(
                        randomBytes(32).toString("hex"),
                        "secret:" + ref,
                    ),
                ),
            );
            changed = true;
        }
        if (changed) {
            await writeFile(temporary, JSON.stringify(vault), {
                flag: "wx",
                mode: 0o600,
            });
            await rename(temporary, vaultPath);
        }
    } finally {
        key?.fill(0);
        await unlink(temporary).catch(() => {});
        await unlink(lock);
    }
}

/** Additive installation keys. Never overwrites existing credentials or key material. */
export async function ensureStorageSecrets(
    vaultPath: string,
    keyPath: string,
): Promise<void> {
    const lock = vaultPath + ".storage-lock",
        temporary = vaultPath + ".storage-" + randomBytes(8).toString("hex");
    await writeFile(lock, "storage-v1", { flag: "wx", mode: 0o600 });
    let key: Buffer | undefined;
    try {
        key = await privateFile(keyPath);
        const vault = VaultSchema.parse(
            JSON.parse((await privateFile(vaultPath)).toString("utf8")),
        );
        if (vault.environment !== "development")
            throw new BoundaryError("ENVIRONMENT_NOT_ENABLED");
        const cipher = new RecordCipher(key);
        let changed = false;
        for (const ref of [
            "development/storage/kek/k1",
            "development/storage/kek/k2",
            "development/storage/backup/key1",
        ]) {
            if (vault.records[ref]) {
                cipher.decrypt(
                    JSON.stringify(vault.records[ref]),
                    "secret:" + ref,
                );
                continue;
            }
            vault.records[ref] = BoxSchema.parse(
                JSON.parse(
                    cipher.encrypt(
                        randomBytes(32).toString("hex"),
                        "secret:" + ref,
                    ),
                ),
            );
            changed = true;
        }
        if (changed) {
            await writeFile(temporary, JSON.stringify(vault), {
                flag: "wx",
                mode: 0o600,
            });
            await rename(temporary, vaultPath);
        }
    } finally {
        key?.fill(0);
        await unlink(temporary).catch(() => {});
        await unlink(lock);
    }
}
