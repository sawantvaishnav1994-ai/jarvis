import { it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
    fixture,
    root,
    secondDevice,
    ownerAction,
    TestDevice,
    TestIdentityRepository,
    type Login,
} from "../fixtures/identity.js";
import {
    verifyApprovalEvidence,
    signService,
    type ApprovalEvidence,
} from "@jarvis/identity";

it.each(["origin", "uv", "counter"] as const)(
    "rejects authentication with invalid %s",
    async (field) => {
        const f = fixture(),
            o = await root(f);
        const initial = await f.engine.beginLogin(o.session.deviceId);
        await f.engine.finishLogin(
            o.device.proof(initial),
            o.device.assertion(initial.options),
            "test-context",
        );
        const c = await f.engine.beginLogin(o.session.deviceId);
        const response = o.device.assertion(
            c.options,
            field === "origin"
                ? { origin: "https://attacker.example" }
                : field === "uv"
                  ? { uv: false }
                  : { counter: 1 },
        );
        await expect(
            f.engine.finishLogin(o.device.proof(c), response, "test-context"),
        ).rejects.toThrow();
    },
);
it("requires privileged device trust even when a trusted owner session has a valid passkey", async () => {
    const f = fixture(),
        o = await root(f),
        second = await secondDevice(f.engine, o);
    await expect(
        ownerAction(
            f.engine,
            second.device,
            second.session,
            "recovery.prepare",
            {},
        ),
    ).rejects.toThrow("DEVICE_PRIVILEGE_REQUIRED");
    expect(
        await ownerAction(
            f.engine,
            second.device,
            second.session,
            "identity.inspect",
            {},
            false,
        ),
    ).toHaveProperty("owner.id", o.session.ownerId);
});
it("temporary device authentication is A1 and cannot read owner security state", async () => {
    const f = fixture(),
        o = await root(f),
        temporary = await secondDevice(f.engine, o, "temporary");
    expect(temporary.session.assurance).toBe("A1");
    await expect(
        ownerAction(
            f.engine,
            temporary.device,
            temporary.session,
            "identity.inspect",
            {},
            false,
        ),
    ).rejects.toThrow("REAUTHENTICATION_REQUIRED");
});
it("rejects expired single-action approvals even with an otherwise valid owner session", async () => {
    const f = fixture(),
        o = await root(f),
        c = await f.engine.beginStepUp(
            o.session.token,
            "recovery.prepare",
            {},
            "test-context",
        );
    const approval = await f.engine.finishStepUp(
        o.session.token,
        o.device.proof(c),
        o.device.assertion(c.options),
        "test-context",
    );
    f.advance(90001);
    const action = await f.engine.beginAction(
        o.session.token,
        "recovery.prepare",
        {},
        "test-context",
    );
    await expect(
        f.engine.perform(
            {
                token: o.session.token,
                ...o.device.proof(action),
                approvalId: approval.approvalId,
            },
            "recovery.prepare",
            {},
            "test-context",
        ),
    ).rejects.toThrow("STEP_UP_REQUIRED");
});

