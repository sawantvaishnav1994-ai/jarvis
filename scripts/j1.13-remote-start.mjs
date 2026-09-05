import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer, connect } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { RecordCipher } from "@jarvis/security";

const root = resolve(import.meta.dirname, "..");
const children = [];
const proxies = [];
let stopping = false;

function required(name, max = 2048) {
    const value = process.env[name]?.trim();
    if (!value || value.length > max) throw new Error("REMOTE_CONFIG_INVALID");
    return value;
}

function port(name) {
    const value = Number(required(name, 8));
    if (!Number.isInteger(value) || value < 1 || value > 65535)
        throw new Error("REMOTE_CONFIG_INVALID");
    return value;
}

function host(name) {
    const value = required(name, 253);
    if (
        !/^[a-z0-9.-]+$/i.test(value) ||
        value === "localhost" ||
        value === "127.0.0.1"
    )
        throw new Error("REMOTE_CONFIG_INVALID");
    return value;
}

function hex64(name) {
    const value = required(name, 64);
    if (!/^[0-9a-f]{64}$/i.test(value))
        throw new Error("REMOTE_SECRET_INVALID");
    return value.toLowerCase();
}

function sqlLiteral(value) {
    return `'${value.replaceAll("'", "''")}'`;
}

async function initializeRemotePostgres(postgresHost, postgresPort) {
    const adminUser = required("JARVIS_REMOTE_POSTGRES_ADMIN_USER", 128);
    const adminPassword = required(
        "JARVIS_REMOTE_POSTGRES_ADMIN_PASSWORD",
        512,
    );
    const adminDatabase = required(
        "JARVIS_REMOTE_POSTGRES_ADMIN_DATABASE",
        128,
    );
    const runtimePassword = required(
        "JARVIS_REMOTE_DATABASE_RUNTIME_PASSWORD",
        512,
    );
    const migratorPassword = required(
        "JARVIS_REMOTE_DATABASE_MIGRATOR_PASSWORD",
        512,
    );
    const admin = new pg.Client({
        host: postgresHost,
        port: postgresPort,
        user: adminUser,
        password: adminPassword,
        database: adminDatabase,
        connectionTimeoutMillis: 5000,
    });
    try {
        await admin.connect();
        const migrator = await admin.query(
            "SELECT 1 FROM pg_roles WHERE rolname = 'jarvis_development_migrator'",
        );
        await admin.query(
            migrator.rowCount === 0
                ? `CREATE ROLE jarvis_development_migrator LOGIN PASSWORD ${sqlLiteral(migratorPassword)}`
                : `ALTER ROLE jarvis_development_migrator LOGIN PASSWORD ${sqlLiteral(migratorPassword)}`,
        );
        const runtime = await admin.query(
            "SELECT 1 FROM pg_roles WHERE rolname = 'jarvis_development_runtime'",
        );
        await admin.query(
            runtime.rowCount === 0
                ? `CREATE ROLE jarvis_development_runtime LOGIN PASSWORD ${sqlLiteral(runtimePassword)}`
                : `ALTER ROLE jarvis_development_runtime LOGIN PASSWORD ${sqlLiteral(runtimePassword)}`,
        );
        const database = await admin.query(
            "SELECT 1 FROM pg_database WHERE datname = 'jarvis_development'",
        );
        if (database.rowCount === 0)
            await admin.query(
                "CREATE DATABASE jarvis_development OWNER jarvis_development_migrator",
            );
        else
            await admin.query(
                "ALTER DATABASE jarvis_development OWNER TO jarvis_development_migrator",
            );
    } finally {
        await admin.end().catch(() => {});
    }

    const database = new pg.Client({
        host: postgresHost,
        port: postgresPort,
        user: adminUser,
        password: adminPassword,
        database: "jarvis_development",
        connectionTimeoutMillis: 5000,
    });
    try {
        await database.connect();
        await database.query("CREATE EXTENSION IF NOT EXISTS vector");
        await database.query(
            "ALTER SCHEMA public OWNER TO jarvis_development_migrator",
        );
        await database.query(
            "GRANT ALL PRIVILEGES ON SCHEMA public TO jarvis_development_migrator",
        );
        await database.query(
            "GRANT CONNECT ON DATABASE jarvis_development TO jarvis_development_runtime",
        );
        await database.query(
            "GRANT USAGE ON SCHEMA public TO jarvis_development_runtime",
        );
        await database.query(
            "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jarvis_development_runtime",
        );
        await database.query(
            "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jarvis_development_runtime",
        );
        await database.query(
            "ALTER DEFAULT PRIVILEGES FOR ROLE jarvis_development_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jarvis_development_runtime",
        );
        await database.query(
            "ALTER DEFAULT PRIVILEGES FOR ROLE jarvis_development_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO jarvis_development_runtime",
        );
        const verification = await database.query(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS vector, pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname = 'jarvis_development')) AS owner",
        );
        if (
            verification.rows[0]?.vector !== true ||
            verification.rows[0]?.owner !== "jarvis_development_migrator"
        )
            throw new Error("REMOTE_DATABASE_VERIFICATION_FAILED");
    } finally {
        await database.end().catch(() => {});
        delete process.env.JARVIS_REMOTE_POSTGRES_ADMIN_USER;
        delete process.env.JARVIS_REMOTE_POSTGRES_ADMIN_PASSWORD;
        delete process.env.JARVIS_REMOTE_POSTGRES_ADMIN_DATABASE;
    }
}

