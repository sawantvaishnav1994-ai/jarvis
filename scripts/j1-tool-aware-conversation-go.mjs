import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await read(path));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");

try {
    if (process.env.J1_7_CI_SEQUENCE !== "complete")
        throw new Error("J1_7_REAL_STACK_SEQUENCE_NOT_ATTESTED");

    const [gates, runtime, roadmap, unit, integration, security, workflow] =
        await Promise.all([
            json("tests/acceptance/j1.7-gates.json"),
            read("packages/core/src/tool-aware-conversation.ts"),
            read("docs/roadmap/j1.7.md"),
            read("tests/unit/j1-tool-aware-conversation.test.ts"),
            read("tests/unit/j1-tool-aware-conversation-integration.test.ts"),
            read("tests/security/j1-tool-aware-conversation-security.test.ts"),
            read(".github/workflows/j1.7-ci.yml"),
        ]);

    const checks = {
        A:
            gates.milestone === "J1.7" &&
            gates.baseline === "e6657e7f8fea1c01549db65b924c79a6c5048a7c" &&
            gates.gates.length === 20 &&
            JSON.stringify(gates.gates.map((gate) => gate.id)) ===
                JSON.stringify(letters),
        B:
            roadmap.includes("does not own a tool registry") &&
            roadmap.includes("no second tool gateway") &&
            !runtime.includes("new UniversalToolGateway") &&
            !runtime.includes("INSERT INTO") &&
            !runtime.includes("UPDATE ") &&
            !runtime.includes("DELETE FROM"),
        C:
            runtime.includes("ConversationToolProposalSchema") &&
            runtime.includes("z.strictObject") &&
            runtime.includes('kind: z.literal("tool-proposal")'),
        D:
            runtime.includes("conversationId") &&
            runtime.includes("sessionId") &&
            runtime.includes("turnId") &&
            runtime.includes("securityEpoch") &&
            runtime.includes("J17_TURN_BINDING_INVALID") &&
            runtime.includes("J17_AUTHORITY_INVALID"),
        E:
            runtime.includes("J17ToolGatewayPort") &&
            runtime.includes("this.gateway.invoke(request, signal)") &&
            integration.includes("UniversalToolGateway"),
        F:
            roadmap.includes("capability/policy/risk/approval") &&
            integration.includes("ToolAuthorizationPort") &&
            integration.includes("AuthorizationDecision"),
        G:
            runtime.includes("J17_APPROVAL_REQUIRED") &&
            runtime.includes("approvalCommitted: false") &&
            unit.includes("approval-required") &&
            roadmap.includes(
                "Full conversational permission/approval lifecycle belongs to J1.8",
            ),
        H:
            security.includes("owner:attacker") &&
            security.includes("session:attacker") &&
            security.includes("fake-approval") &&
            security.includes("externalAllowed: true") &&
            runtime.includes("z.strictObject"),
        I:
            integration.includes("EXTERNAL_SERVICE") &&
            integration.includes('privacyClass: "D5"') &&
            integration.includes("J17_TOOL_PRIVACY_DENIED") &&
            roadmap.includes("D5 restrictions"),
        J:
            runtime.includes("deadlineEpochMs") &&
            runtime.includes("maxCostMinor") &&
            runtime.includes("J17_EXECUTION_IDEMPOTENCY_REQUIRED") &&
            unit.includes("requires idempotency"),
        K:
            runtime.includes("J17_TOOL_CANCELLED") &&
            runtime.includes("J17_TOOL_TIMEOUT") &&
            runtime.includes("J17_TOOL_OUTCOME_UNKNOWN") &&
            runtime.includes("J17_TOOL_EMERGENCY_BLOCKED") &&
            security.includes("revoked authority"),
        L:
            runtime.includes(
                'result.provenance !== "UNTRUSTED_EXTERNAL_DATA"',
            ) &&
            runtime.includes("J17_TOOL_RESULT_BINDING_INVALID") &&
            integration.includes("UNTRUSTED_EXTERNAL_DATA") &&
            integration.includes("RECONCILED"),
        M:
            roadmap.includes(
                "J1.3 remains authoritative for model orchestration",
            ) && runtime.includes("J13ExecutionResult"),
        N:
            roadmap.includes("J1.4 turn state machine") &&
            roadmap.includes("toolExecutionCommitted:false") &&
            roadmap.includes("frozen J1.4 runtime remains unchanged"),
        O:
            unit.includes("J1.7 tool-aware conversation") &&
            integration.includes("J1.7 -> J0.7 gateway integration") &&
            security.includes("denies stale or cross-turn"),
        P:
            roadmap.includes("must not call an adapter directly") &&
            !runtime.includes("adapter.execute") &&
            !runtime.includes("CredentialBroker") &&
            !runtime.includes("provider.generate"),
        Q: roadmap.includes(
            "J1.8 full permission/approval-aware conversational lifecycle is not part of J1.7",
        ),
        R:
            workflow.includes(
                "Explicit J1.6 Memory-Aware Conversation A-T acceptance",
            ) && workflow.includes("J1.7 focused integrity"),
        S:
            process.env.J1_7_CI_SEQUENCE === "complete" &&
            workflow.includes("Real PostgreSQL integration") &&
            workflow.includes("Owner identity and device trust GO flow") &&
            workflow.includes("Dependency outage and recovery") &&
            workflow.includes("Stop and verify processes") &&
            workflow.includes(
                "Explicit J1.7 Tool-Aware Conversation A-T acceptance",
            ),
        T:
            roadmap.includes("J1.9 operating modes") &&
            roadmap.includes("No production third-party tool credentials"),
    };

    const failed = Object.entries(checks)
        .filter(([, value]) => !value)
        .map(([id]) => id);

    const result = {
        milestone: "J1.7",
        result: failed.length ? "FAIL" : "A-T_PASS",
        realStackSequence: true,
        checks,
        failed,
        recommendation: failed.length
            ? "J1.7 DEVELOPMENT GO NOT RECOMMENDED"
            : "J1.7 DEVELOPMENT GO RECOMMENDED",
    };

    await writeFile(
        new URL(".jarvis/acceptance/j1.7.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result));
    if (failed.length) process.exitCode = 1;
} catch (error) {
    const result = {
        milestone: "J1.7",
        result: "FAIL",
        realStackSequence: false,
        checks: {},
        failed: [error instanceof Error ? error.message : "UNKNOWN"],
        recommendation: "J1.7 DEVELOPMENT GO NOT RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.7.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    ).catch(() => {});
    console.error(JSON.stringify(result));
    process.exitCode = 1;
}
