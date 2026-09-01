import { createConnection } from "node:net";
import { readFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { root, fail } from "./runtime.mjs";
try {
    const path = resolve(root, ".jarvis/development/control.token");
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
        throw new Error("Unsafe control token");
    const token = await readFile(path, "utf8");
    await new Promise((ok, bad) => {
        const c = createConnection(
            resolve(root, ".jarvis/development/control.sock"),
        );
        c.setTimeout(3000, () => {
            c.destroy();
            bad(new Error("Stop timed out"));
        });
        c.once("connect", () =>
            c.write(JSON.stringify({ action: "stop", token }) + "\n"),
        );
        c.once("data", (chunk) => {
            c.destroy();
            String(chunk).trim() === "STOPPING"
                ? ok()
                : bad(new Error("Stop rejected"));
        });
        c.once("error", bad);
    });
    console.log("JARVIS_STOP_REQUESTED — database volumes are preserved");
} catch {
    fail("STOP_UNAVAILABLE");
}
