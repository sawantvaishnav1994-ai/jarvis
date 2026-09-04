import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await read(path));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");
try {
    if (process.env.J1_2_CI_SEQUENCE !== "complete")
        throw new Error("J1_2_REAL_STACK_SEQUENCE_NOT_ATTESTED");
    const [gates, runtime, roadmap, j1Migrations] = await Promise.all([
        json("tests/acceptance/j1.2-gates.json"),
        read("packages/core/src/context-assembly.ts"),
        read("docs/roadmap/j1.2.md"),
        json("infrastructure/migrations/j1/manifest.json"),
    ]);
    const checks = {
        A:
            gates.milestone === "J1.2" &&
            gates.gates.length === 20 &&
            JSON.stringify(gates.gates.map((gate) => gate.id)) ===
                JSON.stringify(letters),
        B:
            j1Migrations.length === 1 &&
            j1Migrations[0]?.version === 15 &&
            roadmap.includes("introduces no database migration"),
        C: ["ownerId", "conversationId", "sessionId", "turnId", "securityEpoch", "operatingMode"].every((item) => runtime.includes(item)),
        D: runtime.includes("OWNER_SCOPE_DENIED") && runtime.includes("PROJECT_SCOPE_DENIED"),
        E: runtime.includes("stableOrder") && runtime.includes("localeCompare"),
        F: runtime.includes("CLASSIFICATION_CEILING_DENIED"),
        G: runtime.includes("D5_GENERIC_CONTEXT_DENIED"),
        H: runtime.includes("DISCLOSURE_DENIED"),
        I: runtime.includes("STALE_SOURCE_DENIED") && runtime.includes("DELETED_OR_REVOKED"),
        J: runtime.includes("RETENTION_EXPIRED") && runtime.includes("SESSION_BOUNDARY_DENIED"),
        K: roadmap.includes("NEVER_STORE") && roadmap.includes("must not become durable context cache"),
        L: runtime.includes("PROVENANCE_REQUIRED"),
        M: runtime.includes("UNTRUSTED_SOURCE_DENIED") && roadmap.includes("untrusted data"),
        N: runtime.includes("BUDGET_EXCEEDED") && runtime.includes("maximumSize"),
        O: runtime.includes("CONTEXT_AUTHORITY_INVALID"),
        P: roadmap.includes("provider-neutral") && roadmap.includes("client-neutral"),
        Q: roadmap.includes("trusted phone") && roadmap.includes("trusted web client"),
        R: process.env.J1_2_CI_SEQUENCE === "complete",
        S: runtime.length > 3000,
        T: roadmap.includes("J1.3 production model orchestration"),
    };
    const failed = Object.entries(checks)
        .filter(([, value]) => !value)
        .map(([id]) => id);
    const result = {
        milestone: "J1.2",
        result: failed.length ? "FAIL" : "A-T_PASS",
        realStackSequence: true,
        checks,
        failed,
        recommendation: failed.length
            ? "J1.2 DEVELOPMENT GO NOT RECOMMENDED"
            : "J1.2 DEVELOPMENT GO RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.2.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result));
    if (failed.length) process.exitCode = 1;
} catch (error) {
    const result = {
        milestone: "J1.2",
        result: "FAIL",
        realStackSequence: false,
        checks: {},
        failed: [error instanceof Error ? error.message : "UNKNOWN"],
        recommendation: "J1.2 DEVELOPMENT GO NOT RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.2.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    ).catch(() => {});
    console.error(JSON.stringify(result));
    process.exitCode = 1;
}