async function materializeVault() {
    const secretNames = {
        "development/database/runtime":
            "JARVIS_REMOTE_DATABASE_RUNTIME_PASSWORD",
        "development/database/migrator":
            "JARVIS_REMOTE_DATABASE_MIGRATOR_PASSWORD",
        "development/redis/runtime": "JARVIS_REMOTE_REDIS_PASSWORD",
        "development/storage/data-key": "JARVIS_REMOTE_STORAGE_DATA_KEY",
        "development/identity/bootstrap": "JARVIS_REMOTE_IDENTITY_BOOTSTRAP",
        "development/identity/web-transport": "JARVIS_REMOTE_WEB_TRANSPORT_KEY",
        "development/storage/kek/k1": "JARVIS_REMOTE_STORAGE_KEK1",
        "development/storage/kek/k2": "JARVIS_REMOTE_STORAGE_KEK2",
        "development/storage/backup/key1": "JARVIS_REMOTE_BACKUP_KEY",
        "development/tools/synthetic-credential":
            "JARVIS_REMOTE_SYNTHETIC_CREDENTIAL",
    };
    const values = {};
    for (const [ref, env] of Object.entries(secretNames))
        values[ref] = [
            "development/storage/data-key",
            "development/identity/web-transport",
            "development/storage/kek/k1",
            "development/storage/kek/k2",
            "development/storage/backup/key1",
        ].includes(ref)
            ? hex64(env)
            : required(env, 512);

    const vaultDirectory = "/tmp/jarvis-runtime";
    const keyDirectory = "/tmp/jarvis-master";
    await mkdir(vaultDirectory, { recursive: true, mode: 0o700 });
    await mkdir(keyDirectory, { recursive: true, mode: 0o700 });
    const master = randomBytes(32);
    const cipher = new RecordCipher(master);
    const records = {};
    for (const [ref, value] of Object.entries(values))
        records[ref] = JSON.parse(cipher.encrypt(value, "secret:" + ref));
    const vaultPath = resolve(vaultDirectory, "vault.json");
    const keyPath = resolve(keyDirectory, "master.key");
    await writeFile(
        vaultPath,
        JSON.stringify({ version: 1, environment: "development", records }),
        { mode: 0o600 },
    );
    await writeFile(keyPath, master, { mode: 0o600 });
    master.fill(0);
    process.env.JARVIS_VAULT_FILE = vaultPath;
    process.env.JARVIS_MASTER_KEY_FILE = keyPath;
    for (const env of Object.values(secretNames)) delete process.env[env];
}

