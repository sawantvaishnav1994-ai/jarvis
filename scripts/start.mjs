import { spawn } from "node:child_process";
import { createServer, createConnection } from "node:net";
import { mkdir, writeFile, unlink, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { root, runtime, run, fail } from "./runtime.mjs";

// A local control socket lives outside model reasoning. Only children owned by
// this supervisor are signalled; PID files are never used as kill authority.
process.env.NEXT_TELEMETRY_DISABLED = "1";
process.env.JARVIS_CONFIG = resolve(
    root,
    process.env.JARVIS_CONFIG ?? "config/development.json",
);
const directory = resolve(root, ".jarvis/development");
const socketPath = resolve(directory, "control.sock");
const tokenPath = resolve(directory, "control.token");
const children = [];
let stopping = false,
    control,
    ownsSocket = false;
async function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    if (control) control.close();
    const alive = () =>
        children.filter((p) => p.exitCode === null && p.signalCode === null);
    const signal = (p, s) => {
        try {
            process.kill(-p.pid, s);
        } catch (error) {
            if (error.code !== "ESRCH") fail("CHILD_STOP_FAILED");
        }
    };
    for (const p of alive()) signal(p, "SIGTERM");
    const deadline = Date.now() + 5000;
    while (alive().length && Date.now() < deadline) await delay(50);
    for (const p of alive()) signal(p, "SIGKILL");
    await Promise.all(
        alive().map((p) => new Promise((ok) => p.once("exit", ok))),
    );
    if (ownsSocket) {
        await unlink(socketPath).catch(() => {});
        await unlink(tokenPath).catch(() => {});
    }
    process.exitCode = code;
}
function start(command, args, cwd = root, env = process.env) {
    const child = spawn(command, args, {
        cwd,
        stdio: "inherit",
        detached: true,
        env,
    });
    children.push(child);
    child.once("error", () => {
        fail("SERVICE_START_FAILED");
        void stop(1);
    });
    child.once("exit", () => {
        if (!stopping) {
            fail("SERVICE_EXITED");
            void stop(1);
        }
    });
}
async function waitReady(url) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && !stopping) {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(2000),
            });
            if (response.ok) return;
        } catch {
            /* still starting */
        }
        await delay(500);
    }
    throw new Error("Readiness deadline exceeded");
}
try {
    if (process.platform === "win32")
        throw new Error("Use Linux, macOS, or WSL2");
    const { config, vaultPath, keyPath } = await runtime("jarvis-supervisor", []);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        (info.mode & 0o077) !== 0
    )
        throw new Error("Unsafe control directory");
    try {
        await lstat(socketPath);
        const active = await new Promise((ok, bad) => {
            const c = createConnection(socketPath);
            c.once("connect", () => {
                c.destroy();
                ok(true);
            });
            c.once("error", (e) =>
                ["ECONNREFUSED", "ENOENT"].includes(e.code)
                    ? ok(false)
                    : bad(e),
            );
        });
        if (active) throw new Error("Jarvis is already running");
        await unlink(socketPath).catch(() => {});
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    const token = randomBytes(32).toString("hex");
    control = createServer((client) => {
        client.setTimeout(2000, () => client.destroy());
        let buffer = "";
        client.on("data", (chunk) => {
            buffer += chunk;
            if (buffer.length > 512) {
                client.destroy();
                return;
            }
            if (!buffer.includes("\n")) return;
            try {
                const input = JSON.parse(buffer.trim());
                const supplied = Buffer.from(String(input.token));
                const expected = Buffer.from(token);
                if (
                    input.action !== "stop" ||
                    supplied.length !== expected.length ||
                    !timingSafeEqual(supplied, expected)
                ) {
                    client.destroy();
                    return;
                }
                client.end("STOPPING\n");
                void stop();
            } catch {
                client.destroy();
            }
        });
    });
    await new Promise((ok, bad) => {
        control.once("error", bad);
        control.listen(socketPath, ok);
    });
    ownsSocket = true;
    // Never follow a stale token symlink from a prior session.
    await unlink(tokenPath).catch((e) => {
        if (e.code !== "ENOENT") throw e;
    });
    await writeFile(tokenPath, token, { mode: 0o600, flag: "wx" });
    process.once("SIGINT", () => {
        void stop();
    });
    process.once("SIGTERM", () => {
        void stop();
    });
    await run(process.execPath, ["scripts/infrastructure.mjs", "up"]);
    await run(process.execPath, ["scripts/migrate.mjs"]);
    if (!stopping) {
        start(process.execPath, ["apps/api/dist/main.js"]);
        start(process.execPath, ["apps/worker/dist/main.js"]);
        const webEnv = {
            ...process.env,
            JARVIS_CONFIG: process.env.JARVIS_CONFIG,
            JARVIS_VAULT_FILE: vaultPath,
            JARVIS_MASTER_KEY_FILE: keyPath,
        };
        start(
            process.execPath,
            [
                resolve(root, "node_modules/next/dist/bin/next"),
                "start",
                "--hostname",
                config.web.host,
                "--port",
                String(config.web.port),
            ],
            resolve(root, "apps/web"),
            webEnv,
        );
        await Promise.all([
            waitReady(
                `http://${config.api.host}:${config.api.port}/health/ready`,
            ),
            waitReady(
                `http://${config.worker.host}:${config.worker.port}/health/ready`,
            ),
            waitReady(
                `http://${config.web.host}:${config.web.port}/api/health`,
            ),
        ]);
        console.log(
            "JARVIS_READY — http://127.0.0.1:3000 — Ctrl+C or npm stop to stop services",
        );
    }
} catch {
    fail("START_FAILED");
    await stop(1);
}
