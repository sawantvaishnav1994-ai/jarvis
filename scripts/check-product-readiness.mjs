import { readFile } from "node:fs/promises";
const register = JSON.parse(
    await readFile(
        new URL("../docs/product/requirements.json", import.meta.url),
        "utf8",
    ),
);
const expected = [
    ...Array.from(
        { length: 168 },
        (_, i) => `FR-${String(i + 1).padStart(3, "0")}`,
    ),
    ...Array.from(
        { length: 24 },
        (_, i) => `V2-${String(i + 1).padStart(3, "0")}`,
    ),
];
const ids = register.requirements.map((r) => r.id);
if (
    ids.length !== 192 ||
    new Set(ids).size !== 192 ||
    expected.some((id) => !ids.includes(id))
)
    throw new Error("Requirement inventory incomplete");
for (const r of register.requirements) {
    if (!r.requirement || !r.acceptance || !r.subsystem || !r.milestone)
        throw new Error(`Unmapped ${r.id}`);
    if (
        ["VERIFIED", "HARDENED", "RELEASED"].includes(r.status) &&
        (!r.releaseEvidence.length ||
            r.releaseEvidence.some(
                (e) => !e.commit || !e.result || !e.location,
            ))
    )
        throw new Error(`Unsupported evidence claim ${r.id}`);
}
console.log(
    "PASS: 168 V1 and 24 V2 requirements mapped; completion claims require evidence.",
);
// Completion is governed by the master ledger; the JSON above preserves source wording.
await import("./check-completion-ledger.mjs");
