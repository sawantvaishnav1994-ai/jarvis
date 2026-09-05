import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await read(path));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");

try {
    if (process.env.J1_8_CI_SEQUENCE !== "complete")
        throw new Error("J1_8_REAL_STACK_SEQUENCE_NOT_ATTESTED");

    const [gates, runtime, roadmap, unit, security, workflow, j17Runtime] =
        await Promise.all([
            json("tests/acceptance/j1.8-gates.json"),
            read("packages/core/src/permission-approval-aware-conversation.ts"),
            read("docs/roadmap/j1.8.md"),
            read(
                "tests/unit/j1-permission-approval-aware-conversation.test.ts",
            ),
            read(
                "tests/security/j1-permission-approval-aware-conversation-security.test.ts",
            ),
            read(".github/workflows/j1.8-ci.yml"),
            read("packages/core/src/tool-aware-conversation.ts"),
        ]);

    const checks = {
        A:
            gates.milestone === "J1.8" &&
            gates.baseline === "7933a626ea058975101e8eb6a0d93dbd1046c065" &&
            gates.gates.length === 20 &&
            JSON.stringify(gates.gates.map((gate) => gate.id)) ===
                JSON.stringify(letters),
        B:
            roadmap.includes("J0 remains sole authority") &&
            roadmap.includes(
                "never mints approval proof or execution permits",
            ) &&
            !runtime.includes("new GovernanceEngine") &&
            !runtime.includes("AuthorizationV3Schema.parse") &&
            !runtime.includes("ExecutionPermit"),
        C:
            runtime.includes("J17_APPROVAL_REQUIRED") &&
            runtime.includes("this.approvals.requestApproval(input)") &&
            unit.includes("only after J1.7 reports approval required"),
        D:
            runtime.includes("approval.requestId !== input.requestId") &&
            runtime.includes(
                "approval.correlationId !== input.correlationId",
            ) &&
            runtime.includes(
                "approval.conversationId !== input.authority.conversationId",
            ) &&
            runtime.includes(
                "approval.sessionId !== input.authority.sessionId",
            ) &&
            runtime.includes("approval.turnId !== input.authority.turnId") &&
            runtime.includes("approval.ownerId !== input.authority.ownerId") &&
            runtime.includes(
                "approval.securityEpoch !== input.authority.securityEpoch",
            ),
        E:
            runtime.includes('assurance: "A3"') &&
            runtime.includes("ownerSessionId") &&
            runtime.includes("ownerDeviceId") &&
            runtime.includes("proofId") &&
            unit.includes("trusted owner A3 decision material"),
        F:
            roadmap.includes("cannot approve their own requests") &&
            runtime.includes("J18OwnerDecisionInput") &&
            !runtime.includes("modelResult.approval") &&
            !runtime.includes('actorRole === "AGENT"'),
        G:
            runtime.includes('state: "DENIED"') &&
            runtime.includes('state: "EXPIRED"') &&
            runtime.includes('state: "REVOKED"') &&
            runtime.includes('approval.status !== "APPROVED"') &&
            security.includes('status: "CONSUMED"'),
        H:
            security.includes("owner:attacker") &&
            security.includes("project:attacker") &&
            security.includes("conversation:attacker") &&
            security.includes("session:attacker") &&
            security.includes("turn:attacker") &&
            security.includes("request:attacker") &&
            security.includes("correlation:attacker") &&
            security.includes("securityEpoch: authority.securityEpoch + 1"),
        I:
            runtime.includes("approval.approvalReference") &&
            runtime.includes("approvalReference: approval.approvalReference") &&
            unit.includes("J0-issued approval reference"),
        J:
            roadmap.includes("J1.7 idempotency") &&
            j17Runtime.includes("this.gateway.invoke(request, signal)") &&
            !runtime.includes("UniversalToolGateway"),
        K:
            runtime.includes("J18_CANCELLED") &&
            security.includes("fails closed when cancelled") &&
            roadmap.includes(
                "Policy/risk/security changes remain revalidated by J0",
            ),
        L:
            security.includes("consumed approval replay") &&
            roadmap.includes("replay and race handling") &&
            runtime.includes("J18_APPROVAL_NOT_READY"),
        M:
            roadmap.includes("J1.7 gateway attempt") &&
            j17Runtime.includes("J13ExecutionResult") &&
            workflow.includes(
                "Explicit J1.7 Tool-Aware Conversation A-T acceptance",
            ),
        N:
            roadmap.includes("J1.0–J1.7 qualification") &&
            workflow.includes(
                "Explicit J1.5 Conversation Persistence History A-T acceptance",
            ) &&
            workflow.includes(
                "Explicit J1.6 Memory-Aware Conversation A-T acceptance",
            ),
        O:
            unit.includes("J1.8 permission/approval-aware conversation") &&
            security.includes("J1.8 approval lifecycle security"),
        P:
            !runtime.includes("adapter.execute") &&
            !runtime.includes("CredentialBroker") &&
            !runtime.includes("provider.generate") &&
            !runtime.includes("INSERT INTO") &&
            !runtime.includes("UPDATE ") &&
            !runtime.includes("DELETE FROM"),
        Q:
            roadmap.includes("conversation/audit") &&
            roadmap.includes("J0 authority adapter") &&
            workflow.includes("Owner identity and device trust GO flow"),
        R:
            workflow.includes("Explicit J0.4 A-S acceptance") &&
            workflow.includes(
                "Explicit J1.7 Tool-Aware Conversation A-T acceptance",
            ),
        S:
            process.env.J1_8_CI_SEQUENCE === "complete" &&
            workflow.includes("Real PostgreSQL integration") &&
            workflow.includes("Dependency outage and recovery") &&
            workflow.includes("Stop and verify processes") &&
            workflow.includes(
                "Explicit J1.8 Permission Approval-Aware Conversation A-T acceptance",
            ),
        T:
            roadmap.includes("J1.9") &&
            roadmap.includes("No production third-party credentials"),
    };

    const failed = Object.entries(checks)
        .filter(([, value]) => !value)
        .map(([id]) => id);
    const result = {
        milestone: "J1.8",
        result: failed.length ? "FAIL" : "A-T_PASS",
        realStackSequence: true,
        checks,
        failed,
        recommendation: failed.length
            ? "J1.8 DEVELOPMENT GO NOT RECOMMENDED"
            : "J1.8 DEVELOPMENT GO RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.8.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result));
    if (failed.length) process.exitCode = 1;
} catch (error) {
    const result = {
        milestone: "J1.8",
        result: "FAIL",
        realStackSequence: false,
        checks: {},
        failed: [error instanceof Error ? error.message : "UNKNOWN"],
        recommendation: "J1.8 DEVELOPMENT GO NOT RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.8.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    ).catch(() => {});
    console.error(JSON.stringify(result));
    process.exitCode = 1;
}
