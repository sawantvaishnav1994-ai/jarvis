import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import {
    GovernanceEngine,
    PolicyV3Schema,
    GovernanceStateSchema,
    type ActionRequestV3,
    type AuthorizationV3,
    type PolicyV3,
} from "@jarvis/security";
import { AuthorizedMockToolGateway } from "@jarvis/tools";
import { type IdentityRepository, canonical, digest } from "@jarvis/identity";
import {
    fixture,
    root,
    ownerAction,
    TestDevice,
    type Login,
} from "./identity.js";

export function governanceFixture(repository?: IdentityRepository) {
    return fixture(
        repository,
        (clock) =>
            new GovernanceEngine(new AuthorizedMockToolGateway(), clock).handle,
    );
}
export const goRequest = (
    toolId = "mock.repository.read",
    overrides: Partial<ActionRequestV3> = {},
): ActionRequestV3 => ({
    version: 1,
    id: randomUUID(),
    toolId,
    resource: "jarvis",
    environment:
        toolId === "mock.production.deploy" ? "production" : "development",
    input: {
        commit: "a".repeat(40),
        branch: toolId === "mock.production.deploy" ? "main" : "development",
        files: ["docs/readme.md"],
        simulation: "pass",
        tests: "pass",
        scan: "pass",
    },
    ...overrides,
});
export function goPolicy(ownerId: string, actorId: string): PolicyV3 {
    const base = {
        id: "development",
        effect: "allow",
        actorIds: [actorId],
        maximumRisk: "R2",
        requireApproval: false,
        requireStepUp: false,
        requireSimulation: true,
        requireTests: true,
        requireScan: true,
        minimumConfidence: 0.9,
    };
    return PolicyV3Schema.parse({
        version: 1,
        id: "owner.go",
        revision: 1,
        status: "draft",
        createdAt: 0,
        activatedAt: null,
        creatorId: ownerId,
        precedence: "owner",
        supersedes: null,
        rules: [
            {
                ...base,
                capabilities: [
                    "github.repo.read",
                    "github.repo.write",
                    "tests.execute",
                ],
                scope: {
                    version: 1,
                    resource: "jarvis",
                    environments: ["development"],
                },
                branches: ["development"],
            },
            {
                ...base,
                id: "production-review",
                capabilities: ["github.production.deploy"],
                scope: {
                    version: 1,
                    resource: "jarvis",
                    environments: ["production"],
                },
                maximumRisk: "R4",
                requireApproval: true,
                requireStepUp: true,
                allowEscalationRequest: true,
                branches: ["main"],
            },
        ],
    });
}
export async function setupGovernance(
    f = governanceFixture(),
    existingOwner?: { device: TestDevice; session: Login },
) {
    const owner = existingOwner ?? (await root(f)),
        agent = new TestDevice();
    const created = (await ownerAction(
        f.engine,
        owner.device,
        owner.session,
        "subject.create",
        {
            name: "J0.3 Developer",
            kind: "agent",
            publicKey: agent.input.publicKey,
            scopes: [],
            resources: [],
        },
    )) as { subjectId: string; scopes: string[] };
    expect(created.scopes).toEqual([]);
    const ownerCommand = (command: string, data: unknown) =>
        ownerAction(f.engine, owner.device, owner.session, "security.command", {
            command,
            data,
        });
    const subjectCommand = async (command: string, data: unknown) => {
        const input = { command, data },
            c = await f.engine.beginSecuritySubject(created.subjectId, input);
        return f.engine.performSecuritySubject(
            created.subjectId,
            agent.proof(c),
            input,
        );
    };
    const policy = goPolicy(owner.session.ownerId, created.subjectId);
    await ownerCommand("policy.create", policy);
    await ownerCommand("policy.activate", { id: policy.id, revision: 1 });
    for (const capability of [
        "github.repo.read",
        "github.repo.write",
        "tests.execute",
    ])
        await ownerCommand("delegation.grant", {
            version: 1,
            actorId: created.subjectId,
            capability,
            resource: "jarvis",
            environment: "development",
            ttlSeconds: 600,
            maximumUses: 10,
            maximumRisk: "R2",
            toolId: null,
        });
    const now = Date.now();
    await ownerCommand("budget.set", {
        version: 1,
        actorId: created.subjectId,
        maximumRuntimeMs: 600000,
        maximumSpendMinor: 0,
        spentMinor: 0,
        maximumToolCalls: 20,
        toolCalls: 0,
        maximumRisk: "R2",
        resources: ["jarvis"],
        environments: ["development"],
        startedAt: now,
        notBefore: 0,
        expiresAt: now + 600000,
        networkAllowed: false,
        maximumConcurrent: 1,
        approvalThreshold: "R3",
    });
    return {
        f,
        owner,
        agent,
        actorId: created.subjectId,
        policy,
        ownerCommand,
        subjectCommand,
    };
}
export type GoHarness = Awaited<ReturnType<typeof setupGovernance>>;
export type Issued = { authorization: AuthorizationV3 };
export type Pending = {
    result: string;
    approval: { id: string; explanation: unknown };
    requestHash: string;
};

