import { mkdtemp, readFile, rm, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { it, expect } from "vitest";
import {
    initializeDevelopmentVault,
    FileSecretManager,
    RecordCipher,
} from "@jarvis/security";
import { owner } from "../fixtures/foundation.js";
it("authenticates ciphertext and binds it to the owning record", () => {
    const cipher = new RecordCipher(randomBytes(32));
    const encrypted = cipher.encrypt({ content: "private fixture" }, "owner:a");
    expect(encrypted).not.toContain("private fixture");
    expect(cipher.decrypt(encrypted, "owner:a")).toEqual({
        content: "private fixture",
    });
    expect(() => cipher.decrypt(encrypted, "owner:b")).toThrow(
        "CIPHERTEXT_AUTHENTICATION_FAILED",
    );
    const tampered = JSON.parse(encrypted);
    tampered.tag = Buffer.alloc(16).toString("base64");
    expect(() => cipher.decrypt(JSON.stringify(tampered), "owner:a")).toThrow(
        "CIPHERTEXT_AUTHENTICATION_FAILED",
    );
});
it("creates private encrypted files and enforces actor, scope, environment and lease expiry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jarvis-vault-"));
    const vault = join(directory, "vault", "vault.json"),
        key = join(directory, "custody", "master.key"),
        ref = "development/database/runtime";
    try {
        expect(await initializeDevelopmentVault(vault, key)).toBe("created");
        expect(await initializeDevelopmentVault(vault, key)).toBe("existing");
        const manager = new FileSecretManager(
            vault,
            key,
            "development",
            owner.id,
            new Set([ref]),
        );
        const lease = await manager.lease(ref, owner, 20);
        const plaintext = lease.value.toString("utf8");
        expect(plaintext).toMatch(/^[a-f0-9]{64}$/);
        expect(await readFile(vault, "utf8")).not.toContain(plaintext);
        expect((await stat(key)).mode & 0o077).toBe(0);
        for (const actor of [
            { ...owner, id: "other" },
            { ...owner, kind: "agent" as const },
            { ...owner, environment: "production" as const },
        ])
            await expect(manager.lease(ref, actor)).rejects.toThrow(
                "SECRET_SCOPE_DENIED",
            );
        await expect(
            manager.lease("development/redis/runtime", owner),
        ).rejects.toThrow("SECRET_SCOPE_DENIED");
        await delay(30);
        expect(lease.value.every((v) => v === 0)).toBe(true);
        await chmod(key, 0o644);
        await expect(manager.lease(ref, owner)).rejects.toThrow(
            "INSECURE_SECRET_FILE",
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
