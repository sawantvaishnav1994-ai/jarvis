import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await read(path));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");

async function writeResult(result) {
    await mkdir(new URL(".jarvis/acceptance/", root), { recursive: true });
    await writeFile(
        new URL(".jarvis/acceptance/j1.12.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    );
}

try {
    if (process.env.J1_12_CI_SEQUENCE !== "complete")
        throw new Error("J1_12_REAL_STACK_SEQUENCE_NOT_ATTESTED");

    const [
        gates,
        roadmap,
        j11Handler,
        webProxy,
        webClient,
        j19,
        j110,
        j17,
        j18,
        history,
        memory,
        workflow,
    ] = await Promise.all([
        json("tests/acceptance/j1.12-gates.json"),
        read("docs/roadmap/j1.12.md"),
        read("apps/api/src/conversation-http.ts"),
        read("apps/web/app/api/conversation/route.ts"),
        read("apps/web/app/conversation/conversation-console.tsx"),
        read("packages/core/src/operating-modes.ts"),
        read("packages/core/src/streaming-resilience.ts"),
        read("packages/core/src/tool-aware-conversation.ts"),
        read("packages/core/src/permission-approval-aware-conversation.ts"),
        read("packages/core/src/conversation-history.ts"),
        read("packages/core/src/memory-aware-conversation.ts"),
        read(".github/workflows/j1.12-ci.yml"),
    ]);

    const checks = {
        A:
            gates.milestone === "J1.12" &&
            gates.baseline === "cf203bb71df1d4cb19e819546f2684201e04cc16" &&
            gates.gates.length === 20 &&
            JSON.stringify(gates.gates.map((gate) => gate.id)) ===
                JSON.stringify(letters),
        B:
            roadmap.includes("J0 remains sole authority") &&
            roadmap.includes("authorization permits") &&
            !j11Handler.includes("new GovernanceEngine") &&
            !j11Handler.includes("ExecutionPermit"),
        C:
            j11Handler.includes('"identity.inspect"') &&
            j11Handler.includes("requestBindingDigest") &&
            webProxy.includes('cookies()).get("jarvis_session")') &&
            !webClient.includes("jarvis_session"),
        D:
            roadmap.includes("J1 conversation session") &&
            roadmap.includes("Foundation session") &&
            workflow.includes("J1.1 Conversation Session"),
        E:
            j19.includes("J19OperatingModeCoordinator") &&
            roadmap.includes("Operating modes can reduce eligibility") &&
            workflow.includes("J1.9 Operating Modes"),
        F:
            roadmap.includes("classification-aware") &&
            roadmap.includes("D5") &&
            workflow.includes("J1.2 Context Assembly"),
        G:
            memory.includes("ConversationMemoryRetrievalPort") &&
            memory.includes("submitCandidate") &&
            roadmap.includes("no silent promotion") &&
            workflow.includes("J1.6 Memory-Aware Conversation"),
        H:
            j11Handler.includes("J13ModelOrchestrator") &&
            roadmap.includes("provider") &&
            workflow.includes("J1.3 Model Orchestration"),
        I:
            j11Handler.includes("J14TurnPipeline") &&
            workflow.includes("J1.4 Response Turn Pipeline"),
        J:
            j110.includes("replayedProtectedSideEffects: false") &&
            roadmap.includes("never replays protected side effects") &&
            workflow.includes("J1.10 Streaming Cancellation Resilience"),
        K:
            j17.includes("this.gateway.invoke(request, signal)") &&
            roadmap.includes("J1.7 → J0.7") &&
            workflow.includes("J1.7 Tool-Aware Conversation"),
        L:
            j18.includes('assurance: "A3"') &&
            j18.includes("J18_SELF_APPROVAL_DENIED") &&
            j18.includes("assertStableBinding") &&
            workflow.includes("J1.8 Permission Approval-Aware Conversation"),
        M:
            history.includes("persistPipelineResult") &&
            roadmap.includes("NEVER_STORE") &&
            workflow.includes("J1.5 Conversation Persistence History"),
        N:
            roadmap.includes("Audit/events") &&
            workflow.includes("audit") &&
            workflow.includes("event"),
        O:
            webProxy.includes("signService") &&
            webClient.includes("Security epoch") &&
            webClient.includes("Approval") &&
            webClient.includes("Tool") &&
            workflow.includes("J1.11 Conversational Web UI"),
        P:
            roadmap.includes("Device removal") &&
            roadmap.includes("SAFE MODE") &&
            roadmap.includes("FREEZE") &&
            roadmap.includes("SHUTDOWN") &&
            workflow.includes("emergency"),
        Q:
            roadmap.includes("PostgreSQL") &&
            roadmap.includes("Redis") &&
            roadmap.includes("model/provider") &&
            roadmap.includes("tool") &&
            workflow.includes("outage") &&
            workflow.includes("recovery"),
        R:
            roadmap.includes("duplicate") &&
            roadmap.includes("race") &&
            roadmap.includes("late result") &&
            workflow.includes("replay") &&
            workflow.includes("race"),
        S:
            process.env.J1_12_CI_SEQUENCE === "complete" &&
            workflow.includes("J0.4") &&
            workflow.includes("J0.12") &&
            workflow.includes("J1.0") &&
            workflow.includes("J1.11"),
        T:
            roadmap.includes("No production credentials") &&
            roadmap.includes("exact-main") &&
            roadmap.includes("J1 Core + Conversation v1 GO"),
    };

    const failed = Object.entries(checks)
        .filter(([, value]) => !value)
        .map(([id]) => id);
    const result = {
        milestone: "J1.12",
        result: failed.length ? "FAIL" : "A-T_PASS",
        realStackSequence: true,
        checks,
        failed,
        recommendation: failed.length
            ? "J1 CORE + CONVERSATION V1 GO NOT RECOMMENDED"
            : "J1 CORE + CONVERSATION V1 GO RECOMMENDED",
    };
    await writeResult(result);
    console.log(JSON.stringify(result));
    if (failed.length) process.exitCode = 1;
} catch (error) {
    const result = {
        milestone: "J1.12",
        result: "FAIL",
        realStackSequence: false,
        checks: {},
        failed: [error instanceof Error ? error.message : "UNKNOWN"],
        recommendation: "J1 CORE + CONVERSATION V1 GO NOT RECOMMENDED",
    };
    await writeResult(result).catch(() => {});
    console.error(JSON.stringify(result));
    process.exitCode = 1;
}
