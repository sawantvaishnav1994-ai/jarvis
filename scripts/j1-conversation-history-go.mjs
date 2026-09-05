import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await read(path));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");
try {
    if (process.env.J1_5_CI_SEQUENCE !== "complete")
        throw new Error("J1_5_REAL_STACK_SEQUENCE_NOT_ATTESTED");
    const [
        gates,
        runtime,
        store,
        roadmap,
        unit,
        integration,
        security,
        migration,
        workflow,
    ] = await Promise.all([
        json("tests/acceptance/j1.5-gates.json"),
        read("packages/core/src/conversation-history.ts"),
        read("packages/storage/src/conversation-history-store.ts"),
        read("docs/roadmap/j1.5.md"),
        read("tests/unit/j1-conversation-history.test.ts"),
        read("tests/integration/j1-conversation-history-postgres.test.ts"),
        read("tests/security/j1-conversation-history-security.test.ts"),
        read("infrastructure/migrations/j1/0016_conversation_persistence_history.sql"),
        read(".github/workflows/ci.yml"),
    ]);
    const checks = {
        A:
            gates.milestone === "J1.5" &&
            gates.baseline === "c454bc7f9198f3b9b549d2239183cd0d83c67ddf" &&
            gates.gates.length === 20 &&
            JSON.stringify(gates.gates.map((gate) => gate.id)) ===
                JSON.stringify(letters),
        B:
            migration.includes("history_conversations") &&
            migration.includes("history_messages") &&
            migration.includes("turn_results") &&
            !/\b(DROP|TRUNCATE)\b/i.test(migration),
        C:
            roadmap.includes("PrivateRecords") &&
            roadmap.includes("encrypted source of truth") &&
            runtime.includes("ConversationHistoryDigester") &&
            runtime.includes("digestContent"),
        D:
            migration.includes("owner_id") &&
            migration.includes("project_id") &&
            migration.includes("security_epoch") &&
            runtime.includes("J15_PIPELINE_BINDING_INVALID"),
        E:
            store.includes("J15_CONVERSATION_BINDING_CONFLICT") &&
            store.includes("getConversation"),
        F:
            store.includes("FOR UPDATE") &&
            store.includes("J15_CONVERSATION_ARCHIVED") &&
            store.includes("J15_CONVERSATION_VERSION_CONFLICT"),
        G:
            store.includes("updated_at,conversation_id") &&
            runtime.includes("ConversationHistoryCursor"),
        H:
            store.includes("ORDER BY ordinal ASC") &&
            runtime.includes("afterOrdinal"),
        I: store.includes("FOR UPDATE") && store.includes("MAX(ordinal)"),
        J: store.includes("J15_MESSAGE_IDEMPOTENCY_CONFLICT"),
        K:
            runtime.includes("J14TurnPipelineInput") &&
            runtime.includes("J14TurnPipelineResult") &&
            runtime.includes("persistPipelineResult"),
        L:
            security.includes("never forwards message or response plaintext") &&
            migration.includes("content_digest") &&
            migration.includes("response_digest"),
        M:
            store.includes("sameTurnResult") &&
            store.includes("J15_TURN_RESULT_CONFLICT"),
        N:
            integration.includes("new PostgresConversationHistoryRepository(pool)") &&
            roadmap.includes("process restart"),
        O:
            unit.includes("J1.5 conversation persistence and history") &&
            security.includes("J1.5 conversation history security boundaries") &&
            integration.includes("J1.5 PostgreSQL persistence and restart recovery"),
        P: roadmap.includes("J1.6 memory-aware conversation is not part of J1.5"),
        Q:
            roadmap.includes("J1.7 tool-aware conversation") &&
            roadmap.includes("J1.8 approval-aware execution"),
        R:
            workflow.includes("Explicit J1.4 Response Turn Pipeline A-T acceptance") &&
            workflow.includes("J1.5 conversation history integrity"),
        S:
            process.env.J1_5_CI_SEQUENCE === "complete" &&
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
        milestone: "J1.5",
        result: failed.length ? "FAIL" : "A-T_PASS",
        realStackSequence: true,
        checks,
        failed,
        recommendation: failed.length
            ? "J1.5 DEVELOPMENT GO NOT RECOMMENDED"
            : "J1.5 DEVELOPMENT GO RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.5.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result));
    if (failed.length) process.exitCode = 1;
} catch (error) {
    const result = {
        milestone: "J1.5",
        result: "FAIL",
        realStackSequence: false,
        checks: {},
        failed: [error instanceof Error ? error.message : "UNKNOWN"],
        recommendation: "J1.5 DEVELOPMENT GO NOT RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.5.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    ).catch(() => {});
    console.error(JSON.stringify(result));
    process.exitCode = 1;
}
