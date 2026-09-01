import { spawn } from "node:child_process";
import { resolve } from "node:path";
process.env.NEXT_TELEMETRY_DISABLED = "1";
const root = resolve(import.meta.dirname, "..");
function run(command, args) {
    return new Promise((ok, bad) => {
        const p = spawn(command, args, { cwd: root, stdio: "inherit" });
        p.once("error", bad);
        p.once("exit", (c) =>
            c === 0 ? ok() : bad(new Error("Setup step failed")),
        );
    });
}
try {
    if (Number(process.versions.node.split(".")[0]) !== 24)
        throw new Error("Node 24 required");
    await run("docker", ["compose", "version"]);
    if (!process.argv.includes("--skip-install")) await run("npm", ["ci"]);
    await run("npm", ["run", "build:packages"]);
    await run(process.execPath, ["scripts/secrets-init.mjs"]);
    await run(process.execPath, ["scripts/infrastructure.mjs", "up"]);
    await run(process.execPath, ["scripts/migrate.mjs"]);
    await run("npm", ["run", "build:web"]);
    console.log("JARVIS_SETUP_COMPLETE — run npm start");
} catch {
    console.error(
        "SETUP_FAILED: check Node 24, Docker Compose v2, and the failing step above.",
    );
    process.exitCode = 1;
}
