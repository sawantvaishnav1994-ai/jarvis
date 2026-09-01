import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import ts from "typescript";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const packages = await readdir(resolve(root, "packages"));
const apps = (await readdir(resolve(root, "apps"))).filter(
    (n) => n !== "desktop",
);
const allowed = {
    shared: [],
    identity: ["shared"],
    config: ["shared"],
    security: ["shared", "identity"],
    models: ["shared", "identity"],
    memory: ["shared", "identity"],
    events: ["shared", "identity"],
    audit: ["shared", "identity", "security"],
    storage: [
        "shared",
        "identity",
        "memory",
        "events",
        "security",
        "config",
        "audit",
    ],
    tools: ["shared", "identity", "security", "audit"],
    core: [
        "shared",
        "identity",
        "security",
        "models",
        "memory",
        "events",
        "audit",
        "tools",
    ],
    agents: ["shared", "identity"],
    knowledge: ["shared", "identity"],
    devices: ["shared", "identity"],
};
const failures = [];
async function files(path) {
    const result = [];
    for (const entry of await readdir(path, { withFileTypes: true })) {
        if (["dist", ".next", "node_modules"].includes(entry.name)) continue;
        const p = resolve(path, entry.name);
        if (entry.isDirectory()) result.push(...(await files(p)));
        else if (/\.(ts|tsx)$/.test(p) && !p.endsWith("next-env.d.ts"))
            result.push(p);
    }
    return result;
}
for (const [kind, names] of [
    ["packages", packages],
    ["apps", apps],
])
    for (const name of names) {
        const directory = resolve(root, kind, name);
        const manifest = JSON.parse(
            await readFile(resolve(directory, "package.json"), "utf8"),
        );
        const deps = manifest.dependencies ?? {};
        for (const file of await files(directory)) {
            const source = ts.createSourceFile(
                file,
                await readFile(file, "utf8"),
                ts.ScriptTarget.Latest,
                true,
            );
            function check(spec) {
                if (spec.startsWith(".")) {
                    const path = resolve(file, "..", spec);
                    if (!path.startsWith(directory + sep))
                        failures.push(
                            `${relative(root, file)}: relative import escapes subsystem`,
                        );
                    return;
                }
                if (spec.startsWith("node:")) {
                    if (name === "core") failures.push("core: platform import");
                    return;
                }
                const pkg = spec.startsWith("@")
                    ? spec.split("/").slice(0, 2).join("/")
                    : spec.split("/")[0];
                if (!deps[pkg])
                    failures.push(
                        `${relative(root, file)}: undeclared dependency ${pkg}`,
                    );
                if (
                    kind === "packages" &&
                    pkg.startsWith("@jarvis/") &&
                    !allowed[name]?.includes(pkg.slice(8))
                )
                    failures.push(
                        `${name}: disallowed package boundary ${pkg}`,
                    );
                if (name === "core" && !pkg.startsWith("@jarvis/"))
                    failures.push(`core: concrete dependency ${pkg}`);
            }
            function walk(node) {
                if (
                    (ts.isImportDeclaration(node) ||
                        ts.isExportDeclaration(node)) &&
                    node.moduleSpecifier &&
                    ts.isStringLiteral(node.moduleSpecifier)
                )
                    check(node.moduleSpecifier.text);
                if (
                    ts.isCallExpression(node) &&
                    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
                    node.arguments[0] &&
                    ts.isStringLiteral(node.arguments[0])
                )
                    check(node.arguments[0].text);
                ts.forEachChild(node, walk);
            }
            walk(source);
        }
    }
const dir = resolve(root, "infrastructure/migrations");
const manifest = JSON.parse(
    await readFile(resolve(dir, "manifest.json"), "utf8"),
);
if (
    (await readdir(dir))
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .join() !==
    manifest
        .map((e) => e.file)
        .sort()
        .join()
)
    failures.push("unlisted migration");
for (const [index, entry] of manifest.entries()) {
    const sql = await readFile(resolve(dir, entry.file), "utf8");
    if (
        entry.version !== index + 1 ||
        createHash("sha256").update(sql).digest("hex") !== entry.sha256
    )
        failures.push(`migration checksum/version drift: ${entry.file}`);
}
if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
} else console.log("BOUNDARIES_PASSED — imports and migration manifest");
