import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await read(path));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");

try {
    if (process.env.J1_6_CI_SEQUENCE !== "complete")
        throw new Error("J1_6_REAL_STACK_SEQUENCE_NOT_ATTESTED");

    const [
        gates,
        runtime,
        roadmap,
        unit,
        security,
        inheritedWorkflow,
        j16Workflow,
    ] = await Promise.all([
        json("tests/acceptance/j1.6-gates.json"),
        read("packages/core/src/memory-aware-conversation.ts"),
        read("docs/roadmap/j1.6.md"),
        read("tests/unit/j1-memory-aware-conversation.test.ts"),
        read("tests/security/j1-memory-aware-conversation-security.test.ts"),
        read(".github/workflows/ci.yml"),
        read(".github/workflows/j1.6-ci.yml"),
    ]);
    const workflow = `${inheritedWorkflow}\n${j16Workflow}`;

    const checks = {
        A:
            gates.milestone === "J1.6" &&
            gates.baseline === "0fff75bd8ab4835c8a87b79ab8c9d639c3011eec" &&
            gates.gates.length === 20 &&
            JSON.stringify(gates.gates.map((gate) => gate.id)) ===
                JSON.stringify(letters),
        B:
            roadmap.includes("introduces no database migration") &&
            roadmap.includes("second memory authority") &&
            !runtime.includes("INSERT INTO") &&
            !runtime.includes("UPDATE ") &&
            !runtime.includes("DELETE FROM"),
        C:
            runtime.includes("ConversationMemoryRetrievalPort") &&
            roadmap.includes("J0 memory retrieval authority"),
        D:
            runtime.includes("conversationId") &&
            runtime.includes("sessionId") &&
            runtime.includes("turnId") &&
            runtime.includes("securityEpoch") &&
            runtime.includes("J16_MEMORY_AUTHORITY_MISMATCH"),
        E:
            runtime.includes("ContextAssembler") &&
            runtime.includes("this.assembler.assemble") &&
            unit.includes("passes it through J1.2 context assembly"),
        F:
            unit.includes("D5_GENERIC_CONTEXT_DENIED") &&
            unit.includes("DELETED_OR_REVOKED") &&
            roadmap.includes("retention boundaries"),
        G:
            roadmap.includes("context budget") &&
            roadmap.includes("trust") &&
            runtime.includes("ContextAssemblyPolicy"),
        H:
            runtime.includes("memoryDegraded") &&
            runtime.includes("memoryDegradationReasons") &&
            unit.includes("propagates degraded retrieval"),
        I:
            runtime.includes("candidate.content.trim().length === 0") &&
            runtime.includes("candidate.provenance.trim().length === 0"),
        J:
            runtime.includes("ConversationMemoryAdmissionPort") &&
            runtime.includes("return this.admission.submit(candidate)") &&
            unit.includes("only through the admission port"),
        K:
            runtime.includes("J16_MEMORY_CANDIDATE_AUTHORITY_MISMATCH") &&
            security.includes("cross-owner") &&
            security.includes("cross-project"),
        L:
            roadmap.includes("does not directly mutate a memory table") &&
            roadmap.includes("Model output does not directly mutate"),
        M:
            roadmap.includes(
                "J1.3 remains authoritative for model orchestration",
            ) && roadmap.includes("no direct provider calls outside J1.3"),
        N:
            roadmap.includes(
                "J1.5 remains authoritative for durable conversation history",
            ) && roadmap.includes("Durable conversation history remains J1.5"),
        O:
            unit.includes("J1.6 memory-aware conversation") &&
            security.includes(
                "J1.6 memory-aware conversation security boundaries",
            ),
        P: roadmap.includes("J1.7 tool-aware conversation is not part of J1.6"),
        Q: roadmap.includes(
            "J1.8 approval-aware execution is not part of J1.6",
        ),
        R:
            workflow.includes(
                "Explicit J1.5 Conversation Persistence History A-T acceptance",
            ) && workflow.includes("J1.6 memory-aware conversation integrity"),
        S:
            process.env.J1_6_CI_SEQUENCE === "complete" &&
            workflow.includes("Real PostgreSQL integration") &&
            workflow.includes("Owner identity and device trust GO flow") &&
            workflow.includes("Dependency outage and recovery") &&
            workflow.includes("Stop and verify processes"),
        T:
            roadmap.includes("J1.9 operating modes") &&
            roadmap.includes("No production model credentials"),
    };

    const failed = Object.entries(checks)
        .filter(([, value]) => !value)
        .map(([id]) => id);

    const result = {
        milestone: "J1.6",
        result: failed.length ? "FAIL" : "A-T_PASS",
        realStackSequence: true,
        checks,
        failed,
        recommendation: failed.length
            ? "J1.6 DEVELOPMENT GO NOT RECOMMENDED"
            : "J1.6 DEVELOPMENT GO RECOMMENDED",
    };

    await writeFile(
        new URL(".jarvis/acceptance/j1.6.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result));
    if (failed.length) process.exitCode = 1;
} catch (error) {
    const result = {
        milestone: "J1.6",
        result: "FAIL",
        realStackSequence: false,
        checks: {},
        failed: [error instanceof Error ? error.message : "UNKNOWN"],
        recommendation: "J1.6 DEVELOPMENT GO NOT RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.6.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    ).catch(() => {});
    console.error(JSON.stringify(result));
    process.exitCode = 1;
}