/** Complete phases A-N; synthetic handlers, real J0.2 signatures/passkey verifier. */
export async function completeGo(h: GoHarness) {
    const { subjectCommand: subject, ownerCommand: owner, policy, f } = h;
    // B-C: safe read and exact development mutation, including test execution.
    for (const tool of [
        "mock.repository.read",
        "mock.repository.write",
        "mock.tests.execute",
    ]) {
        const request = goRequest(tool),
            issued = (await subject("request", request)) as Issued;
        expect(issued.authorization.maximumUses).toBe(1);
        const result = await subject("execute", {
            request,
            authorization: issued.authorization,
        });
        expect(result).toMatchObject({
            result: { synthetic: true, toolId: tool, verified: true },
        });
    }
    // D-E: production is a request for explicit authority, not an inherited development capability.
    const deniedRequest = goRequest("mock.production.deploy"),
        pending = (await subject("request", deniedRequest)) as Pending;
    expect(pending.result).toBe("REQUEST_APPROVAL_AND_STEP_UP_AUTH");
    expect(pending.approval.explanation).toMatchObject({
        authenticationRequired: "A3",
        target: "jarvis",
    });
    await owner("approval.decide", {
        version: 1,
        approvalId: pending.approval.id,
        requestHash: pending.requestHash,
        decision: "deny",
    });
    await expect(
        subject("authorize", {
            approvalId: pending.approval.id,
            request: deniedRequest,
        }),
    ).rejects.toThrow("EXACT_APPROVAL_REQUIRED");
    // F: an agent cannot ask the gateway to execute without a bound authorization.
    await expect(
        subject("execute", { request: deniedRequest }),
    ).rejects.toThrow();
    // G-H: fresh signed owner approval, exact issuance/consumption, rejected replay.
    const request = goRequest("mock.production.deploy"),
        approve = (await subject("request", request)) as Pending;
    await owner("approval.decide", {
        version: 1,
        approvalId: approve.approval.id,
        requestHash: approve.requestHash,
        decision: "approve",
    });
    const issued = (await subject("authorize", {
        request,
        approvalId: approve.approval.id,
    })) as Issued;
    expect(issued.authorization.assurance).toBe("A3");
    expect(
        await subject("execute", {
            request,
            authorization: issued.authorization,
        }),
    ).toMatchObject({ result: { toolId: request.toolId } });
    await expect(
        subject("execute", { request, authorization: issued.authorization }),
    ).rejects.toThrow("AUTHORIZATION_REPLAY");
    await expect(
        subject("authorize", { request, approvalId: approve.approval.id }),
    ).rejects.toThrow("EXACT_APPROVAL_REQUIRED");
    // I-J: scope and self-approval.
    await expect(
        subject(
            "request",
            goRequest("mock.repository.read", { resource: "unrelated" }),
        ),
    ).rejects.toThrow();
    const another = (await subject(
        "request",
        goRequest("mock.production.deploy"),
    )) as Pending;
    await expect(
        subject("approval.decide", {
            version: 1,
            approvalId: another.approval.id,
            requestHash: another.requestHash,
            decision: "approve",
        }),
    ).rejects.toThrow("OWNER_REQUIRED_NO_SELF_APPROVAL");
    // K: persisted global state, owner-only release.
    await owner("controls.set", { flag: "SECURITY_LOCKDOWN", active: true });
    await expect(subject("request", goRequest())).rejects.toThrow(
        "SECURITY_LOCKDOWN",
    );
    await expect(
        subject("controls.set", { flag: "SECURITY_LOCKDOWN", active: false }),
    ).rejects.toThrow("OWNER_REQUIRED");
    await owner("controls.set", { flag: "SECURITY_LOCKDOWN", active: false });
    expect(
        ((await subject("request", goRequest())) as Issued).authorization,
    ).toBeDefined();
    // L: explicit owner deny beats lower-level allow.
    const high = structuredClone(policy);
    high.id = "owner.block";
    high.rules = [high.rules[0]!];
    high.rules[0]!.effect = "deny";
    const low = structuredClone(policy);
    low.id = "workflow.allow";
    low.precedence = "workflow";
    low.rules = [low.rules[0]!];
    for (const p of [high, low]) {
        await owner("policy.create", p);
        await owner("policy.activate", { id: p.id, revision: 1 });
    }
    await expect(subject("request", goRequest())).rejects.toThrow(
        "owner.block@1",
    );
    // M: invalid activation cannot replace a secure active version.
    await expect(
        owner("policy.create", {
            ...policy,
            id: "invalid",
            rules: [{ ...policy.rules[0], capabilities: ["everything"] }],
        }),
    ).rejects.toThrow();
    await expect(
        owner("policy.activate", { id: "invalid", revision: 1 }),
    ).rejects.toThrow("POLICY_UNAVAILABLE");
    await expect(subject("request", goRequest())).rejects.toThrow(
        "owner.block@1",
    );
    // N: real encrypted audit adapter or serialized unit fixture; all event categories.
    const events = await f.repository.audit(1000),
        types = new Set(events.map((e) => e.type));
    for (const type of [
        "authorization.requested",
        "permission.evaluated",
        "policy.evaluated",
        "risk.assessed",
        "approval.requested",
        "approval.denied",
        "approval.granted",
        "authentication.step_up_required",
        "authentication.succeeded",
        "authorization.issued",
        "authorization.consumed",
        "security.replay_attempt",
        "execution.verified",
        "emergency.state_activated",
        "emergency.state_released",
        "policy.changed",
    ])
        expect(types.has(type), type).toBe(true);
    expect(
        events.some(
            (e) =>
                e.type === "policy.evaluated" &&
                String(e.details?.reason).includes("owner.block@1"),
        ),
    ).toBe(true);
    const snapshot = await f.repository.transaction(async (state) =>
        GovernanceStateSchema.parse(state.security),
    );
    expect(snapshot.authorizations[issued.authorization.id]?.uses).toBe(1);
    expect(snapshot.approvals[pending.approval.id]?.status).toBe("denied");
    expect(snapshot.policies.find((p) => p.id === "owner.block")?.status).toBe(
        "active",
    );
    expect(digest(canonical(request))).toBe(approve.requestHash);
    return {
        eventCount: events.length,
        authorizationId: issued.authorization.id,
        ownerId: h.owner.session.ownerId,
    };
}
