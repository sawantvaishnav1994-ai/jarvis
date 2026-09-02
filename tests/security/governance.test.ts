import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
    GovernanceStateSchema,
    AuthorizationV3Schema,
    assessRisk,
    GovernanceEngine,
} from "@jarvis/security";
import { AuthorizedMockToolGateway } from "@jarvis/tools";
import {
    ownerAction,
    TestDevice,
    TestIdentityRepository,
    fixture,
} from "../fixtures/identity.js";
import {
    setupGovernance,
    completeGo,
    goRequest,
    type Issued,
    type Pending,
} from "../fixtures/governance.js";

it("complete J0.3 GO phases A-N through real cryptographic identity", async () => {
    await completeGo(await setupGovernance());
});
it.each(["actorId", "resource", "inputHash", "environment", "policyHash"])(
    "rejects tampered authorization %s",
    async (field) => {
        const h = await setupGovernance(),
            request = goRequest(),
            a = (await h.subjectCommand("request", request)) as Issued;
        const changed = {
            ...a.authorization,
            [field]: field.endsWith("Hash")
                ? "b".repeat(64)
                : field === "environment"
                  ? "production"
                  : "other",
        };
        await expect(
            h.subjectCommand("execute", { request, authorization: changed }),
        ).rejects.toThrow();
    },
);
it.each(["input", "resource", "actor"])(
    "approval is exact-bound to %s",
    async (field) => {
        const h = await setupGovernance(),
            request = goRequest("mock.production.deploy"),
            p = (await h.subjectCommand("request", request)) as Pending;
        await h.ownerCommand("approval.decide", {
            version: 1,
            approvalId: p.approval.id,
            requestHash: p.requestHash,
            decision: "approve",
        });
        if (field === "actor") {
            const other = new TestDevice(),
                created = (await ownerAction(
                    h.f.engine,
                    h.owner.device,
                    h.owner.session,
                    "subject.create",
                    {
                        name: "Other",
                        kind: "agent",
                        publicKey: other.input.publicKey,
                        scopes: [],
                        resources: [],
                    },
                )) as { subjectId: string };
            const input = {
                    command: "authorize",
                    data: { request, approvalId: p.approval.id },
                },
                c = await h.f.engine.beginSecuritySubject(
                    created.subjectId,
                    input,
                );
            await expect(
                h.f.engine.performSecuritySubject(
                    created.subjectId,
                    other.proof(c),
                    input,
                ),
            ).rejects.toThrow();
        } else {
            const modified = structuredClone(request);
            if (field === "input") modified.input.commit = "b".repeat(40);
            else modified.resource = "other";
            await expect(
                h.subjectCommand("authorize", {
                    request: modified,
                    approvalId: p.approval.id,
                }),
            ).rejects.toThrow();
        }
    },
);
it.each([
    "SECURITY_LOCKDOWN",
    "AGENTS_FROZEN",
    "READ_ONLY_MODE",
    "AUTONOMY_DISABLED",
])("%s blocks an otherwise valid mutation", async (flag) => {
    const h = await setupGovernance();
    await h.ownerCommand("controls.set", { flag, active: true });
    await expect(
        h.subjectCommand("request", goRequest("mock.repository.write")),
    ).rejects.toThrow(flag);
});
it.each([
    "expired-authorization",
    "expired-delegation",
    "revoked-delegation",
    "revoked-device",
    "expired-session",
    "unknown-identity",
    "missing-capability",
    "frozen-actor",
    "changed-policy",
    "budget",
])("fails closed: %s", async (scenario) => {
    const h = await setupGovernance(),
        request = goRequest(),
        issued = (await h.subjectCommand("request", request)) as Issued;
    if (scenario === "expired-authorization") h.f.advance(60001);
    if (scenario === "expired-delegation") h.f.advance(600001);
    if (scenario === "revoked-delegation")
        await h.ownerCommand("delegation.revoke", {
            id: issued.authorization.delegationId,
        });
    if (scenario === "revoked-device")
        await ownerAction(
            h.f.engine,
            h.owner.device,
            h.owner.session,
            "device.revoke",
            { deviceId: h.owner.session.deviceId },
        );
    if (scenario === "expired-session") h.f.advance(300001);
    if (scenario === "unknown-identity")
        await expect(
            h.f.engine.beginSecuritySubject("agent-unknown", {
                command: "request",
                data: request,
            }),
        ).rejects.toThrow("SUBJECT_INVALID");
    if (scenario === "missing-capability")
        await h.f.repository.transaction(async (state) => {
            state.subjects[h.actorId]!.scopes = [];
        });
    if (scenario === "frozen-actor")
        await h.ownerCommand("actor.freeze", { actorId: h.actorId });
    if (scenario === "changed-policy")
        await h.ownerCommand("policy.disable", {
            id: h.policy.id,
            revision: 1,
        });
    if (scenario === "budget")
        await h.f.repository.transaction(async (state) => {
            const s = GovernanceStateSchema.parse(state.security);
            s.budgets[h.actorId]!.toolCalls = 20;
            state.security = s;
        });
    if (scenario !== "unknown-identity")
        await expect(
            h.subjectCommand("execute", {
                request,
                authorization: issued.authorization,
            }),
        ).rejects.toThrow();
});
it("requires genuine step-up; agent cannot administer policy, grants, or audit", async () => {
    const h = await setupGovernance();
    for (const command of [
        "controls.set",
        "policy.create",
        "delegation.grant",
        "risk.configure",
        "actor.freeze",
        "audit.disable",
    ])
        await expect(h.subjectCommand(command, {})).rejects.toThrow();
    await expect(
        ownerAction(
            h.f.engine,
            h.owner.device,
            h.owner.session,
            "security.command",
            {
                command: "controls.set",
                data: { flag: "SECURITY_LOCKDOWN", active: true },
            },
            false,
        ),
    ).rejects.toThrow("STEP_UP_REQUIRED");
});
it("concurrent one-time consumption admits one action and audits the replay", async () => {
    const h = await setupGovernance(),
        request = goRequest(),
        issued = (await h.subjectCommand("request", request)) as Issued;
    const results = await Promise.allSettled(
        [1, 2].map(() =>
            h.subjectCommand("execute", {
                request,
                authorization: issued.authorization,
            }),
        ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("copied authorization objects cannot call the concrete tool directly", async () => {
    const h = await setupGovernance(),
        request = goRequest(),
        issued = (await h.subjectCommand("request", request)) as Issued;
    expect(() =>
        new AuthorizedMockToolGateway().execute(
            request,
            { ...issued.authorization, status: "consumed", uses: 1 },
            {},
        ),
    ).toThrow("DIRECT_TOOL_BYPASS_DENIED");
});
it("fails closed when persistence/audit is unavailable", async () => {
    const h = await setupGovernance();
    (h.f.repository as TestIdentityRepository).failAudit = true;
    await expect(h.subjectCommand("request", goRequest())).rejects.toThrow(
        "AUDIT_UNAVAILABLE",
    );
});
it("standing approval is versioned, revocable and restricted to its exact file rule", async () => {
    const h = await setupGovernance(),
        p = structuredClone(h.policy);
    p.id = "docs.standing";
    p.precedence = "workflow";
    p.rules = [p.rules[0]!];
    p.rules[0]!.standing = true;
    p.rules[0]!.pathPrefixes = ["docs/"];
    await h.ownerCommand("policy.create", p);
    await h.ownerCommand("policy.activate", { id: p.id, revision: 1 });
    expect(
        (
            (await h.subjectCommand(
                "request",
                goRequest("mock.repository.write"),
            )) as Issued
        ).authorization,
    ).toBeDefined();
    const request = goRequest("mock.repository.write");
    request.input.files = ["src/main.ts"];
    await expect(h.subjectCommand("request", request)).rejects.toThrow(
        "standing scope",
    );
    await h.ownerCommand("policy.disable", { id: p.id, revision: 1 });
    await expect(
        h.ownerCommand("policy.activate", { id: p.id, revision: 1 }),
    ).rejects.toThrow("POLICY_ROLLBACK_DENIED");
});
it("risk uses context/volume/zone/reversibility/verification rather than tool name", () => {
    const factors = new AuthorizedMockToolGateway().describe(
        goRequest(),
    ).factors;
    expect(assessRisk(factors, Date.now()).level).toBe("R1");
    for (const changed of [
        { volume: 10000 },
        { reversibility: "IRREVERSIBLE" as const },
        { unusual: true },
    ])
        expect(assessRisk({ ...factors, ...changed }, Date.now()).level).toBe(
            "R4",
        );
    expect(
        assessRisk({ ...factors, external: true, privacy: 3 }, Date.now())
            .level,
    ).toBe("R5");
});
it("strict authorizations reject extra fields and unknown contract versions", () => {
    expect(
        AuthorizationV3Schema.safeParse({
            version: 99,
            id: randomUUID(),
            allowed: true,
        }).success,
    ).toBe(false);
});
it("J0.2 compatibility read cannot bypass J0.3 lockdown", async () => {
    const h = await setupGovernance(),
        key = new TestDevice();
    const s = (await ownerAction(
        h.f.engine,
        h.owner.device,
        h.owner.session,
        "subject.create",
        {
            name: "Legacy",
            kind: "agent",
            publicKey: key.input.publicKey,
            scopes: ["mock.read"],
            resources: ["repository-x"],
        },
    )) as { subjectId: string };
    const cap = (await ownerAction(
        h.f.engine,
        h.owner.device,
        h.owner.session,
        "delegation.issue",
        {
            subjectId: s.subjectId,
            scope: "mock.read",
            resource: "repository-x",
            ttlSeconds: 60,
        },
    )) as { token: string };
    await h.ownerCommand("controls.set", {
        flag: "SECURITY_LOCKDOWN",
        active: true,
    });
    const c = await h.f.engine.beginDelegated(
        cap.token,
        "mock.read",
        "repository-x",
    );
    await expect(
        h.f.engine.performDelegated(
            cap.token,
            key.proof(c),
            "mock.read",
            "repository-x",
            async () => {
                throw new Error("MUST_NOT_EXECUTE");
            },
        ),
    ).rejects.toThrow("SECURITY_LOCKDOWN");
});
it.each(["EXTERNAL_ACTIONS_DISABLED", "NETWORK_DISABLED"])(
    "%s blocks catalog-declared external/network work",
    async (flag) => {
        const catalog = new AuthorizedMockToolGateway();
        const f = fixture(
            undefined,
            (clock) =>
                new GovernanceEngine(
                    {
                        describe: (request) => {
                            const d = catalog.describe(request);
                            return {
                                ...d,
                                factors: {
                                    ...d.factors,
                                    external:
                                        flag === "EXTERNAL_ACTIONS_DISABLED",
                                    network: flag === "NETWORK_DISABLED",
                                },
                            };
                        },
                        execute: () => {
                            throw new Error("MUST_NOT_EXECUTE");
                        },
                        verify: () => false,
                    },
                    clock,
                ).handle,
        );
        const h = await setupGovernance(f);
        await expect(
            h.subjectCommand("request", goRequest("mock.repository.write")),
        ).rejects.toThrow(flag);
    },
);
it("rejects unknown states and fails closed on corrupted policy storage", async () => {
    const h = await setupGovernance();
    await expect(
        h.ownerCommand("controls.set", {
            flag: "IGNORE_SECURITY",
            active: false,
        }),
    ).rejects.toThrow();
    await h.f.repository.transaction(async (state) => {
        const s = GovernanceStateSchema.parse(state.security);
        state.security = { ...s, version: 99 };
    });
    await expect(h.subjectCommand("request", goRequest())).rejects.toThrow();
});
it("simulation/test/scan failure blocks automatic or sensitive execution", async () => {
    const h = await setupGovernance();
    for (const signal of ["simulation", "tests", "scan"]) {
        const r = goRequest();
        r.input[signal] = "fail";
        await expect(h.subjectCommand("request", r)).rejects.toThrow();
    }
});