async function proxy(localPort, remoteHost, remotePort) {
    const server = createServer((client) => {
        const upstream = connect({ host: remoteHost, port: remotePort });
        client.setTimeout(15_000, () => client.destroy());
        upstream.setTimeout(15_000, () => upstream.destroy());
        client.on("error", () => upstream.destroy());
        upstream.on("error", () => client.destroy());
        client.pipe(upstream).pipe(client);
    });
    await new Promise((ok, bad) => {
        server.once("error", bad);
        server.listen(localPort, "127.0.0.1", ok);
    });
    proxies.push(server);
}

function run(command, args, cwd = root) {
    return new Promise((ok, bad) => {
        const child = spawn(command, args, {
            cwd,
            stdio: "inherit",
            env: process.env,
        });
        child.once("error", bad);
        child.once("exit", (code) =>
            code === 0 ? ok() : bad(new Error("REMOTE_BOOTSTRAP_FAILED")),
        );
    });
}

function start(command, args, cwd = root) {
    const child = spawn(command, args, {
        cwd,
        stdio: "inherit",
        env: process.env,
    });
    children.push(child);
    child.once("error", () => void stop(1));
    child.once("exit", () => {
        if (!stopping) void stop(1);
    });
}

async function waitReady(url) {
    const deadline = Date.now() + 90_000;
    while (!stopping && Date.now() < deadline) {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(2500),
                cache: "no-store",
            });
            if (response.ok) return;
        } catch {}
        await delay(500);
    }
    throw new Error("REMOTE_READINESS_FAILED");
}

async function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const server of proxies) server.close();
    for (const child of children)
        if (child.exitCode === null && child.signalCode === null)
            child.kill("SIGTERM");
    await delay(1500);
    for (const child of children)
        if (child.exitCode === null && child.signalCode === null)
            child.kill("SIGKILL");
    process.exitCode = code;
}

try {
    if (process.platform === "win32") throw new Error("REMOTE_PLATFORM_DENIED");
    const postgresHost = host("JARVIS_REMOTE_POSTGRES_HOST");
    const postgresPort = port("JARVIS_REMOTE_POSTGRES_PORT");
    const redisHost = host("JARVIS_REMOTE_REDIS_HOST");
    const redisPort = port("JARVIS_REMOTE_REDIS_PORT");
    required("JARVIS_REMOTE_ORIGIN", 512);
    required("JARVIS_REMOTE_RP_ID", 253);
    process.env.JARVIS_CONFIG = resolve(root, "config/development.json");
    process.env.NEXT_TELEMETRY_DISABLED = "1";
    await initializeRemotePostgres(postgresHost, postgresPort);
    await materializeVault();
    await proxy(5433, postgresHost, postgresPort);
    await proxy(6380, redisHost, redisPort);
    delete process.env.JARVIS_REMOTE_POSTGRES_HOST;
    delete process.env.JARVIS_REMOTE_POSTGRES_PORT;
    delete process.env.JARVIS_REMOTE_REDIS_HOST;
    delete process.env.JARVIS_REMOTE_REDIS_PORT;
    await run(process.execPath, ["scripts/migrate.mjs"]);
    await run(process.execPath, ["scripts/j09-startup-audit-check.mjs"]);
    await run(process.execPath, ["scripts/j10-startup-recovery-check.mjs"]);
    process.once("SIGTERM", () => void stop());
    process.once("SIGINT", () => void stop());
    start(process.execPath, ["apps/api/dist/main.js"]);
    start(process.execPath, ["apps/worker/dist/main.js"]);
    start(
        process.execPath,
        [
            resolve(root, "node_modules/next/dist/bin/next"),
            "start",
            "--hostname",
            "0.0.0.0",
            "--port",
            "3000",
        ],
        resolve(root, "apps/web"),
    );
    await Promise.all([
        waitReady("http://127.0.0.1:4000/health/ready"),
        waitReady("http://127.0.0.1:4001/health/ready"),
        waitReady("http://127.0.0.1:3000/api/health"),
    ]);
    console.log(
        JSON.stringify({
            service: "supervisor",
            event: "service.started",
            status: "remote-development-ready",
        }),
    );
} catch {
    console.error(
        JSON.stringify({
            service: "supervisor",
            event: "configuration.invalid",
            code: "REMOTE_START_FAILED",
        }),
    );
    await stop(1);
}
