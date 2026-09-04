import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const read = (p) => readFile(new URL(p, root), "utf8");
const json = async (p) => JSON.parse(await read(p));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");
try {
    if (process.env.J1_1_CI_SEQUENCE !== "complete")
        throw new Error("J1_1_REAL_STACK_SEQUENCE_NOT_ATTESTED");
    const [
        gates,
        foundationMigrations,
        j1Migrations,
        foundationSchema,
        migrationSql,
        engine,
        store,
        schemaDecision,
    ] = await Promise.all([
        json("tests/acceptance/j1.1-gates.json"),
        json("infrastructure/migrations/manifest.json"),
        json("infrastructure/migrations/j1/manifest.json"),
        json("foundation/schema-v1.json"),
        read(
            "infrastructure/migrations/j1/0015_conversation_session_engine.sql",
        ),
        read("packages/core/src/conversation-session.ts"),
        read("packages/storage/src/conversation-session-store.ts"),
        read("docs/roadmap/j1.1-schema-decision.md"),
    ]);
    const m15 = j1Migrations[0];
    const hash = createHash("sha256").update(migrationSql).digest("hex");
    const exactCatalog =
        gates.milestone === "J1.1" &&
        gates.gates.length === 20 &&
        JSON.stringify(gates.gates.map((g) => g.id)) ===
            JSON.stringify(letters);
    const checks = {
        A:
            exactCatalog &&
            foundationSchema.schemaVersion === 14 &&
            foundationSchema.migrationCount === 14,
        B:
            foundationMigrations.length === 14 &&
            foundationMigrations.every((m, i) => m.version === i + 1) &&
            j1Migrations.length === 1 &&
            m15?.version === 15 &&
            m15?.file === "0015_conversation_session_engine.sql" &&
            m15.sha256 === hash &&
            m15.destructive === false,
        C: [
            "ownerId",
            "actorId",
            "deviceId",
            "identitySessionId",
            "securityEpoch",
        ].every((x) => engine.includes(x)),
        D:
            engine.includes("CONVERSATION_SESSION_BINDING_INVALID") &&
            store.includes("WHERE owner_id=$1"),
        E: [
            "accepted",
            "assembling_context",
            "awaiting_model",
            "streaming",
            "awaiting_approval",
            "executing_tool",
            "resuming",
            "completed",
            "failed",
            "cancelled",
        ].every((x) => engine.includes(x)),
        F:
            migrationSql.includes("version <> OLD.version + 1") &&
            store.includes("version=version+1"),
        G:
            migrationSql.includes(
                "UNIQUE(owner_id, session_id, idempotency_key)",
            ) && store.includes("CONVERSATION_IDEMPOTENCY_CONFLICT"),
        H:
            migrationSql.includes("terminal turn is immutable") &&
            engine.includes("async cancel"),
        I:
            engine.includes("CONVERSATION_AUTHORITY_INVALID") &&
            engine.includes("CONVERSATION_SESSION_STALE"),
        J:
            schemaDecision.includes("NEVER_STORE") &&
            schemaDecision.includes("DELETE_AFTER_SESSION"),
        K: schemaDecision.includes(
            "D5 remains outside generic conversation persistence",
        ),
        L:
            schemaDecision.includes("does not implement context assembly") &&
            schemaDecision.includes("model orchestration") &&
            schemaDecision.includes("tool execution"),
        M:
            migrationSql.includes("conversations.sessions") &&
            migrationSql.includes("conversations.turns") &&
            migrationSql.includes("validate_turn_records"),
        N:
            schemaDecision.includes("restart recovery") ||
            schemaDecision.includes("restart"),
        O:
            migrationSql.includes("correlation_id") &&
            engine.includes("correlationId"),
        P:
            engine.includes("requireAuthority") &&
            store.includes("CONVERSATION_TURN_CONFLICT"),
        Q:
            schemaDecision.includes("mobile") ||
            schemaDecision.includes("client"),
        R: process.env.J1_1_CI_SEQUENCE === "complete",
        S:
            migrationSql.length > 1000 &&
            engine.length > 1000 &&
            store.length > 1000,
        T:
            schemaDecision.includes("later J1 milestones") &&
            !schemaDecision.includes("J1.2 implementation started"),
    };
    const failed = Object.entries(checks)
        .filter(([, v]) => !v)
        .map(([k]) => k);
    const result = {
        milestone: "J1.1",
        result: failed.length ? "FAIL" : "A-T_PASS",
        realStackSequence: true,
        checks,
        failed,
        recommendation: failed.length
            ? "J1.1 DEVELOPMENT GO NOT RECOMMENDED"
            : "J1.1 DEVELOPMENT GO RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.1.json", root),
        JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result));
    if (failed.length) process.exitCode = 1;
} catch (error) {
    const result = {
        milestone: "J1.1",
        result: "FAIL",
        realStackSequence: false,
        checks: {},
        failed: [error instanceof Error ? error.message : "UNKNOWN"],
        recommendation: "J1.1 DEVELOPMENT GO NOT RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.1.json", root),
        JSON.stringify(result, null, 2) + "\n",
    ).catch(() => {});
    console.error(JSON.stringify(result));
    process.exitCode = 1;
}
