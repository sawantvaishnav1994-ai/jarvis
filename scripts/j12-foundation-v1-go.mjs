import { access, appendFile, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const requiredFile = async (path) => {
    await access(new URL(path, root));
    return path;
};
const letters = "ABCDEFGHIJKLMNOPQRST".split("");

try {
    const [catalog, manifest, schema, unit, integration, j04, j05, j06, j07, j08, j09, j10, j11] = await Promise.all([
        read("tests/acceptance/j12-gates.json"),
        read("foundation/foundation-v1.manifest.json"),
        read("foundation/schema-v1.json"),
        read(".jarvis/acceptance/unit.json"),
        read(".jarvis/acceptance/integration.json"),
        read(".jarvis/acceptance/j04-go.json"),
        read(".jarvis/acceptance/j05-go.json"),
        read(".jarvis/acceptance/j06-go.json"),
        read(".jarvis/acceptance/j07-go.json"),
        read(".jarvis/acceptance/j08-go.json"),
        read(".jarvis/acceptance/j09-go.json"),
        read(".jarvis/acceptance/j10-go.json"),
        read(".jarvis/acceptance/j11-go.json"),
    ]);

    if (
        catalog.milestone !== "J0.12 Foundation Contract Freeze, Final Architecture & Security Review, Foundation v1 Acceptance" ||
        catalog.baseline !== "581badf38ed3d85c75a652ac87111c8aa4e62da9" ||
        !Array.isArray(catalog.gates) ||
        catalog.gates.length !== 20
    ) throw new Error("J012_CATALOG_INVALID");

    if (
        manifest.foundationVersion !== "1.0.0-rc" ||
        manifest.baseline !== catalog.baseline ||
        manifest.schemaVersion !== 14 ||
        manifest.migrationRange !== "0001-0014" ||
        manifest.securityInvariants !== 55 ||
        !manifest.contracts ||
        Object.keys(manifest.contracts).length !== 22 ||
        Object.values(manifest.contracts).some((version) => !Number.isInteger(version) || version < 1)
    ) throw new Error("FOUNDATION_V1_MANIFEST_INVALID");

    if (
        schema.schemaVersion !== 14 ||
        schema.migrationCount !== 14 ||
        schema.migrationRange !== "0001-0014" ||
        schema.pgvectorRequired !== true ||
        !Array.isArray(schema.migrations) ||
        schema.migrations.length !== 14
    ) throw new Error("FOUNDATION_V1_SCHEMA_FREEZE_INVALID");

    await Promise.all([
        "foundation/permissions-v1.json",
        "foundation/operating-modes-v1.json",
        "foundation/data-classification-v1.json",
        "docs/roadmap/j0.12.md",
        "docs/roadmap/j0.12-report.md",
        "docs/architecture/foundation-v1-architecture.md",
        "docs/security/foundation-v1-security-review.md",
        "docs/security/foundation-v1-trust-boundaries.md",
        "docs/contracts/foundation-v1-contracts.md",
    ].map(requiredFile));

    if (
        j04.result !== "A-S_PASS" ||
        [j05, j06, j07, j08, j09, j10, j11].some((value) => value.result !== "A-T_PASS")
    ) throw new Error("PRIOR_J0_REGRESSION_GATE_NOT_PASSING");

    if (j11.realStackSequence !== true)
        throw new Error("J011_REAL_STACK_EVIDENCE_MISSING");

    if (process.env.J12_CI_SEQUENCE !== "complete")
        throw new Error("J012_REAL_STACK_SEQUENCE_NOT_ATTESTED");

    const all = [
        ...unit.testResults.flatMap((suite) => suite.assertionResults),
        ...integration.testResults.flatMap((suite) => suite.assertionResults),
    ];
    const phases = Object.fromEntries(
        letters.map((letter, index) => {
            const title = catalog.gates[index];
            const matches = all.filter((test) => test.title === title);
            const pass = matches.length === 1 && matches[0].status === "passed";
            return [letter, {
                result: pass ? "PASS" : "FAIL",
                assertions: matches.length,
                failures: pass ? [] : [matches.length === 0 ? `missing:${title}` : `not-uniquely-passing:${title}`],
            }];
        }),
    );

    const suitesPassed = [unit, integration].every((report) =>
        report.success === true && report.numFailedTests === 0 && report.numPendingTests === 0,
    );
    const passed = suitesPassed && Object.values(phases).every((phase) => phase.result === "PASS");
    const regression = {
        "J0.1": "PASS-via-cumulative-static-build-integration-browser-foundation-regression",
        "J0.2": "PASS-via-root-owner-device-trust-browser-and-identity-regression",
        "J0.3": "PASS-via-governance-policy-approval-authorization-regression",
        "J0.4": j04.result,
        "J0.5": j05.result,
        "J0.6": j06.result,
        "J0.7": j07.result,
        "J0.8": j08.result,
        "J0.9": j09.result,
        "J0.10": j10.result,
        "J0.11": j11.result,
    };
    const result = {
        version: 1,
        milestone: "J0.12",
        foundationVersion: manifest.foundationVersion,
        startingBaseline: catalog.baseline,
        commit: process.env.GITHUB_SHA ?? null,
        runId: process.env.GITHUB_RUN_ID ?? null,
        typescript: unit.numPassedTests,
        postgres: integration.numPassedTests,
        realStackSequence: true,
        schemaVersion: schema.schemaVersion,
        migrationCount: schema.migrationCount,
        contractFamilies: Object.keys(manifest.contracts).length,
        securityInvariants: manifest.securityInvariants,
        regression,
        phases,
        result: passed ? "A-T_PASS" : "A-T_FAIL",
        recommendation: passed ? "J0 FOUNDATION v1 GO RECOMMENDED" : "J0 FOUNDATION v1 GO NOT RECOMMENDED",
        verdict: "Evidence only. This verifier does not merge, tag, start J1 or independently issue the owner-controlled J0 Foundation v1 GO.",
    };

    await writeFile(new URL(".jarvis/acceptance/j12-foundation-v1.json", root), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(
            process.env.GITHUB_STEP_SUMMARY,
            "\n## J0.12 Foundation v1 A–T acceptance\n\n" +
                Object.entries(phases).map(([letter, phase]) => `| ${letter} | ${phase.result} | ${phase.assertions} assertion(s) |`).join("\n") +
                `\n\n**${result.recommendation}**\n`,
        );
    }
    if (!passed) process.exitCode = 1;
} catch (error) {
    console.error("J0.12_A-T_FAIL", error instanceof Error ? error.message : "unknown");
    process.exitCode = 1;
}
