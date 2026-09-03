import { readFile, writeFile, appendFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
try {
    const [catalog, unit, integration] = await Promise.all([
        read("tests/acceptance/j04-gates.json"), read(".jarvis/acceptance/unit.json"), read(".jarvis/acceptance/integration.json"),
    ]);
    const letters = "ABCDEFGHIJKLMNOPQRS".split("");
    if (catalog.version !== 1 || Object.keys(catalog).filter(key => key !== "version").join("") !== letters.join("")) throw new Error("GO_CATALOG_INVALID");
    const assertions = [unit, integration].flatMap(report => report.testResults.flatMap(suite => suite.assertionResults));
    const phases = Object.fromEntries(letters.map(letter => {
        const expected = catalog[letter];
        if (!Array.isArray(expected) || expected.length === 0) throw new Error("GO_EMPTY_PHASE");
        const failures = expected.filter(title => !assertions.some(test => test.title === title && test.status === "passed"));
        return [letter, { result: failures.length ? "FAIL" : "PASS", assertions: expected.length, failures }];
    }));
    const suitesPassed = [unit, integration].every(report => report.success === true && report.numFailedTests === 0 && report.numPendingTests === 0);
    const passed = suitesPassed && Object.values(phases).every(phase => phase.result === "PASS");
    const result = { version: 1, commit: process.env.GITHUB_SHA ?? null, runId: process.env.GITHUB_RUN_ID ?? null,
        typescript: unit.numPassedTests, postgres: integration.numPassedTests, phases,
        result: passed ? "A-S_PASS" : "A-S_FAIL", verdict: "Exact-commit CI, browser, lifecycle and Python success are also required; this report never merges or grants GO automatically." };
    await writeFile(new URL(".jarvis/acceptance/j04-go.json", root), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
        `\n## J0.4 A–S acceptance\n\nCommit: ${result.commit}\n\n| Phase | Result | Assertions |\n|---|---|---:|\n` +
        Object.entries(phases).map(([letter, phase]) => `| ${letter} | ${phase.result} | ${phase.assertions} |`).join("\n") + "\n");
    if (!passed) process.exitCode = 1;
} catch (error) {
    console.error("J0.4_A-S_FAIL: missing or invalid acceptance evidence", error instanceof Error ? error.message : "unknown");
    process.exitCode = 1;
}