it("creates one immutable root under concurrent bootstrap attempts", async () => {
    const f = fixture(),
        a = new TestDevice(),
        b = new TestDevice();
    const ca = await f.engine.beginRoot(f.bootstrap, "Owner A", a.input),
        cb = await f.engine.beginRoot(f.bootstrap, "Owner B", b.input);
    const results = await Promise.allSettled([
        f.engine.finishRegistration(
            "root",
            a.proof(ca),
            a.registration(ca.options),
            "test-context",
        ),
        f.engine.finishRegistration(
            "root",
            b.proof(cb),
            b.registration(cb.options),
            "test-context",
        ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((f.repository as TestIdentityRepository).state.owner?.id).toMatch(
        /^owner_/,
    );
    await expect(
        f.engine.beginRoot(f.bootstrap, "Replacement", new TestDevice().input),
    ).rejects.toThrow("OWNER_ALREADY_EXISTS");
});
it("rejects alternate encodings of the same device key", async () => {
    const f = fixture(),
        o = await root(f);
    await expect(
        f.engine.beginEnrollment({
            ...o.device.input,
            publicKey: o.device.input.publicKey + "=",
        }),
    ).rejects.toThrow("DEVICE_KEY_INVALID");
});
it("expires unapproved enrollment without consuming permanent device slots", async () => {
    const f = fixture();
    await root(f);
    const d = new TestDevice(),
        c = await f.engine.beginEnrollment(d.input);
    const pending = await f.engine.finishRegistration(
        "enroll",
        d.proof(c),
        d.registration(c.options),
        "test-context",
    );
    f.advance(600001);
    await expect(f.engine.beginLogin(pending.deviceId)).rejects.toThrow(
        "DEVICE_NOT_TRUSTED",
    );
    const state = (f.repository as TestIdentityRepository).state;
    expect(state.devices[pending.deviceId]).toBeUndefined();
    expect(state.passkeys[d.credential.toString("base64url")]).toBeUndefined();
});
it("rejects unauthorized bootstrap and unauthenticated owner impersonation", async () => {
    const f = fixture();
    await expect(
        f.engine.beginRoot("wrong", "Owner", new TestDevice().input),
    ).rejects.toThrow("BOOTSTRAP_DENIED");
    await root(f);
    await expect(
        f.engine.beginAction("owner", "identity.inspect", {}),
    ).rejects.toThrow("SESSION_INVALID");
});
it.each(["origin", "challenge", "uv"] as const)(
    "rejects registration with invalid %s",
    async (field) => {
        const f = fixture(),
            d = new TestDevice(),
            c = await f.engine.beginRoot(f.bootstrap, "Owner", d.input);
        const response = d.registration(
            c.options,
            field === "uv"
                ? { uv: false }
                : field === "origin"
                  ? { origin: "https://evil.example" }
                  : { challenge: "wrong" },
        );
        await expect(
            f.engine.finishRegistration(
                "root",
                d.proof(c),
                response,
                "test-context",
            ),
        ).rejects.toThrow();
        expect((f.repository as TestIdentityRepository).state.owner).toBeNull();
    },
);
it("consumes failed authentication challenges and rejects replay", async () => {
    const f = fixture(),
        o = await root(f),
        c = await f.engine.beginLogin(o.session.deviceId);
    const response = o.device.assertion(c.options);
    response.response.signature = randomBytes(64).toString("base64url");
    await expect(
        f.engine.finishLogin(o.device.proof(c), response, "test-context"),
    ).rejects.toThrow();
    await expect(
        f.engine.finishLogin(
            o.device.proof(c),
            o.device.assertion(c.options),
            "test-context",
        ),
    ).rejects.toThrow("CHALLENGE_REPLAY");
});
it("rejects a correct passkey with the wrong device key", async () => {
    const f = fixture(),
        o = await root(f),
        c = await f.engine.beginLogin(o.session.deviceId);
    await expect(
        f.engine.finishLogin(
            new TestDevice().proof(c),
            o.device.assertion(c.options),
            "test-context",
        ),
    ).rejects.toThrow("DEVICE_PROOF_INVALID");
});
it("refuses enrollment bypass and then accepts exact owner approval", async () => {
    const f = fixture(),
        o = await root(f),
        d = new TestDevice(),
        c = await f.engine.beginEnrollment(d.input);
    const pending = await f.engine.finishRegistration(
        "enroll",
        d.proof(c),
        d.registration(c.options),
        "test-context",
    );
    await expect(f.engine.beginLogin(pending.deviceId)).rejects.toThrow(
        "DEVICE_NOT_TRUSTED",
    );
    await expect(
        ownerAction(
            f.engine,
            o.device,
            o.session,
            "device.approve",
            { deviceId: pending.deviceId, trust: "trusted" },
            false,
        ),
    ).rejects.toThrow("STEP_UP_REQUIRED");
    await ownerAction(f.engine, o.device, o.session, "device.approve", {
        deviceId: pending.deviceId,
        trust: "trusted",
    });
    expect(
        (f.repository as TestIdentityRepository).state.devices[pending.deviceId]
            ?.trust,
    ).toBe("trusted");
});
it("requires device proof even when a session token is stolen", async () => {
    const f = fixture(),
        o = await root(f),
        c = await f.engine.beginAction(o.session.token, "identity.inspect", {});
    await expect(
        f.engine.perform(
            { token: o.session.token, ...new TestDevice().proof(c) },
            "identity.inspect",
            {},
        ),
    ).rejects.toThrow("DEVICE_PROOF_INVALID");
});
it("rejects expired and idle sessions", async () => {
    const f = fixture(),
        o = await root(f);
    f.advance(300001);
    await expect(
        f.engine.beginAction(o.session.token, "identity.inspect", {}),
    ).rejects.toThrow("SESSION_EXPIRED");
});
it("rejects expired challenges", async () => {
    const f = fixture(),
        o = await root(f),
        c = await f.engine.beginLogin(o.session.deviceId);
    f.advance(120001);
    await expect(
        f.engine.finishLogin(
            o.device.proof(c),
            o.device.assertion(c.options),
            "test-context",
        ),
    ).rejects.toThrow("CHALLENGE_INVALID");
});
it("binds approvals to exact arguments and prevents reuse", async () => {
    const f = fixture(),
        o = await root(f);
    const input = {
        name: "Agent",
        kind: "agent",
        publicKey: new TestDevice().input.publicKey,
        scopes: [],
        resources: [],
    };
    const c = await f.engine.beginStepUp(
        o.session.token,
        "subject.create",
        input,
    );
    const approval = await f.engine.finishStepUp(
        o.session.token,
        o.device.proof(c),
        o.device.assertion(c.options),
    );
    const changed = { ...input, name: "Changed" },
        a = await f.engine.beginAction(
            o.session.token,
            "subject.create",
            changed,
        );
    await expect(
        f.engine.perform(
            {
                token: o.session.token,
                ...o.device.proof(a),
                approvalId: approval.approvalId,
            },
            "subject.create",
            changed,
        ),
    ).rejects.toThrow("STEP_UP_REQUIRED");
    const b = await f.engine.beginAction(
        o.session.token,
        "subject.create",
        input,
    );
    await f.engine.perform(
        {
            token: o.session.token,
            ...o.device.proof(b),
            approvalId: approval.approvalId,
        },
        "subject.create",
        input,
    );
    const replay = await f.engine.beginAction(
        o.session.token,
        "subject.create",
        input,
    );
    await expect(
        f.engine.perform(
            {
                token: o.session.token,
                ...o.device.proof(replay),
                approvalId: approval.approvalId,
            },
            "subject.create",
            input,
        ),
    ).rejects.toThrow("STEP_UP_REQUIRED");
});
it("retains independently verifiable passkey approval evidence", async () => {
    const f = fixture(),
        o = await root(f);
    await ownerAction(f.engine, o.device, o.session, "subject.create", {
        name: "Agent",
        kind: "agent",
        publicKey: new TestDevice().input.publicKey,
    });
    const evidence = (await f.repository.audit(100)).find((e) => e.approval)
        ?.approval as ApprovalEvidence;
    expect(await verifyApprovalEvidence(evidence)).toBe(true);
    expect(
        await verifyApprovalEvidence({
            ...evidence,
            envelope: evidence.envelope + "changed",
        }),
    ).toBe(false);
});
it("does not trust claimed hardware, voice or face as A4", async () => {
    const f = fixture(),
        o = await root(f);
    await expect(
        ownerAction(
            f.engine,
            o.device,
            o.session,
            "critical.confirm",
            {},
            false,
        ),
    ).rejects.toThrow("A4_NOT_ESTABLISHED");
    await expect(
        ownerAction(f.engine, o.device, o.session, "owner.transfer", {}, false),
    ).rejects.toThrow("OWNER_LOCKED");
    await expect(
        f.engine.beginAction(o.session.token, "critical.confirm", {
            assurance: "A4",
            voiceRecognized: true,
            faceRecognized: true,
        }),
    ).rejects.toThrow("IDENTITY_INPUT_INVALID");
});
it("downgrades a changed session context and requires fresh login", async () => {
    const f = fixture(),
        o = await root(f);
    const c = await f.engine.beginAction(
        o.session.token,
        "identity.inspect",
        {},
        "changed-network-context",
    );
    await expect(
        f.engine.perform(
            { token: o.session.token, ...o.device.proof(c) },
            "identity.inspect",
            {},
        ),
    ).rejects.toThrow("REAUTHENTICATION_REQUIRED");
    const login = await f.engine.beginLogin(o.session.deviceId);
    expect(
        (
            await f.engine.finishLogin(
                o.device.proof(login),
                o.device.assertion(login.options),
                "changed-network-context",
            )
        ).assurance,
    ).toBe("A2");
});
it("revokes a device, its sessions and subsequent reconnection", async () => {
    const f = fixture(),
        o = await root(f),
        second = await secondDevice(f.engine, o);
    await ownerAction(f.engine, o.device, o.session, "device.revoke", {
        deviceId: second.session.deviceId,
    });
    await expect(f.engine.beginLogin(second.session.deviceId)).rejects.toThrow(
        "DEVICE_NOT_TRUSTED",
    );
    await expect(
        f.engine.beginAction(second.session.token, "identity.inspect", {}),
    ).rejects.toThrow("SESSION_INVALID");
    await expect(f.engine.beginEnrollment(second.device.input)).rejects.toThrow(
        "DEVICE_KEY_REUSED",
    );
});
it("logs out all sessions except the signed current session", async () => {
    const f = fixture(),
        o = await root(f),
        second = await secondDevice(f.engine, o);
    await ownerAction(f.engine, o.device, o.session, "session.revoke", {
        exceptCurrent: true,
    });
    await expect(
        f.engine.beginAction(second.session.token, "identity.inspect", {}),
    ).rejects.toThrow("SESSION_INVALID");
    expect(
        await ownerAction(
            f.engine,
            o.device,
            o.session,
            "identity.inspect",
            {},
            false,
        ),
    ).toHaveProperty("owner.id", o.session.ownerId);
});
it("creates least-privilege agents and denies undeclared scopes", async () => {
    const f = fixture(),
        o = await root(f),
        agent = new TestDevice();
    const subject = (await ownerAction(
        f.engine,
        o.device,
        o.session,
        "subject.create",
        { name: "Restricted", kind: "agent", publicKey: agent.input.publicKey },
    )) as { subjectId: string };
    await expect(
        ownerAction(f.engine, o.device, o.session, "delegation.issue", {
            subjectId: subject.subjectId,
            scope: "mock.read",
            resource: "repo-x",
            ttlSeconds: 60,
        }),
    ).rejects.toThrow("DELEGATION_SCOPE_DENIED");
});
it("runs one delegated mock permission and denies wrong scope, audience and subject", async () => {
    const f = fixture(),
        o = await root(f),
        agent = new TestDevice();
    const subject = (await ownerAction(
        f.engine,
        o.device,
        o.session,
        "subject.create",
        {
            name: "Developer",
            kind: "agent",
            publicKey: agent.input.publicKey,
            scopes: ["mock.read"],
            resources: ["repo-x"],
        },
    )) as { subjectId: string };
    const cap = (await ownerAction(
        f.engine,
        o.device,
        o.session,
        "delegation.issue",
        {
            subjectId: subject.subjectId,
            scope: "mock.read",
            resource: "repo-x",
            ttlSeconds: 60,
        },
    )) as { token: string };
    const execute = vi.fn(async () => ({ mock: true }));
    let c = await f.engine.beginDelegated(cap.token, "mock.read", "repo-x");
    expect(
        await f.engine.performDelegated(
            cap.token,
            agent.proof(c),
            "mock.read",
            "repo-x",
            execute,
        ),
    ).toEqual({ mock: true });
    c = await f.engine.beginDelegated(cap.token, "mock.write", "repo-x");
    await expect(
        f.engine.performDelegated(
            cap.token,
            agent.proof(c),
            "mock.write",
            "repo-x",
            execute,
        ),
    ).rejects.toThrow("DELEGATION_SCOPE_DENIED");
    c = await f.engine.beginDelegated(cap.token, "mock.read", "repo-x");
    await expect(
        f.engine.performDelegated(
            cap.token,
            new TestDevice().proof(c),
            "mock.read",
            "repo-x",
            execute,
        ),
    ).rejects.toThrow("DEVICE_PROOF_INVALID");
    await expect(
        f.engine.beginAction(cap.token, "owner.transfer", {}),
    ).rejects.toThrow("SESSION_INVALID");
    expect(execute).toHaveBeenCalledTimes(1);
    f.advance(60001);
    await expect(
        f.engine.beginDelegated(cap.token, "mock.read", "repo-x"),
    ).rejects.toThrow("DELEGATION_EXPIRED");
});
it("guests never receive an owner session or owner permissions", async () => {
    const f = fixture(),
        o = await root(f),
        guest = new TestDevice();
    const subject = (await ownerAction(
        f.engine,
        o.device,
        o.session,
        "subject.create",
        { name: "Guest", kind: "human", publicKey: guest.input.publicKey },
    )) as { subjectId: string };
    expect(
        (f.repository as TestIdentityRepository).state.subjects[
            subject.subjectId
        ]?.role,
    ).toBe("guest");
    await expect(
        f.engine.beginAction(subject.subjectId, "device.revoke", {
            deviceId: o.session.deviceId,
        }),
    ).rejects.toThrow("SESSION_INVALID");
});
it("recovers the same owner, revokes old authority and burns the old recovery kit", async () => {
    const f = fixture(),
        o = await root(f),
        second = await secondDevice(f.engine, o);
    const kit = (await ownerAction(
        f.engine,
        o.device,
        o.session,
        "recovery.prepare",
        {},
    )) as { package: string; recoveryKey: string; ownerId: string };
    const fresh = new TestDevice();
    await expect(
        f.engine.beginRecovery(
            kit.package,
            randomBytes(32).toString("base64url"),
            kit.ownerId,
            fresh.input,
        ),
    ).rejects.toThrow("RECOVERY_INVALID");
    const c = await f.engine.beginRecovery(
        kit.package,
        kit.recoveryKey,
        kit.ownerId,
        fresh.input,
    );
    const recovered = (await f.engine.finishRegistration(
        "recovery",
        fresh.proof(c),
        fresh.registration(c.options),
        "test-context",
    )) as Login;
    expect(recovered.ownerId).toBe(o.session.ownerId);
    await expect(
        f.engine.beginAction(o.session.token, "identity.inspect", {}),
    ).rejects.toThrow("SESSION_INVALID");
    await expect(f.engine.beginLogin(second.session.deviceId)).rejects.toThrow(
        "DEVICE_NOT_TRUSTED",
    );
    await expect(
        f.engine.beginRecovery(
            kit.package,
            kit.recoveryKey,
            kit.ownerId,
            new TestDevice().input,
        ),
    ).rejects.toThrow("RECOVERY_STALE");
    const events = await f.repository.audit(100);
    expect(
        events.some((e) => e.type === "security.owner_recovery_completed"),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toContain(kit.recoveryKey);
});
it("requires host bootstrap authority when restoring an identity kit into a clean store", async () => {
    const f = fixture(),
        o = await root(f),
        kit = (await ownerAction(
            f.engine,
            o.device,
            o.session,
            "recovery.prepare",
            {},
        )) as { package: string; recoveryKey: string; ownerId: string };
    const clean = fixture(),
        d = new TestDevice();
    await expect(
        clean.engine.beginRecovery(
            kit.package,
            kit.recoveryKey,
            kit.ownerId,
            d.input,
        ),
    ).rejects.toThrow("BOOTSTRAP_DENIED");
    const c = await clean.engine.beginRecovery(
        kit.package,
        kit.recoveryKey,
        kit.ownerId,
        d.input,
        clean.bootstrap,
    );
    const result = (await clean.engine.finishRegistration(
        "recovery",
        d.proof(c),
        d.registration(c.options),
        "test-context",
    )) as Login;
    expect(result.ownerId).toBe(kit.ownerId);
});
it("fails closed without changing owner state when audit persistence fails", async () => {
    const repository = new TestIdentityRepository(),
        f = fixture(repository),
        d = new TestDevice(),
        c = await f.engine.beginRoot(f.bootstrap, "Owner", d.input);
    repository.failAudit = true;
    await expect(
        f.engine.finishRegistration(
            "root",
            d.proof(c),
            d.registration(c.options),
            "test-context",
        ),
    ).rejects.toThrow("AUDIT_UNAVAILABLE");
    expect(repository.state.owner).toBeNull();
});
it("authenticates service messages, rejects body tampering and records replay consumption", async () => {
    const f = fixture(),
        key = randomBytes(32),
        body = "{}",
        proof = signService(key, "service_web", "identity.rpc", body);
    await f.engine.acceptService(key, proof, "identity.rpc", body);
    await expect(
        f.engine.acceptService(key, proof, "identity.rpc", body),
    ).rejects.toThrow("SERVICE_REPLAY_OR_IDENTITY_DENIED");
    await expect(
        f.engine.acceptService(
            key,
            signService(key, "service_web", "identity.rpc", body),
            "identity.rpc",
            '{"changed":true}',
        ),
    ).rejects.toThrow("SERVICE_PROOF_INVALID");
});
it("treats shared displays as a privacy restriction, never a permission grant", async () => {
    const f = fixture(),
        o = await root(f);
    expect(
        await ownerAction(
            f.engine,
            o.device,
            o.session,
            "privacy.inspect",
            { sharedDisplay: true },
            false,
        ),
    ).toEqual({
        revealPrivateData: false,
        reason: "shared-display-confirmation-required",
    });
});
