import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadConfig, requireDevelopment } from "@jarvis/config";
import { FileSecretManager } from "@jarvis/security";
export const root = resolve(import.meta.dirname, "..");
export async function runtime(actorId, refs) {
    const config = await loadConfig(
        process.env.JARVIS_CONFIG ?? resolve(root, "config/development.json"),
    );
    requireDevelopment(config);
    const vaultPath =
        process.env.JARVIS_VAULT_FILE ??
        resolve(root, ".jarvis/development/vault.json");
    const keyPath =
        process.env.JARVIS_MASTER_KEY_FILE ??
        resolve(homedir(), ".config/jarvis/typescript/development/master.key");
    const actor = {
        version: 1,
        id: actorId,
        kind: "service",
        environment: config.environment,
    };
    const secrets = new FileSecretManager(
        vaultPath,
        keyPath,
        config.environment,
        actorId,
        new Set(refs ?? []),
    );
    return { config, vaultPath, keyPath, actor, secrets };
}
export async function readSecret(secrets, actor, ref) {
    const lease = await secrets.lease(ref, actor);
    try {
        return lease.value.toString("utf8");
    } finally {
        lease.destroy();
    }
}
export function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: root,
            stdio: "inherit",
            ...options,
        });
        child.once("error", reject);
        child.once("exit", (code) =>
            code === 0
                ? resolve()
                : reject(new Error("Command failed: " + command)),
        );
    });
}
export function fail(code) {
    console.error(
        JSON.stringify({ service: "setup", event: "operation.failed", code }),
    );
    process.exitCode = 1;
}
