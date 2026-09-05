import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, "config/development.json");

function required(name, max) {
    const value = process.env[name]?.trim();
    if (!value || value.length > max) throw new Error("REMOTE_IDENTITY_CONFIG_INVALID");
    return value;
}

function validateIdentityBoundary(originValue, rpID) {
    let origin;
    try {
        origin = new URL(originValue);
    } catch {
        throw new Error("REMOTE_IDENTITY_CONFIG_INVALID");
    }
    if (
        origin.protocol !== "https:" ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash ||
        origin.username ||
        origin.password ||
        origin.hostname !== rpID ||
        !/^[a-z0-9.-]+$/i.test(rpID) ||
        rpID === "localhost" ||
        rpID === "127.0.0.1"
    )
        throw new Error("REMOTE_IDENTITY_CONFIG_INVALID");
    return origin.origin;
}

try {
    const rpID = required("JARVIS_REMOTE_RP_ID", 253);
    const origin = validateIdentityBoundary(
        required("JARVIS_REMOTE_ORIGIN", 512),
        rpID,
    );
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (
        config?.environment !== "development" ||
        !config.identity ||
        config.identity.origin !== "http://localhost:3000" ||
        config.identity.rpID !== "localhost"
    )
        throw new Error("REMOTE_IDENTITY_BASELINE_MISMATCH");
    config.identity = { ...config.identity, origin, rpID };
    await writeFile(configPath, JSON.stringify(config, null, 4) + "\n", {
        mode: 0o600,
    });
    await import("./j1.13-remote-start.mjs");
} catch {
    console.error(
        JSON.stringify({
            service: "remote-entry",
            event: "configuration.invalid",
            code: "REMOTE_IDENTITY_CONFIG_INVALID",
        }),
    );
    process.exitCode = 1;
}
