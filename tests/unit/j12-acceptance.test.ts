import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const readText = (path: string) => readFile(new URL(path, root), "utf8");
const readJson = async <T = Record<string, unknown>>(path: string): Promise<T> =>
    JSON.parse(await readText(path)) as T;
const exists = async (path: string): Promise<boolean> => {
    try {
        await access(new URL(path, root));
        return true;
    } catch {
        return false;
    }
};
const sha256 = async (path: string) =>
    createHash("sha256").update(await readFile(new URL(path, root))).digest("hex");

interface FoundationManifest {
    foundationVersion: string;
    architectureVersion: number;
    schemaVersion: number;
    migrationRange: string;
    baseline: string;
    principle: string;
    contracts: Record<string, number>;
    securityInvariants: number;
    acceptedMigrations: number[];
}
interface SchemaManifest {
    schemaVersion: number;
    migrationCount: number;
    migrationRange: string;
    pgvectorRequired: boolean;
    migrations: Array<{ version: number; file: string; sha256: string }>;
}
interface PermissionManifest {
    levels: Array<{ id: string; name: string; prohibited: string[] }>;
    globalRules: string[];
}
interface ModeManifest {
    modes: Array<{ id: string; emergencyOverrides: boolean }>;
    transitionRule: string;
    controls: string[];
}
interface DataManifest {
    classes: Array<{ id: string; externalModelEligibility: string; durableStorage: string; privacy?: string }>;
    retentionModes: string[];
    neverStore: { semanticVersion: number; rule: string };
    rules: string[];
}

