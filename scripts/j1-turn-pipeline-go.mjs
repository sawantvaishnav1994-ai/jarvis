import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await read(path));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");
try {
    if (process.env.J1_4_CI_SEQUENCE !== "complete")
        throw new Error("J1_4_REAL_STACK_SEQUENCE_NOT_ATTESTED");
    const [
        gates,
        runtime,
        roadmap,
        unit,
        integration,
        postgres,
        security,
        workflow,
    ] = await Promise.all([
        json("tests/acceptance/j1.4-gates.json"),
        read("packages/core/src/turn-pipeline.ts"),
        read("docs/roadmap/j1.4.md"),
        read("tests/unit/j1-turn-pipeline.test.ts"),
        read("tests/unit/j1-turn-pipeline-integration.test.ts"),
        read("tests/integration/j1-turn-pipeline-postgres.test.ts"),
        read("tests/security/j1-turn-pipeline-security.test.ts"),
        read(".github/workflows/ci.yml"),
    ]);
    const checks = {
        A:
            gates.milestone === "J1.4" &&
            gates.baseline === "721da16c4bb40f6ac1a4422b2fbb453f2db666da" &&
            gates.gates.length === 20 &&
            JSON.stringify(gates.gates.map((gate) => gate.id)) ===
                JSON.stringify(letters),
        B:
            roadmap.includes("ACCEPTED -> AUTHORITY_VALIDATING") &&
            runtime.includes("MODEL_RESULT_RECEIVED") &&
            runtime.includes("EMERGENCY_STOPPED") &&
            runtime.includes("assertTransition"),
        C:
            roadmap.includes("J1.1 Conversation/Session") &&
            runtime.includes("sessionId") &&
            integration.includes("ConversationSessionEngine") &&
            postgres.includes("PostgresConversationSessionRepository"),
        D:
            runtime.includes("currentAuthority") &&
            runtime.split("await currentAuthority()").length >= 6 &&
            runtime.includes("SECURITY_EPOCH_CHANGED"),
        E:
            roadmap.includes("J1.2 `ContextEnvelope`") &&
            runtime.includes("ContextEnvelope") &&
            runtime.includes("this.context.assemble"),
        F:
            roadmap.includes("J1.3 execution port") &&
            runtime.includes("J13ExecutionResult") &&
            runtime.includes("this.model.execute"),
        G:
            runtime.includes("acceptedAsContentOnly: true") &&
            runtime.includes("toolExecutionCommitted: false") &&
            runtime.includes("approvalCommitted: false") &&
            runtime.includes("memoryWriteCommitted: false"),
        H:
            runtime.includes("CANCELLED") &&
            runtime.includes("REVOKED") &&
            runtime.includes("TIMED_OUT") &&
            security.includes("late result after authority revocation"),
        I:
            runtime.includes("SAFE_MODE_BLOCKED") &&
            runtime.includes("FREEZE") &&
            runtime.includes("SHUTDOWN"),
        J:
            runtime.includes("J14_TURN_BINDING_INVALID") &&
            runtime.includes("J14_OWNER_BINDING_INVALID") &&
            runtime.includes("J14_PROJECT_BINDING_INVALID"),
        K:
            runtime.includes("J14_IDEMPOTENCY_CONFLICT") &&
            runtime.includes("inputDigest") &&
            runtime.includes("contextDigest") &&
            runtime.includes("modelOperationDigest"),
        L:
            runtime.includes('kind: "content"') &&
            roadmap.includes("Partial/content events cannot commit tools"),
        M:
            roadmap.includes("No J1.4 migration is required") &&
            roadmap.includes("J1.5"),
        N:
            runtime.includes("J14AuditRecord") &&
            security.includes("prompt/context plaintext") &&
            roadmap.includes("do not include prompt bodies"),
        O:
            unit.includes("governed response turn pipeline") &&
            integration.includes("J1.1 -> J1.2 -> J1.3 composition") &&
            postgres.includes("J1.4 PostgreSQL turn coordination") &&
            security.includes("J1.4 security boundaries"),
        P:
            roadmap.includes("J1.7 tool-aware conversation") &&
            runtime.includes("toolExecutionCommitted: false") &&
            runtime.includes("approvalCommitted: false"),
        Q:
            roadmap.includes("J1.6 memory-aware conversation") &&
            runtime.includes("memoryWriteCommitted: false"),
        R:
            workflow.includes("Explicit J1.3 Model Orchestration A-T acceptance") &&
            workflow.includes("J1.4 turn pipeline integrity"),
        S:
            process.env.J1_4_CI_SEQUENCE === "complete" &&
            workflow.includes("Real PostgreSQL integration") &&
            workflow.includes("j1-turn-pipeline-postgres.test.ts") &&
            workflow.includes("Owner identity and device trust GO flow") &&
            workflow.includes("Dependency outage and recovery") &&
            workflow.includes("Stop and verify processes"),
        T:
            roadmap.includes("J1.5 persistence/history") &&
            roadmap.includes("No production model credentials") &&
            roadmap.includes("not part of J1.4"),
    };
    const failed = Object.entries(checks)
        .filter(([, value]) => !value)
        .map(([id]) => id);
    const result = {
        milestone: "J1.4",
        result: failed.length ? "FAIL" : "A-T_PASS",
        realStackSequence: true,
        checks,
        failed,
        recommendation: failed.length
            ? "J1.4 DEVELOPMENT GO NOT RECOMMENDED"
            : "J1.4 DEVELOPMENT GO RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.4.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result));
    if (failed.length) process.exitCode = 1;
} catch (error) {
    const result = {
        milestone: "J1.4",
        result: "FAIL",
        realStackSequence: false,
        checks: {},
        failed: [error instanceof Error ? error.message : "UNKNOWN"],
        recommendation: "J1.4 DEVELOPMENT GO NOT RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.4.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    ).catch(() => {});
    console.error(JSON.stringify(result));
    process.exitCode = 1;
}
