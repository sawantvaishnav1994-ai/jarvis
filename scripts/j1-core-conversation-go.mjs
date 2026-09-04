import { access, appendFile, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
    JSON.parse(await readFile(new URL(path, root), "utf8"));
const readText = async (path) => readFile(new URL(path, root), "utf8");
const exists = async (path) => {
    try {
        await access(new URL(path, root));
        return true;
    } catch {
        return false;
    }
};
const letters = "ABCDEFGHIJKLMNOPQRST".split("");

try {
    const [
        catalog,
        manifest,
        foundation,
        schema,
        unit,
        integration,
        j12,
        roadmap,
        architecture,
        contracts,
        security,
    ] = await Promise.all([
        readJson("tests/acceptance/j1.0-gates.json"),
        readJson("foundation/j1-core-conversation-v1.manifest.json"),
        readJson("foundation/foundation-v1.manifest.json"),
        readJson("foundation/schema-v1.json"),
        readJson(".jarvis/acceptance/unit.json"),
        readJson(".jarvis/acceptance/integration.json"),
        readJson(".jarvis/acceptance/j12-foundation-v1.json"),
        readText("docs/roadmap/j1.0.md"),
        readText("docs/architecture/j1-core-conversation-architecture.md"),
        readText("docs/contracts/j1-core-conversation-contracts.md"),
        readText("docs/security/j1-core-conversation-security.md"),
    ]);

    if (process.env.J1_0_CI_SEQUENCE !== "complete")
        throw new Error("J1_0_REAL_STACK_SEQUENCE_NOT_ATTESTED");

    const expectedIds = letters;
    if (
        catalog.milestone !== "J1.0" ||
        !Array.isArray(catalog.gates) ||
        catalog.gates.length !== 20 ||
        JSON.stringify(catalog.gates.map(({ id }) => id)) !==
            JSON.stringify(expectedIds) ||
        new Set(catalog.gates.map(({ id }) => id)).size !== 20
    )
        throw new Error("J1_0_CATALOG_INVALID");

    if (
        manifest.milestone !== "J1.0" ||
        manifest.version !== "1.0.0-spec" ||
        manifest.foundationBaselineSha !==
            "f52eaf50b5c18d5970c40195b50f396e802b59e2" ||
        manifest.foundationValidationRun !== "33834315603"
    )
        throw new Error("J1_0_MANIFEST_BASELINE_INVALID");

    if (
        j12.result !== "A-T_PASS" ||
        j12.realStackSequence !== true ||
        schema.schemaVersion !== 14 ||
        schema.migrationCount !== 14 ||
        schema.migrationRange !== "0001-0014"
    )
        throw new Error("FOUNDATION_V1_REGRESSION_EVIDENCE_INVALID");

    const foundationContract = (name) =>
        Number.isInteger(foundation.contracts?.[name]) &&
        foundation.contracts[name] > 0;
    const hasAll = (text, values) => values.every((value) => text.includes(value));

    const j1SpecTest = unit.testResults
        .flatMap((suite) => suite.assertionResults)
        .filter(
            (test) =>
                test.title ===
                "A-T freeze is complete and remains Foundation v1 compatible",
        );
    const j1SpecTestPassed =
        j1SpecTest.length === 1 && j1SpecTest[0].status === "passed";

    const migration0015Absent =
        !(await exists("infrastructure/migrations/0015.sql")) &&
        !(await exists("infrastructure/migrations/0015_j1.sql")) &&
        !(await exists("infrastructure/migrations/0015_foundation.sql"));

    const checks = {
        A:
            manifest.foundationBaselineSha ===
                "f52eaf50b5c18d5970c40195b50f396e802b59e2" &&
            manifest.foundationValidationRun === "33834315603" &&
            j12.result === "A-T_PASS",
        B:
            Array.isArray(manifest.scope?.included) &&
            Array.isArray(manifest.scope?.excluded) &&
            manifest.scope.excluded.includes(
                "runtime implementation beyond J1.0 specification and freeze artifacts",
            ),
        C:
            Object.keys(manifest.contracts ?? {}).length === 16 &&
            Object.values(manifest.contracts ?? {}).every(
                (version) => version === 1,
            ),
        D: hasAll(roadmap, [
            "Canonical conversation lifecycle",
            "privacy preflight",
            "Universal Tool Gateway",
            "SHUTDOWN",
        ]),
        E:
            ["identity", "deviceTrust", "session", "securityEpoch"].every(
                foundationContract,
            ) &&
            hasAll(contracts, [
                "foundationSessionId",
                "deviceId",
                "securityEpoch",
            ]),
        F:
            hasAll(contracts, ["ownerId", "projectId", "conversationId"]) &&
            security.includes("Every conversation and turn is owner scoped"),
        G:
            hasAll(contracts, [
                "Context Envelope",
                "provenance",
                "classification ceiling",
                "freshness",
            ]) &&
            security.includes("Context sources carry provenance"),
        H:
            foundationContract("memory") &&
            foundationContract("neverStore") &&
            hasAll(contracts, ["Memory Request", "NEVER_STORE"]) &&
            security.includes("Memory write candidates are not silently promoted"),
        I:
            foundationContract("modelProviderPort") &&
            hasAll(architecture, [
                "provider-neutral port",
                "privacy preflight",
            ]) &&
            security.includes("D5 is external-model ineligible"),
        J:
            foundationContract("toolGateway") &&
            architecture.includes("No direct model-to-tool path exists") &&
            contracts.includes("Tool Proposal"),
        K:
            ["policy", "risk", "approval", "authorizationPermit"].every(
                foundationContract,
            ) &&
            security.includes(
                "Policy/risk/approval/permit binding remains Foundation-owned",
            ),
        L:
            foundationContract("emergencyControls") &&
            hasAll(architecture, ["FREEZE", "SAFE MODE", "SHUTDOWN"]) &&
            roadmap.includes("Operating modes and behavioral control"),
        M: hasAll(contracts, [
            "Conversation Retention",
            "deletion",
            "export",
            "NEVER_STORE",
        ]),
        N:
            hasAll(contracts, ["Stream Event", "Cancellation", "idempotent"]) &&
            security.includes("Retry/idempotency prevents duplicate governed execution"),
        O:
            foundationContract("audit") &&
            foundationContract("event") &&
            hasAll(contracts, ["Conversation Audit", "correlationId"]),
        P: hasAll(architecture, [
            "Database unavailability",
            "Redis/BullMQ unavailability",
            "Provider failure",
            "fails safely",
        ]),
        Q:
            architecture.includes("Web Conversation Surface") &&
            architecture.includes("untrusted presentation boundary") &&
            security.includes("UI state is untrusted"),
        R:
            Array.isArray(manifest.milestones) &&
            manifest.milestones.length === 13 &&
            manifest.milestones[0].includes("J1.0") &&
            manifest.milestones.at(-1).includes("J1.12"),
        S:
            manifest.releaseMetadataDebt?.statusDocumentStillContainsPreGoText ===
                true &&
            manifest.releaseMetadataDebt?.foundationManifestStillCarriesRcLabel ===
                true &&
            manifest.releaseMetadataDebt?.rule?.includes(
                "signed Foundation v1 release SHA",
            ),
        T:
            migration0015Absent &&
            schema.schemaVersion === 14 &&
            manifest.scope.excluded.includes("production model credentials") &&
            manifest.scope.excluded.includes(
                "runtime implementation beyond J1.0 specification and freeze artifacts",
            ) &&
            roadmap.includes("J1 runtime implementation: NOT STARTED BY J1.0"),
    };

    const phases = Object.fromEntries(
        letters.map((letter) => [
            letter,
            {
                result: checks[letter] ? "PASS" : "FAIL",
                evidence: catalog.gates.find(({ id }) => id === letter)?.name ?? null,
            },
        ]),
    );

    const suitesPassed = [unit, integration].every(
        (report) =>
            report.success === true &&
            report.numFailedTests === 0 &&
            report.numPendingTests === 0,
    );
    const passed =
        suitesPassed &&
        j1SpecTestPassed &&
        Object.values(phases).every((phase) => phase.result === "PASS");

    const result = {
        version: 1,
        milestone: "J1.0",
        startingFoundationSha: manifest.foundationBaselineSha,
        commit: process.env.GITHUB_SHA ?? null,
        runId: process.env.GITHUB_RUN_ID ?? null,
        typescript: unit.numPassedTests,
        postgres: integration.numPassedTests,
        foundationJ12: j12.result,
        realStackSequence: true,
        schemaVersion: schema.schemaVersion,
        migrationCount: schema.migrationCount,
        j1SpecTestPassed,
        phases,
        result: passed ? "A-T_PASS" : "A-T_FAIL",
        recommendation: passed
            ? "J1.0 DEVELOPMENT GO RECOMMENDED"
            : "J1.0 DEVELOPMENT GO NOT RECOMMENDED",
        verdict:
            "Evidence only. This verifier does not merge, modify main, start J1.1 or issue J1 Core + Conversation v1 GO.",
    };

    await writeFile(
        new URL(".jarvis/acceptance/j1.0-go.json", root),
        JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));

    if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(
            process.env.GITHUB_STEP_SUMMARY,
            "\n## J1.0 Core + Conversation A–T acceptance\n\n" +
                Object.entries(phases)
                    .map(
                        ([letter, phase]) =>
                            `| ${letter} | ${phase.result} | ${phase.evidence} |`,
                    )
                    .join("\n") +
                `\n\n**${result.recommendation}**\n`,
        );
    }

    if (!passed) process.exitCode = 1;
} catch (error) {
    console.error(
        "J1.0_A-T_FAIL",
        error instanceof Error ? error.message : "unknown",
    );
    process.exitCode = 1;
}
