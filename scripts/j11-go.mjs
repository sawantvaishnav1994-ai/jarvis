import { appendFile, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");

try {
    const [catalog, unit, integration, j04, j05, j06, j07, j08, j09, j10] = await Promise.all([
        read("tests/acceptance/j11-gates.json"),
        read(".jarvis/acceptance/unit.json"),
        read(".jarvis/acceptance/integration.json"),
        read(".jarvis/acceptance/j04-go.json"),
        read(".jarvis/acceptance/j05-go.json"),
        read(".jarvis/acceptance/j06-go.json"),
        read(".jarvis/acceptance/j07-go.json"),
        read(".jarvis/acceptance/j08-go.json"),
        read(".jarvis/acceptance/j09-go.json"),
        read(".jarvis/acceptance/j10-go.json"),
    ]);

    if (
        catalog.milestone !== "J0.11 Full Foundation Integration, Adversarial Validation & Release-Candidate Qualification" ||
        catalog.baseline !== "f00eabba0bf4cda66b906d61a8e050b95123463f" ||
        !Array.isArray(catalog.gates) ||
        catalog.gates.length !== 20
    ) throw new Error("GO_CATALOG_INVALID");

    if (j04.result !== "A-S_PASS" || [j05, j06, j07, j08, j09, j10].some((v) => v.result !== "A-T_PASS"))
        throw new Error("PRIOR_REGRESSION_GATE_NOT_PASSING");

    if (process.env.J11_CI_SEQUENCE !== "complete")
        throw new Error("REAL_STACK_SEQUENCE_NOT_ATTESTED");

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
        "J0.1-J0.3": "covered-by-cumulative-static-integration-browser-regression",
        "J0.4": j04.result,
        "J0.5": j05.result,
        "J0.6": j06.result,
        "J0.7": j07.result,
        "J0.8": j08.result,
        "J0.9": j09.result,
        "J0.10": j10.result,
    };
    const result = {
        version: 1,
        milestone: "J0.11",
        baseline: catalog.baseline,
        commit: process.env.GITHUB_SHA ?? null,
        runId: process.env.GITHUB_RUN_ID ?? null,
        typescript: unit.numPassedTests,
        postgres: integration.numPassedTests,
        realStackSequence: true,
        regression,
        phases,
        result: passed ? "A-T_PASS" : "A-T_FAIL",
        verdict: "Verifier is evidence only. It does not merge, issue J0 Foundation v1 GO, start J0.12, or start J1. Owner review remains required.",
    };

    await writeFile(new URL(".jarvis/acceptance/j11-go.json", root), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(
            process.env.GITHUB_STEP_SUMMARY,
            "\n## J0.11 A–T acceptance\n\n" +
                Object.entries(phases).map(([letter, phase]) => `| ${letter} | ${phase.result} | ${phase.assertions} assertion(s) |`).join("\n") +
                "\n",
        );
    }
    if (!passed) process.exitCode = 1;
} catch (error) {
    console.error("J0.11_A-T_FAIL", error instanceof Error ? error.message : "unknown");
    process.exitCode = 1;
}
