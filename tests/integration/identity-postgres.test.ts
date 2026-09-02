import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@jarvis/config";
import { FileSecretManager, RecordCipher } from "@jarvis/security";
import {
    databasePool,
    migrate,
    PostgresIdentityRepository,
    type DatabasePool,
} from "@jarvis/storage";
import {
    fixture,
    root,
    ownerAction,
    secondDevice,
    TestDevice,
    type Login,
} from "../fixtures/identity.js";
import {
    governanceFixture,
    setupGovernance,
    completeGo,
    goRequest,
    type Issued,
} from "../fixtures/governance.js";
import { GovernanceStateSchema } from "@jarvis/security";

// Synthetic identities never claim the owner's development database. This
// generated database is created and removed by this suite alone.
const database = "jarvis_identity_test_" + randomBytes(8).toString("hex");
const config = await loadConfig("config/development.json");
let admin: DatabasePool,
    testAdmin: DatabasePool,
    pool: DatabasePool,
    repository: PostgresIdentityRepository;
let created = false;
const cipher = new RecordCipher(randomBytes(32));
let f: ReturnType<typeof fixture>, owner: Awaited<ReturnType<typeof root>>;
beforeAll(async () => {
    if (!/^jarvis_identity_test_[a-f0-9]{16}$/.test(database))
        throw new Error("UNSAFE_TEST_DATABASE");
    const actor = {
        version: 1 as const,
        id: "jarvis-identity-test",
        kind: "service" as const,
        environment: "development" as const,
    };
    const manager = new FileSecretManager(
        process.env.JARVIS_VAULT_FILE ?? ".jarvis/development/vault.json",
        process.env.JARVIS_MASTER_KEY_FILE ??
            resolve(
                homedir(),
                ".config/jarvis/typescript/development/master.key",
            ),
        "development",
        actor.id,
        new Set([
            config.storage.postgres.passwordRef,
            config.storage.postgres.migratorPasswordRef,
        ]),
    );
    const runtime = await manager.lease(
            config.storage.postgres.passwordRef,
            actor,
        ),
        migrator = await manager.lease(
            config.storage.postgres.migratorPasswordRef,
            actor,
        );
    try {
        admin = databasePool(
            config.storage.postgres,
            migrator.value.toString(),
            true,
        );
        await admin.query(`CREATE DATABASE ${database}`);
        created = true;
        testAdmin = databasePool(
            { ...config.storage.postgres, database },
            migrator.value.toString(),
            true,
        );
        await migrate(
            testAdmin,
            "infrastructure/migrations",
            "development",
            config.storage.postgres.runtimeUser,
            runtime.value.toString(),
        );
        pool = databasePool(
            { ...config.storage.postgres, database },
            runtime.value.toString(),
        );
        repository = new PostgresIdentityRepository(pool, cipher);
        f = fixture(repository);
        owner = await root(f);
    } finally {
        runtime.destroy();
        migrator.destroy();
    }
});
afterAll(async () => {
    await pool?.end();
    await testAdmin?.end();
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await admin?.end();
});
it("persists one portable owner and encrypted sessions across repository restart", async () => {
    const restarted = fixture(new PostgresIdentityRepository(pool, cipher));
    const snapshot = (await ownerAction(
        restarted.engine,
        owner.device,
        owner.session,
        "identity.inspect",
        {},
        false,
    )) as { owner: { id: string } };
    expect(snapshot.owner.id).toBe(owner.session.ownerId);
    const rows = (await pool.query("SELECT payload FROM identity.sessions"))
        .rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
        expect(row.payload).not.toContain(owner.session.token);
        expect(row.payload).not.toContain(owner.session.ownerId);
    }
    await expect(root(f)).rejects.toThrow("OWNER_ALREADY_EXISTS");
});
it("allows scoped delegation, denies escalation and kills authority after device revocation", async () => {
    const second = await secondDevice(f.engine, owner, "privileged"),
        agent = new TestDevice();
    const subject = (await ownerAction(
        f.engine,
        second.device,
        second.session,
        "subject.create",
        {
            name: "Synthetic agent",
            kind: "agent",
            publicKey: agent.input.publicKey,
            scopes: ["mock.read"],
            resources: ["repository-x"],
        },
    )) as { subjectId: string };
    const cap = (await ownerAction(
        f.engine,
        second.device,
        second.session,
        "delegation.issue",
        {
            subjectId: subject.subjectId,
            scope: "mock.read",
            resource: "repository-x",
            ttlSeconds: 60,
        },
    )) as { token: string };
    const c = await f.engine.beginDelegated(
        cap.token,
        "mock.read",
        "repository-x",
    );
    expect(
        await f.engine.performDelegated(
            cap.token,
            agent.proof(c),
            "mock.read",
            "repository-x",
            async () => "synthetic-read",
        ),
    ).toBe("synthetic-read");
    const denied = await f.engine.beginDelegated(
        cap.token,
        "mock.write",
        "repository-x",
    );
    await expect(
        f.engine.performDelegated(
            cap.token,
            agent.proof(denied),
            "mock.write",
            "repository-x",
            async () => {
                throw new Error("MUST_NOT_EXECUTE");
            },
        ),
    ).rejects.toThrow("DELEGATION_SCOPE_DENIED");
    await ownerAction(f.engine, owner.device, owner.session, "device.revoke", {
        deviceId: second.session.deviceId,
    });
    await expect(f.engine.beginLogin(second.session.deviceId)).rejects.toThrow(
        "DEVICE_NOT_TRUSTED",
    );
    await expect(
        f.engine.beginDelegated(cap.token, "mock.read", "repository-x"),
    ).rejects.toThrow("DELEGATION_INVALID");
});
it("commits exactly one concurrent challenge consumption and records the denied replay", async () => {
    const c = await f.engine.beginAction(
        owner.session.token,
        "identity.inspect",
        {},
        "test-context",
    );
    const proof = { ...owner.device.proof(c), token: owner.session.token };
    const results = await Promise.allSettled([
        f.engine.perform(proof, "identity.inspect", {}, "test-context"),
        f.engine.perform(proof, "identity.inspect", {}, "test-context"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
        (await repository.audit(100)).some(
            (e) => e.code === "CHALLENGE_REPLAY",
        ),
    ).toBe(true);
});
it("refuses runtime owner replacement and audit mutation, including normal admin mutations", async () => {
    for (const sql of [
        "UPDATE identity.root_owner SET id='owner_other'",
        "DELETE FROM identity.root_owner",
        "UPDATE audit.identity_events SET event_type='tampered'",
        "DELETE FROM audit.identity_events",
        "TRUNCATE audit.identity_events",
    ])
        await expect(pool.query(sql)).rejects.toThrow();
    for (const sql of [
        "UPDATE identity.root_owner SET id='owner_other'",
        "DELETE FROM identity.root_owner",
        "UPDATE audit.identity_events SET event_type='tampered'",
        "DELETE FROM audit.identity_events",
        "TRUNCATE audit.identity_events",
    ])
        await expect(testAdmin.query(sql)).rejects.toThrow();
});
it("rolls back device registration and consumed challenge if transactional audit cannot persist", async () => {
    const device = new TestDevice(),
        c = await f.engine.beginEnrollment(device.input),
        response = device.registration(c.options);
    await testAdmin.query(
        "REVOKE INSERT ON audit.identity_events FROM jarvis_development_runtime",
    );
    try {
        await expect(
            f.engine.finishRegistration(
                "enroll",
                device.proof(c),
                response,
                "test-context",
            ),
        ).rejects.toThrow();
    } finally {
        await testAdmin.query(
            "GRANT INSERT ON audit.identity_events TO jarvis_development_runtime",
        );
    }
    // Retry succeeds only because neither the device nor its challenge consumption committed.
    expect(
        (
            await f.engine.finishRegistration(
                "enroll",
                device.proof(c),
                response,
                "test-context",
            )
        ).status,
    ).toBe("approval-required");
});
it("J0.3 complete GO persists policies, approvals, replay protection and lockdown in real PostgreSQL", async () => {
    const governed = governanceFixture(repository),
        h = await setupGovernance(governed, owner);
    await completeGo(h);
    const raw = (
        await pool.query("SELECT payload FROM security.governance_state")
    ).rows[0].payload;
    expect(raw).not.toContain("owner.go");
    expect(raw).not.toContain(h.actorId);
    const restart = new PostgresIdentityRepository(pool, cipher);
    const state = await restart.transaction(async (state) =>
        GovernanceStateSchema.parse(state.security),
    );
    expect(
        state.policies.some(
            (p) => p.id === "owner.block" && p.status === "active",
        ),
    ).toBe(true);
    await h.ownerCommand("policy.disable", { id: "owner.block", revision: 1 });
    const request = goRequest(),
        a = (await h.subjectCommand("request", request)) as Issued;
    const calls = await Promise.allSettled(
        [1, 2].map(() =>
            h.subjectCommand("execute", {
                request,
                authorization: a.authorization,
            }),
        ),
    );
    expect(calls.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
        pool.query("DELETE FROM security.governance_state"),
    ).rejects.toThrow();
    for (const connection of [pool, testAdmin]) {
        await expect(
            connection.query(
                "UPDATE audit.identity_events SET event_type='tampered'",
            ),
        ).rejects.toThrow();
        await expect(
            connection.query("DELETE FROM audit.identity_events"),
        ).rejects.toThrow();
        await expect(
            connection.query("TRUNCATE audit.identity_events"),
        ).rejects.toThrow();
    }
});
it("recovers the same owner, revokes previous sessions and preserves verifiable audit evidence", async () => {
    const kit = (await ownerAction(
        f.engine,
        owner.device,
        owner.session,
        "recovery.prepare",
        {},
    )) as { package: string; recoveryKey: string; ownerId: string };
    const device = new TestDevice(),
        c = await f.engine.beginRecovery(
            kit.package,
            kit.recoveryKey,
            kit.ownerId,
            device.input,
        );
    const session = (await f.engine.finishRegistration(
        "recovery",
        device.proof(c),
        device.registration(c.options),
        "test-context",
    )) as Login;
    expect(session.ownerId).toBe(owner.session.ownerId);
    await expect(
        f.engine.beginAction(owner.session.token, "identity.inspect", {}),
    ).rejects.toThrow("SESSION_INVALID");
    const events = await repository.audit(100);
    expect(
        events.some((e) => e.type === "security.owner_recovery_completed"),
    ).toBe(true);
    expect(events.some((e) => e.approval && e.assurance === "A3")).toBe(true);
});