describe("J0.12 Foundation v1 acceptance", () => {
    it("J0.12 A exact accepted baseline and reproducible freeze inputs", async () => {
        const manifest = await readJson<FoundationManifest>("foundation/foundation-v1.manifest.json");
        expect(manifest.baseline).toBe("581badf38ed3d85c75a652ac87111c8aa4e62da9");
        expect(manifest.foundationVersion).toBe("1.0.0-rc");
        expect(manifest.principle).toBe("JARVIS is the system. AI models are replaceable brains used by JARVIS.");
        expect(await exists("package-lock.json")).toBe(true);
        expect(await exists(".nvmrc")).toBe(true);
        expect(await exists("requirements-dev.lock")).toBe(true);
    });

    it("J0.12 B Foundation v1 architecture and trust boundaries are frozen", async () => {
        const architecture = await readText("docs/architecture/foundation-v1-architecture.md");
        const boundaries = await readText("docs/security/foundation-v1-trust-boundaries.md");
        expect(architecture).toContain("schema -> proposal -> policy/risk -> approval when needed -> permit -> execution -> result -> audit/event");
        for (const boundary of ["Root Owner", "Model provider", "PostgreSQL/pgvector", "Redis/BullMQ", "CI environment"])
            expect(boundaries).toContain(boundary);
    });

    it("J0.12 C every foundation-critical contract family is explicitly versioned", async () => {
        const manifest = await readJson<FoundationManifest>("foundation/foundation-v1.manifest.json");
        const required = [
            "api", "identity", "deviceTrust", "session", "approval", "authorizationPermit", "policy", "risk",
            "storage", "encryptionEnvelope", "memory", "modelProviderPort", "toolGateway", "event", "audit",
            "backupFormat", "recoveryManifest", "emergencyControls", "securityEpoch", "ownerIdentity",
            "dataClassification", "neverStore",
        ];
        expect(Object.keys(manifest.contracts).sort()).toEqual(required.sort());
        expect(Object.values(manifest.contracts).every((value) => Number.isInteger(value) && value > 0)).toBe(true);
        expect(await readText("docs/contracts/foundation-v1-contracts.md")).toContain("Change rule after Foundation v1");
    });

    it("J0.12 D schema is frozen at immutable migrations 0001 through 0014", async () => {
        const schema = await readJson<SchemaManifest>("foundation/schema-v1.json");
        const live = await readJson<Array<{ version: number; file: string; sha256: string }>>("infrastructure/migrations/manifest.json");
        expect(schema.schemaVersion).toBe(14);
        expect(schema.migrationCount).toBe(14);
        expect(schema.migrationRange).toBe("0001-0014");
        expect(schema.pgvectorRequired).toBe(true);
        expect(schema.migrations).toEqual(live.map(({ version, file, sha256: hash }) => ({ version, file, sha256: hash })));
        for (const migration of schema.migrations)
            expect(await sha256(`infrastructure/migrations/${migration.file}`)).toBe(migration.sha256);
        expect(await exists("infrastructure/migrations/0015.sql")).toBe(false);
        expect(await exists("infrastructure/migrations/0015_foundation.sql")).toBe(false);
    });

    it("J0.12 E Root Owner identity device trust session revocation and recovery stay governed", async () => {
        const contracts = await readText("docs/contracts/foundation-v1-contracts.md");
        expect(contracts).toContain("one portable Root Owner");
        expect(contracts).toContain("Browser passkey authentication and independent device proof are distinct signals");
        for (const path of ["tests/security/identity.test.ts", "tests/integration/identity-postgres.test.ts", "tests/identity-e2e/identity.spec.ts"])
            expect(await exists(path)).toBe(true);
    });

    it("J0.12 F P0 through P5 policy risk approval permit and delegation semantics are frozen", async () => {
        const permissions = await readJson<PermissionManifest>("foundation/permissions-v1.json");
        expect(permissions.levels.map(({ id }) => id)).toEqual(["P0", "P1", "P2", "P3", "P4", "P5"]);
        expect(permissions.levels.some(({ prohibited }) => prohibited.some((value) => value.includes("self-grant")))).toBe(true);
        expect(permissions.globalRules.join(" ")).toContain("never by model output");
        expect(await exists("tests/security/governance.test.ts")).toBe(true);
    });

    it("J0.12 G privacy storage encryption D5 retention deletion export secrets and NEVER_STORE are frozen", async () => {
        const data = await readJson<DataManifest>("foundation/data-classification-v1.json");
        expect(data.classes.map(({ id }) => id)).toEqual(["D0", "D1", "D2", "D3", "D4", "D5"]);
        const d5 = data.classes.find(({ id }) => id === "D5");
        expect(d5).toMatchObject({ externalModelEligibility: "never", privacy: "local-only" });
        expect(data.retentionModes).toContain("never-store");
        expect(data.neverStore.semanticVersion).toBe(1);
        for (const path of ["tests/security/envelope.test.ts", "tests/security/storage-boundaries.test.ts", "tests/security/secrets.test.ts"])
            expect(await exists(path)).toBe(true);
    });

    it("J0.12 H memory scope provenance disclosure expiry purge and owner isolation are frozen", async () => {
        const contracts = await readText("docs/contracts/foundation-v1-contracts.md");
        expect(contracts).toContain("owner scoped with optional project scope, provenance/source metadata");
        for (const path of ["packages/memory/src/j05-contracts.ts", "tests/integration/j05-memory-postgres.test.ts", "tests/integration/j05-identity-isolation.test.ts"])
            expect(await exists(path)).toBe(true);
    });

    it("J0.12 I model providers remain replaceable non-authoritative adapters behind privacy controls", async () => {
        const architecture = await readText("docs/architecture/foundation-v1-architecture.md");
        expect(architecture).toContain("replaceable provider adapters/router with privacy preflight");
        expect(architecture).toContain("model suggestion, event payload, queue message or stored object is never sufficient authorization");
        for (const path of ["packages/models/src/j06-contracts.ts", "packages/models/src/router.ts", "tests/unit/j06-router.test.ts"])
            expect(await exists(path)).toBe(true);
    });

    it("J0.12 J executable tools remain behind schema proposal policy approval permit and gateway execution", async () => {
        const contracts = await readText("docs/contracts/foundation-v1-contracts.md");
        expect(contracts).toContain("schema validation -> proposal -> policy/risk -> approval when required -> bound execution permit -> execution -> result -> event/audit");
        for (const path of ["packages/tools/src/j07-gateway.ts", "packages/tools/src/governed.ts", "tests/security/governed-gateway.test.ts"])
            expect(await exists(path)).toBe(true);
    });

    it("J0.12 K events remain versioned persisted privacy-aware idempotent and constrained through transport workers", async () => {
        const contracts = await readText("docs/contracts/foundation-v1-contracts.md");
        expect(contracts).toContain("Redis/BullMQ transport enforce duplicate/idempotency controls");
        for (const path of ["packages/events/src/j08-contracts.ts", "packages/events/src/j08-transport.ts", "tests/integration/j08-events.test.ts", "scripts/j08-queue-smoke.mjs"])
            expect(await exists(path)).toBe(true);
    });

    it("J0.12 L audit remains correlated append-oriented integrity-checked and protected-plaintext safe", async () => {
        const review = await readText("docs/security/foundation-v1-security-review.md");
        expect(review).toContain("append-oriented DB restrictions, keyed integrity chain, checkpoint verification");
        for (const path of ["packages/audit/src/j09-integrity.ts", "tests/integration/j09-audit-postgres.test.ts", "tests/unit/j09-hardening.test.ts"])
            expect(await exists(path)).toBe(true);
    });

    it("J0.12 M recovery preserves owner revocation deletion policy memory audit events encryption and epochs", async () => {
        const architecture = await readText("docs/architecture/foundation-v1-architecture.md");
        expect(architecture).toContain("preserves a single Root Owner, revocations, deletion obligations, policy restrictions, audit/events, memory and security epoch semantics");
        for (const path of ["packages/storage/src/j10-recovery.ts", "tests/integration/j10-recovery-postgres.test.ts", "scripts/j10-recovery-drill.mjs"])
            expect(await exists(path)).toBe(true);
    });

    it("J0.12 N adversarial recovery rejects wrong key owner tamper substitution expiry and unsupported versions", async () => {
        const review = await readText("docs/security/foundation-v1-security-review.md");
        for (const term of ["Cross-owner restore", "Backup tampering", "Stale-authority restore", "Schema tamper/future schema"])
            expect(review).toContain(term);
        expect(await exists("tests/unit/j10-hardening.test.ts")).toBe(true);
    });

    it("J0.12 O critical dependency failure reduces readiness and never creates authorization", async () => {
        const architecture = await readText("docs/architecture/foundation-v1-architecture.md");
        expect(architecture).toContain("dependency unavailability makes affected readiness/capabilities fail closed rather than permitting work");
        expect(await exists("scripts/failure-drill.mjs")).toBe(true);
        expect(await exists("apps/api/src/health.ts")).toBe(true);
    });

    it("J0.12 P replay concurrency and race-sensitive authority remains one-shot fail-closed and regression-covered", async () => {
        const review = await readText("docs/security/foundation-v1-security-review.md");
        expect(review).toContain("one-shot approval and permit consumption with action/session/epoch binding");
        expect(await exists("tests/security/governance.test.ts")).toBe(true);
        expect(await exists("tests/security/governed-gateway.test.ts")).toBe(true);
    });

    it("J0.12 Q PAUSE FREEZE DISCONNECT SAFE MODE REVOKE and SHUTDOWN only reduce or terminate capability", async () => {
        const modes = await readJson<ModeManifest>("foundation/operating-modes-v1.json");
        expect(modes.controls).toEqual(["PAUSE", "FREEZE", "DISCONNECT", "SAFE MODE", "REVOKE", "SHUTDOWN"]);
        expect(modes.modes.every(({ emergencyOverrides }) => emergencyOverrides)).toBe(true);
        expect(modes.transitionRule).toContain("may not increase effective authority");
        expect(await readText("docs/security/foundation-v1-security-review.md")).toContain("Emergency-control interpretation");
    });

    it("J0.12 R shutdown restart and lifecycle integrity reject new work and leave no authorized orphan processing", async () => {
        for (const path of ["scripts/stop.mjs", "scripts/check-stopped.mjs", "scripts/start.mjs"])
            expect(await exists(path)).toBe(true);
        const architecture = await readText("docs/architecture/foundation-v1-architecture.md");
        expect(architecture).toContain("orphan-process verification");
        expect(architecture).toContain("Startup/readiness fails closed");
    });

    it("J0.12 S canonical Foundation v1 lifecycle is explicitly ordered from clean checkout through recovery and shutdown", async () => {
        const roadmap = await readText("docs/roadmap/j0.12.md");
        expect(roadmap).toContain("1. fresh checkout");
        expect(roadmap).toContain("39. isolated restore");
        expect(roadmap).toContain("45. FREEZE activation");
        expect(roadmap).toContain("52. no orphan process");
    });

    it("J0.12 T all J0.1 through J0.11 gates plus the fail-closed J0.12 verifier are required together", async () => {
        for (const path of [
            "scripts/j04-go.mjs", "scripts/j05-go.mjs", "scripts/j06-go.mjs", "scripts/j07-go.mjs",
            "scripts/j08-go.mjs", "scripts/j09-go.mjs", "scripts/j10-go.mjs", "scripts/j11-go.mjs",
            "tests/acceptance/j04-gates.json", "tests/acceptance/j05-gates.json", "tests/acceptance/j06-gates.json",
            "tests/acceptance/j07-gates.json", "tests/acceptance/j08-gates.json", "tests/acceptance/j09-gates.json",
            "tests/acceptance/j10-gates.json", "tests/acceptance/j11-gates.json", "scripts/j12-foundation-v1-go.mjs",
        ]) expect(await exists(path)).toBe(true);
        const catalog = await readJson<{ gates: string[] }>("tests/acceptance/j12-gates.json");
        expect(catalog.gates).toHaveLength(20);
    });
});
