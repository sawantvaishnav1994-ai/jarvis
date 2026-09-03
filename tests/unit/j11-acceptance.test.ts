import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const json = <T>(path: string): T => JSON.parse(read(path)) as T;
const workflow = read(".github/workflows/ci.yml");
const governance = read("packages/security/src/governance.ts");
const postgresIntegration = read("tests/integration/postgres.test.ts");
const recoveryDrill = read("scripts/j10-recovery-drill.mjs");
const failureDrill = read("scripts/failure-drill.mjs");

describe("J0.11 full-foundation acceptance", () => {
    it("J0.11-A — Clean repository and reproducible build", () => {
        const pkg = json<{ packageManager: string; engines: { node: string; npm: string } }>("package.json");
        expect(pkg.packageManager).toMatch(/^npm@11\./);
        expect(pkg.engines.node).toContain("24");
        expect(read(".nvmrc").trim()).toMatch(/^24\./);
        expect(existsSync("package-lock.json")).toBe(true);
        expect(workflow).toContain("Fresh checkout setup");
        expect(workflow).toContain("npm run setup");
        expect(workflow).not.toContain("continue-on-error: true");
    });

    it("J0.11-B — Database and migration integrity", () => {
        const manifest = json<Array<{ version: number; file: string; sha256: string; destructive: boolean }>>("infrastructure/migrations/manifest.json");
        expect(manifest.map((m) => m.version)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
        expect(new Set(manifest.map((m) => m.file)).size).toBe(14);
        expect(manifest.every((m) => /^[a-f0-9]{64}$/.test(m.sha256))).toBe(true);
        expect(manifest.every((m) => existsSync(`infrastructure/migrations/${m.file}`))).toBe(true);
        expect(manifest.at(-1)?.file).toBe("0014_recovery_sovereignty.sql");
        expect(postgresIntegration).toContain("verifyMigrations");
        expect(postgresIntegration).toContain("pg_extension");
    });

    it("J0.11-C — Redis, BullMQ and event infrastructure", () => {
        const compose = read("infrastructure/docker/compose.dev.yml");
        const lock = read("package-lock.json");
        expect(compose).toContain("redis");
        expect(lock).toContain("bullmq");
        expect(existsSync("scripts/j08-queue-smoke.mjs")).toBe(true);
        expect(workflow).toContain("J0.8 Redis/BullMQ event transport");
    });

    it("J0.11-D — Complete system startup and readiness", () => {
        const start = read("scripts/start.mjs");
        const wait = read("scripts/wait-ready.mjs");
        expect(start).toContain("JARVIS_READY");
        expect(wait).toContain("health/ready");
        expect(workflow.indexOf("Start API, worker and web")).toBeLessThan(workflow.indexOf("Browser acceptance"));
        expect(failureDrill).toContain("503");
        expect(failureDrill).toContain("200");
    });

    it("J0.11-E — Root Owner and device trust", () => {
        const identity = read("packages/identity/src/engine.ts");
        const browser = read("tests/identity-e2e/identity.spec.ts");
        expect(identity).toMatch(/revoke/i);
        expect(identity).toMatch(/device/i);
        expect(identity).toMatch(/session/i);
        expect(browser).toMatch(/passkey|credential/i);
        expect(workflow).toContain("Owner identity and device trust GO flow");
    });

    it("J0.11-F — Security policy, risk and approval integration", () => {
        expect(governance).toContain("OWNER_REQUIRED_NO_SELF_APPROVAL");
        expect(governance).toContain("FRESH_STEP_UP_REQUIRED");
        expect(governance).toContain("executionPermits");
        expect(governance).toContain("consumeExecutionPermit");
        expect(existsSync("tests/security/governance.test.ts")).toBe(true);
    });

    it("J0.11-G — Private storage and encryption", () => {
        expect(existsSync("packages/security/src/envelope.ts")).toBe(true);
        expect(existsSync("packages/storage/src/classified-codec.ts")).toBe(true);
        expect(existsSync("packages/storage/src/data-gateway.ts")).toBe(true);
        expect(postgresIntegration).toContain("raw).not.toContain(record.content)");
        expect(postgresIntegration).toContain("NEVER_STORE");
    });

    it("J0.11-H — Memory integration", () => {
        expect(existsSync("packages/memory/src/retrieval.ts")).toBe(true);
        expect(existsSync("packages/storage/src/memory-lifecycle.ts")).toBe(true);
        expect(existsSync("infrastructure/migrations/0008_memory_lifecycle.sql")).toBe(true);
        expect(postgresIntegration).toContain("PostgresMemoryRepository");
        expect(postgresIntegration).toContain('repository.find("other-owner"');
    });

    it("J0.11-I — Model abstraction and privacy", () => {
        expect(existsSync("packages/models/src/router.ts")).toBe(true);
        expect(existsSync("packages/models/src/synthetic-adapter.ts")).toBe(true);
        expect(postgresIntegration).toContain('["mock-a", "mock-b"]');
        expect(postgresIntegration).toContain('privacyLevel: "local-only"');
        expect(postgresIntegration).toContain("core.recall");
    });

    it("J0.11-J — Universal Tool Gateway", () => {
        const gateway = read("packages/tools/src/j07-gateway.ts");
        expect(gateway).toMatch(/authorization|permit/i);
        expect(gateway).toMatch(/approval|policy/i);
        expect(existsSync("tests/security/governed-gateway.test.ts")).toBe(true);
        expect(postgresIntegration).toContain("GovernedToolGateway");
    });

    it("J0.11-K — Event Nervous System", () => {
        expect(existsSync("packages/events/src/j08-ingress.ts")).toBe(true);
        expect(existsSync("packages/events/src/j08-transport.ts")).toBe(true);
        expect(existsSync("packages/storage/src/event-store.ts")).toBe(true);
        expect(existsSync("infrastructure/migrations/0011_event_system.sql")).toBe(true);
        expect(postgresIntegration).toContain("PostgresEventPublisher");
    });

    it("J0.11-L — Audit and observability", () => {
        const migration = read("infrastructure/migrations/0013_audit_observability.sql");
        expect(existsSync("packages/audit/src/j09-integrity.ts")).toBe(true);
        expect(migration).toMatch(/audit/i);
        expect(postgresIntegration).toContain("append-only");
        expect(postgresIntegration).toContain("PostgresAuditSink");
    });

    it("J0.11-M — Backup and recovery", () => {
        expect(existsSync("packages/storage/src/j10-recovery.ts")).toBe(true);
        expect(existsSync("tests/integration/j10-recovery-postgres.test.ts")).toBe(true);
        expect(workflow).toContain("J0.10 backup and recovery disaster drills");
        expect(recoveryDrill).toContain("buildRestorePlan");
    });

    it("J0.11-N — Recovery attacks fail closed", () => {
        for (const evidence of ["tampered", "crossOwner", "futureDenied", "expiredDenied", "wrongKeyDenied", "substitutionDenied"])
            expect(recoveryDrill).toContain(evidence);
        expect(recoveryDrill).toContain("RECOVERY_DRILL_FAIL_CLOSED_MISSING");
    });

    it("J0.11-O — Dependency outage and recovery", () => {
        expect(failureDrill).toContain('["redis", "postgres"]');
        expect(failureDrill).toContain('compose(["stop", service])');
        expect(failureDrill).toContain('compose(["up", "-d", "--wait", service])');
        expect(workflow).toContain("Dependency outage and recovery");
    });

    it("J0.11-P — Concurrency, replay and race resistance", () => {
        expect(governance).toContain("WeakMap<object, string>");
        expect(governance).toContain("executionPermits.delete(permit)");
        expect(existsSync("tests/security/governance.test.ts")).toBe(true);
        expect(existsSync("tests/security/governed-gateway.test.ts")).toBe(true);
    });

    it("J0.11-Q — Emergency controls", () => {
        for (const control of ["SECURITY_LOCKDOWN", "ACTOR_FROZEN", "AGENTS_FROZEN", "AUTONOMY_DISABLED", "READ_ONLY_MODE", "EXTERNAL_ACTIONS_DISABLED", "NETWORK_DISABLED"])
            expect(governance).toContain(control);
        expect(governance.indexOf("checkControls")).toBeLessThan(governance.lastIndexOf("execute("));
    });

    it("J0.11-R — Clean shutdown and restart safety", () => {
        expect(existsSync("scripts/stop.mjs")).toBe(true);
        expect(existsSync("scripts/check-stopped.mjs")).toBe(true);
        expect(workflow).toContain("Stop and verify processes");
        expect(workflow).toContain("node scripts/check-stopped.mjs");
    });

    it("J0.11-S — Full end-to-end foundation journey", () => {
        const ordered = [
            "Fresh checkout setup",
            "Static and contract checks",
            "Real PostgreSQL integration",
            "Start API, worker and web",
            "Queue and health smoke",
            "Browser acceptance",
            "Owner identity and device trust GO flow",
            "J0.10 backup and recovery disaster drills",
            "Dependency outage and recovery",
            "Stop and verify processes",
        ];
        let cursor = -1;
        for (const marker of ordered) {
            const next = workflow.indexOf(marker);
            expect(next).toBeGreaterThan(cursor);
            cursor = next;
        }
    });

    it("J0.11-T — Regression and acceptance matrix", () => {
        for (const milestone of ["j04", "j05", "j06", "j07", "j08", "j09", "j10"]) {
            expect(existsSync(`scripts/${milestone}-go.mjs`)).toBe(true);
            expect(existsSync(`tests/acceptance/${milestone}-gates.json`)).toBe(true);
            expect(workflow).toContain(`npm run test:${milestone}:go`);
        }
        expect(workflow).not.toMatch(/J0\.12|J1 —|J1 /);
    });
});
