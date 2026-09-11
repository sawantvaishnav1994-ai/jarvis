import { readFile, access } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const baseline = JSON.parse(
    await readFile(new URL("docs/product/requirements.json", root), "utf8"),
);
const ledger = await readFile(
    new URL("docs/JARVIS_MASTER_COMPLETION_LEDGER.md", root),
    "utf8",
);
const statuses = new Set([
    "NOT_STARTED",
    "IN_PROGRESS",
    "IMPLEMENTED_UNVERIFIED",
    "VERIFIED_COMPLETE",
    "BLOCKED_EXTERNAL",
]);
const required = [
    "Requirement description",
    "Acceptance",
    "Owning subsystem",
    "Implementation location",
    "Current status",
    "Tests",
    "Integration verification",
    "Security verification",
    "Evidence",
    "Blocking dependency",
    "Final completion state",
];
const expected = new Map(baseline.requirements.map((r) => [r.id, r]));
const seen = new Set();
const counts = Object.fromEntries([...statuses].map((s) => [s, 0]));
for (const match of ledger.matchAll(
    /^### ((?:FR|V2)-\d{3})\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm,
)) {
    const [, id, body] = match;
    if (!expected.has(id) || seen.has(id))
        throw Error(`Unexpected/duplicate requirement: ${id}`);
    seen.add(id);
    const fields = new Map(
        [...body.matchAll(/^- ([^:\n]+): (.+)$/gm)].map((m) => [m[1], m[2]]),
    );
    for (const key of required)
        if (!fields.get(key)?.trim()) throw Error(`${id}: missing ${key}`);
    if (
        fields.get("Requirement description") !==
            expected.get(id).requirement ||
        fields.get("Acceptance") !== expected.get(id).acceptance
    )
        throw Error(`${id}: baseline wording changed`);
    const status = fields.get("Current status");
    if (
        !statuses.has(status) ||
        fields.get("Final completion state") !== status
    )
        throw Error(`${id}: invalid/inconsistent status`);
    counts[status]++;
    for (const path of fields.get("Implementation location").split("; "))
        await access(new URL(path, root));
    if (status === "VERIFIED_COMPLETE") {
        const evidence = fields.get("Evidence");
        if (
            !/commit=[a-f0-9]{40}\b/.test(evidence) ||
            !/result=PASS\b/.test(evidence) ||
            !/integration=\S+/.test(evidence) ||
            !/tests=\S+/.test(evidence)
        )
            throw Error(
                `${id}: completion requires exact commit and passing test/integration evidence`,
            );
        if (
            /not |pending|unverified|remain open/i.test(
                fields.get("Integration verification"),
            )
        )
            throw Error(`${id}: integration remains open`);
    }
    if (
        status === "BLOCKED_EXTERNAL" &&
        !/external-resource=\S+/.test(fields.get("Blocking dependency"))
    )
        throw Error(`${id}: name the unavailable external resource`);
}
if (seen.size !== 192 || [...expected.keys()].some((id) => !seen.has(id)))
    throw Error(`Incomplete ledger: ${seen.size}/192`);
console.log(
    JSON.stringify({
        ledger: "VALID",
        requirements: seen.size,
        statuses: counts,
    }),
);
if (process.argv.includes("--release") && counts.VERIFIED_COMPLETE !== 192) {
    console.error(
        "NOT READY: production release requires all requirements verified; external blockers remain exclusions, not completed functionality.",
    );
    process.exitCode = 1;
}
