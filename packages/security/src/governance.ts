import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
    canonical,
    digest,
    secret,
    IdentityFault,
    type IdentityState,
    type SecurityCommandHandler,
    type DelegationRecord,
} from "@jarvis/identity";
import { IdentifierSchema as Id } from "@jarvis/shared";
import { BoundaryError } from "@jarvis/shared";
import {
    ActionRequestV3Schema,
    GovernanceStateSchema,
    PolicyV3Schema,
    SecurityFlagSchema,
    DelegationV3Schema,
    AutonomyBudgetSchema,
    ApprovalDecisionV3Schema,
    AuthorizationV3Schema,
    type GovernanceState,
    type ActionRequestV3,
    type RiskFactors,
    type AuthorizationV3,
} from "./governance-contracts.js";
import {
    assessRisk,
    evaluateGovernancePolicy,
    activePolicyHash,
    rank,
    policyVersion,
} from "./governance-policy.js";

export interface ProtectedToolCatalog {
    describe(request: ActionRequestV3): {
        capability: string;
        factors: RiskFactors;
    };
    /** J0.4 adapters may perform bounded transactional storage work, never arbitrary network effects. */
    execute(
        request: ActionRequestV3,
        authorization: AuthorizationV3,
        permit: object,
        transient?: unknown,
    ): unknown;
    verify(request: ActionRequestV3, result: unknown): boolean;
}
const executionPermits = new WeakMap<object, string>();
/** Verifier only; no exported mint operation. A copied authorization is not an execution permit. */
export function consumeExecutionPermit(
    permit: object,
    request: ActionRequestV3,
    authorization: AuthorizationV3,
): boolean {
    const binding = executionPermits.get(permit);
    executionPermits.delete(permit);
    return binding === digest(canonical({ request, authorization }));
}
const Command = z.strictObject({
    command: z.string().min(1).max(60),
    data: z.json(),
});
const fail = (code: string): never => {
    throw new IdentityFault(code);
};
export class GovernanceEngine {
    constructor(
        private readonly tools: ProtectedToolCatalog,
        private readonly clock: () => number = Date.now,
    ) {}
    readonly handle: SecurityCommandHandler = async (
        identity,
        events,
        principal,
        input,
    ) => {
        const command = Command.parse(input),
            now = this.clock();
        const audit = (
            type: string,
            details: Record<string, unknown> = {},
            outcome: "success" | "denied" = "success",
        ) => {
            events.push({
                version: 1,
                id: randomUUID(),
                type,
                timestamp: now,
                actorId: principal.actorId,
                deviceId: principal.deviceId,
                subjectId:
                    principal.kind === "owner" ? null : principal.actorId,
                operation: command.command,
                outcome,
                code:
                    typeof details.reason === "string" ? details.reason : "OK",
                assurance: principal.assurance,
                approval: principal.evidence,
                details,
            });
        };
        const deny = (reason: string): never => {
            audit("execution.denied", { reason }, "denied");
            return fail(reason);
        };
        if (!identity.owner || principal.ownerId !== identity.owner.id)
            return deny("OWNER_MISMATCH");
        if (principal.kind !== "owner") {
            const subject = identity.subjects[principal.actorId];
            if (
                !subject ||
                subject.revoked ||
                subject.ownerId !== principal.ownerId
            )
                return deny("SUBJECT_INVALID");
        }
        const state: GovernanceState =
            identity.security === undefined
                ? {
                      version: 1,
                      ownerId: identity.owner.id,
                      controls: {
                          version: 1,
                          epoch: 0,
                          flags: [
                              "EXTERNAL_ACTIONS_DISABLED",
                              "NETWORK_DISABLED",
                              "READ_ONLY_MODE",
                          ],
                          frozenActors: [],
                      },
                      policies: [],
                      budgets: {},
                      approvals: {},
                      authorizations: {},
                      requests: {},
                      riskRules: [
                          "AUTO_ALLOW",
                          "ALLOW_WITH_AUDIT",
                          "ALLOW_WITH_AUDIT",
                          "REQUEST_APPROVAL",
                          "REQUEST_APPROVAL_AND_STEP_UP_AUTH",
                          "DENY",
                      ],
                  }
                : GovernanceStateSchema.parse(identity.security);
        if (state.ownerId !== identity.owner.id)
            return deny("SECURITY_OWNER_MISMATCH");
        // Assignment at entry preserves audited denials/replay state in the identity transaction.
        identity.security = state;
        const owner = () => {
            if (
                principal.kind !== "owner" ||
                principal.actorId !== identity.owner!.id
            )
                return deny("OWNER_REQUIRED_NO_SELF_APPROVAL");
            if (
                principal.assurance !== "A3" ||
                !principal.evidence ||
                !principal.sessionId ||
                !principal.deviceId
            )
                return deny("FRESH_STEP_UP_REQUIRED");
            this.liveParent(
                identity,
                principal.sessionId,
                principal.deviceId,
                now,
            );
        };
        const findGrant = (
            request: ActionRequestV3,
            capability: string,
        ): DelegationRecord | undefined =>
            Object.values(identity.delegations).find(
                (d) =>
                    d.subjectId === principal.actorId &&
                    d.scope === capability &&
                    d.resource === request.resource &&
                    d.governance?.environment === request.environment &&
                    this.grantValid(identity, d, now),
            );
        const checkControls = (f: RiskFactors) => {
            const flags = state.controls.flags;
            if (flags.includes("SECURITY_LOCKDOWN"))
                return deny("SECURITY_LOCKDOWN");
            if (state.controls.frozenActors.includes(principal.actorId))
                return deny("ACTOR_FROZEN");
            if (principal.kind !== "owner" && flags.includes("AGENTS_FROZEN"))
                return deny("AGENTS_FROZEN");
            if (
                principal.kind !== "owner" &&
                flags.includes("AUTONOMY_DISABLED")
            )
                return deny("AUTONOMY_DISABLED");
            if (flags.includes("READ_ONLY_MODE") && rank(f.permission) >= 2)
                return deny("READ_ONLY_MODE");
            if (flags.includes("EXTERNAL_ACTIONS_DISABLED") && f.external)
                return deny("EXTERNAL_ACTIONS_DISABLED");
            if (flags.includes("NETWORK_DISABLED") && f.network)
                return deny("NETWORK_DISABLED");
        };
        const evaluate = (request: ActionRequestV3) => {
            let tool: ReturnType<ProtectedToolCatalog["describe"]>;
            try {
                tool = this.tools.describe(request);
            } catch (error) {
                if (error instanceof BoundaryError) return deny(error.code);
                throw error;
            }
            // The catalog derives all factors from validated synthetic operations, not model-supplied authority.
            const risk = assessRisk(
                {
                    ...tool.factors,
                    assurance: principal.assurance,
                    identityTrust:
                        principal.kind === "owner" ? "trusted" : "restricted",
                },
                now,
            );
            const decision = evaluateGovernancePolicy(
                state,
                principal.actorId,
                tool.capability,
                request,
                risk,
                now,
            );
            return { ...tool, risk, decision };
        };
        const budgetCheck = (
            request: ActionRequestV3,
            risk: string,
            network: boolean,
            approved = false,
        ) => {
            const b = state.budgets[principal.actorId];
            if (
                !b ||
                !b.resources.includes(request.resource) ||
                (!b.environments.includes(request.environment) && !approved) ||
                now < b.notBefore ||
                now >= b.expiresAt ||
                now - b.startedAt >= b.maximumRuntimeMs ||
                b.toolCalls >= b.maximumToolCalls ||
                b.spentMinor > b.maximumSpendMinor ||
                (network && !b.networkAllowed) ||
                (rank(risk) > rank(b.maximumRisk) && !approved)
            )
                return deny("AUTONOMY_BUDGET_DENIED");
            return b;
        };
        const issue = (
            request: ActionRequestV3,
            approvalId: string | null = null,
        ) => {
            const { capability, factors, risk, decision } = evaluate(request);
            audit("risk.assessed", {
                requestId: request.id,
                stage: "authorization",
                ...risk,
            });
            audit("policy.evaluated", {
                requestId: request.id,
                stage: "authorization",
                ...decision,
            });
            checkControls(factors);
            if (decision.result === "DENY") return deny(decision.reason);
            const grant = findGrant(request, capability);
            const approval = approvalId
                ? state.approvals[approvalId]
                : undefined;
            const needsApproval =
                decision.approvalRequired ||
                decision.stepUpRequired ||
                !grant ||
                rank(risk.level) >=
                    rank(
                        state.budgets[principal.actorId]?.approvalThreshold ??
                            "R0",
                    );
            if (
                (needsApproval || approvalId !== null) &&
                (!approval ||
                    approval.status !== "approved" ||
                    approval.expiresAt <= now ||
                    approval.actorId !== principal.actorId ||
                    approval.inputHash !== digest(canonical(request.input)) ||
                    canonical(approval.request) !== canonical(request) ||
                    approval.policyHash !== activePolicyHash(state) ||
                    approval.epoch !== state.controls.epoch ||
                    approval.ownershipEpoch !== identity.owner!.epoch ||
                    approval.approvingIdentity !== identity.owner!.id ||
                    approval.approvingIdentity === principal.actorId ||
                    approval.assurance !== "A3" ||
                    !approval.proofId)
            )
                return deny("EXACT_APPROVAL_REQUIRED");
            if (!grant && !decision.escalationAllowed)
                return deny("CAPABILITY_SCOPE_DENIED");
            if (grant && rank(risk.level) > grant.governance!.maximumRisk)
                return deny("DELEGATION_RISK_DENIED");
            const sessionId = approval?.ownerSessionId ?? grant?.sessionId;
            const deviceId = approval?.ownerDeviceId ?? grant?.deviceId;
            if (!sessionId || !deviceId) return deny("LIVE_AUTHORITY_REQUIRED");
            const parent = this.liveParent(identity, sessionId, deviceId, now);
            budgetCheck(
                request,
                risk.level,
                factors.network,
                Boolean(approval),
            );
            const authorization = AuthorizationV3Schema.parse({
                version: 1,
                id: randomUUID(),
                actorId: principal.actorId,
                ownerId: principal.ownerId,
                sessionId,
                deviceId,
                requestId: request.id,
                toolId: request.toolId,
                capability,
                permission: factors.permission,
                resource: request.resource,
                environment: request.environment,
                policyVersions: decision.policyVersions,
                policyHash: activePolicyHash(state),
                riskId: risk.id,
                risk: risk.level,
                zone: factors.toZone,
                approvalId,
                assurance: approval ? "A3" : principal.assurance,
                issuedAt: now,
                expiresAt: Math.min(
                    now + 60000,
                    parent.expiresAt,
                    parent.lastActivity + 300000,
                    grant?.expiresAt ?? Infinity,
                    approval?.expiresAt ?? Infinity,
                ),
                maximumUses: 1,
                uses: 0,
                inputHash: digest(canonical(request.input)),
                status: "issued",
                epoch: state.controls.epoch,
                ownershipEpoch: identity.owner!.epoch,
                delegationId: grant?.id ?? null,
            });
            if (Object.keys(state.authorizations).length >= 1000)
                return deny("AUTHORIZATION_LIMIT");
            state.authorizations[authorization.id] = authorization;
            if (approval) approval.status = "consumed";
            audit("authorization.issued", {
                authorizationId: authorization.id,
                requestId: request.id,
                policyVersions: decision.policyVersions,
                riskId: risk.id,
                approvalId,
            });
            return structuredClone(authorization);
        };
        switch (command.command) {
            case "legacy.guard": {
                // Preserve J0.2's read-only mock, but never let its compatibility path bypass emergency state.
                z.strictObject({
                    scope: z.literal("mock.read"),
                    resource: Id,
                }).parse(command.data);
                checkControls({
                    permission: "P0",
                    external: false,
                    network: false,
                } as RiskFactors);
                audit("permission.evaluated", {
                    compatibilityPath: "J0.2 synthetic read",
                    controlEpoch: state.controls.epoch,
                });
                return { guarded: true };
            }
            case "inspect": {
                if (principal.kind !== "owner") return deny("OWNER_REQUIRED");
                return {
                    controls: state.controls,
                    policies: state.policies,
                    budgets: state.budgets,
                    approvals: Object.fromEntries(
                        Object.entries(state.approvals).map(([id, a]) => [
                            id,
                            { ...a, requestHash: digest(canonical(a.request)) },
                        ]),
                    ),
                    authorizations: state.authorizations,
                    requests: state.requests,
                    delegations: Object.values(identity.delegations)
                        .filter((d) => d.governance)
                        .map(({ tokenHash: _hash, ...d }) => d),
                };
            }
            case "policy.create": {
                owner();
                const p = PolicyV3Schema.parse(command.data);
                if (
                    p.precedence === "constitution" ||
                    p.status !== "draft" ||
                    p.activatedAt !== null ||
                    p.creatorId !== principal.ownerId
                )
                    return deny("PROTECTED_POLICY");
                const previous = state.policies.filter((v) => v.id === p.id);
                const last = Math.max(0, ...previous.map((v) => v.revision));
                if (p.revision !== last + 1 || p.supersedes !== (last || null))
                    return deny("POLICY_VERSION_INVALID");
                if (
                    state.policies.length >= 256 ||
                    p.rules.some(
                        (r) =>
                            r.standing &&
                            (rank(r.maximumRisk) > 2 ||
                                r.allowEscalationRequest),
                    )
                )
                    return deny("POLICY_LIMIT_OR_UNSAFE_STANDING_APPROVAL");
                p.createdAt = now;
                state.policies.push(p);
                audit("policy.changed", {
                    policyVersions: [policyVersion(p)],
                    status: "draft",
                });
                return { policy: p };
            }
            case "policy.activate":
            case "policy.disable": {
                owner();
                const v = z
                    .strictObject({
                        id: Id,
                        revision: z.number().int().positive(),
                    })
                    .parse(command.data);
                const p = state.policies.find(
                    (p) => p.id === v.id && p.revision === v.revision,
                );
                if (!p || p.precedence === "constitution")
                    return deny("POLICY_UNAVAILABLE");
                PolicyV3Schema.parse(p);
                if (command.command === "policy.activate") {
                    if (
                        p.status !== "draft" ||
                        state.policies.some(
                            (q) => q.id === p.id && q.revision > p.revision,
                        )
                    )
                        return deny("POLICY_ROLLBACK_DENIED");
                    for (const q of state.policies)
                        if (q.id === p.id && q.status === "active")
                            q.status = "superseded";
                    p.status = "active";
                    p.activatedAt = now;
                } else {
                    p.status = "disabled";
                }
                state.controls.epoch++;
                audit("policy.changed", {
                    policyVersions: [policyVersion(p)],
                    status: p.status,
                });
                return { policy: p };
            }
            case "policy.test": {
                owner();
                const v = z
                    .strictObject({
                        actorId: Id,
                        request: ActionRequestV3Schema,
                    })
                    .parse(command.data);
                const { capability, factors } = this.tools.describe(v.request),
                    risk = assessRisk(factors, now);
                return evaluateGovernancePolicy(
                    state,
                    v.actorId,
                    capability,
                    v.request,
                    risk,
                    now,
                );
            }
            case "risk.configure": {
                owner();
                const rules = GovernanceStateSchema.shape.riskRules.parse(
                    command.data,
                );
                if (
                    !rules[3].includes("APPROVAL") ||
                    !rules[4].includes("APPROVAL_AND_STEP_UP") ||
                    rules[5] !== "DENY"
                )
                    return deny("CONSTITUTION_RISK_FLOOR");
                state.riskRules = rules;
                state.controls.epoch++;
                audit("policy.changed", { riskRules: rules });
                return { configured: true };
            }
            case "delegation.grant": {
                owner();
                const v = DelegationV3Schema.parse(command.data),
                    subject = identity.subjects[v.actorId];
                if (
                    !subject ||
                    subject.revoked ||
                    subject.ownerId !== principal.ownerId
                )
                    return deny("SUBJECT_INVALID");
                if (
                    rank(v.maximumRisk) > 2 ||
                    v.environment !== "development" ||
                    ![
                        "github.repo.read",
                        "github.repo.write",
                        "tests.execute",
                        "data.inventory",
                    ].includes(v.capability) ||
                    (v.capability === "data.inventory" &&
                        v.resource !== "owner-data")
                )
                    return deny("STANDING_DELEGATION_LIMIT");
                const parent = this.liveParent(
                    identity,
                    principal.sessionId!,
                    principal.deviceId!,
                    now,
                );
                const tokenHash = digest(secret()),
                    id = randomUUID();
                identity.delegations[tokenHash] = {
                    id,
                    tokenHash,
                    subjectId: subject.id,
                    ownerId: principal.ownerId,
                    deviceId: principal.deviceId!,
                    sessionId: principal.sessionId!,
                    scope: v.capability,
                    resource: v.resource,
                    expiresAt: Math.min(
                        now + v.ttlSeconds * 1000,
                        parent.expiresAt,
                    ),
                    epoch: identity.owner.epoch,
                    revoked: false,
                    audience: "jarvis.mock",
                    governance: {
                        version: 1,
                        environment: v.environment,
                        maximumRisk: rank(v.maximumRisk),
                        maximumUses: v.maximumUses,
                        uses: 0,
                        toolId: v.toolId,
                    },
                };
                if (!subject.scopes.includes(v.capability))
                    subject.scopes.push(v.capability);
                if (!subject.resources.includes(v.resource))
                    subject.resources.push(v.resource);
                audit("delegation.created", {
                    delegationId: id,
                    actorId: subject.id,
                    capability: v.capability,
                    resource: v.resource,
                });
                return { delegationId: id };
            }
            case "budget.set": {
                owner();
                const b = AutonomyBudgetSchema.parse(command.data);
                if (
                    !identity.subjects[b.actorId] ||
                    b.spentMinor !== 0 ||
                    b.toolCalls !== 0 ||
                    state.budgets[b.actorId]
                )
                    return deny("BUDGET_INVALID_OR_EXISTS");
                if (b.networkAllowed || b.maximumSpendMinor !== 0)
                    return deny("EXTERNAL_SPEND_DISABLED");
                b.startedAt = now;
                state.budgets[b.actorId] = b;
                audit("policy.changed", { budgetActorId: b.actorId });
                return { budget: b };
            }
            case "delegation.revoke": {
                owner();
                const v = z.strictObject({ id: Id }).parse(command.data);
                const d = Object.values(identity.delegations).find(
                    (d) => d.id === v.id,
                );
                if (!d) return deny("DELEGATION_UNKNOWN");
                d.revoked = true;
                audit("delegation.revoked", { delegationId: d.id });
                return { revoked: true };
            }
            case "authorization.revoke": {
                owner();
                const v = z.strictObject({ id: Id }).parse(command.data),
                    a = state.authorizations[v.id];
                if (!a) return deny("AUTHORIZATION_UNKNOWN");
                a.status = "revoked";
                audit("authorization.revoked", { authorizationId: a.id });
                return { revoked: true };
            }
            case "actor.freeze": {
                owner();
                const v = z.strictObject({ actorId: Id }).parse(command.data);
                if (!identity.subjects[v.actorId])
                    return deny("SUBJECT_INVALID");
                if (!state.controls.frozenActors.includes(v.actorId))
                    state.controls.frozenActors.push(v.actorId);
                for (const d of Object.values(identity.delegations))
                    if (d.subjectId === v.actorId) {
                        d.revoked = true;
                        audit("delegation.revoked", { delegationId: d.id });
                    }
                state.controls.epoch++;
                audit("actor.frozen", { actorId: v.actorId });
                audit("security.incident", {
                    actorId: v.actorId,
                    response: "freeze-revoke-notify-owner",
                });
                return { frozen: true };
            }
            case "controls.set": {
                owner();
                const v = z
                    .strictObject({
                        flag: SecurityFlagSchema,
                        active: z.boolean(),
                    })
                    .parse(command.data);
                state.controls.flags = state.controls.flags.filter(
                    (f) => f !== v.flag,
                );
                if (v.active) state.controls.flags.push(v.flag);
                state.controls.epoch++;
                audit(
                    v.active
                        ? "emergency.state_activated"
                        : "emergency.state_released",
                    { flag: v.flag, epoch: state.controls.epoch },
                );
                return structuredClone(state.controls);
            }
            case "request": {
                if (principal.kind === "owner")
                    return deny("REQUESTER_MUST_BE_RESTRICTED_ACTOR");
                const request = ActionRequestV3Schema.parse(command.data);
                audit("authorization.requested", {
                    requestId: request.id,
                    toolId: request.toolId,
                });
                if (state.requests[request.id]) {
                    audit(
                        "security.replay_attempt",
                        { requestId: request.id },
                        "denied",
                    );
                    return deny("REQUEST_REPLAY");
                }
                if (Object.keys(state.requests).length >= 1000)
                    return deny("REQUEST_LIMIT");
                const { capability, factors, risk, decision } =
                    evaluate(request);
                const grant = findGrant(request, capability);
                audit("permission.evaluated", {
                    requestId: request.id,
                    capability,
                    delegated: Boolean(grant),
                });
                audit("policy.evaluated", {
                    requestId: request.id,
                    ...decision,
                });
                audit("risk.assessed", { requestId: request.id, ...risk });
                checkControls(factors);
                if (decision.result === "DENY") return deny(decision.reason);
                const subject = identity.subjects[principal.actorId]!;
                // Explicit owner review rule permits proposals, never execution, beyond a development grant.
                const proposalParent = Object.values(identity.delegations).find(
                    (d) =>
                        d.subjectId === subject.id &&
                        d.resource === request.resource &&
                        d.governance &&
                        this.grantValid(identity, d, now),
                );
                const escalation =
                    !grant &&
                    decision.escalationAllowed &&
                    subject.resources.includes(request.resource) &&
                    proposalParent;
                if (!grant && !escalation)
                    return deny("CAPABILITY_SCOPE_DENIED");
                if (
                    grant &&
                    (rank(risk.level) > grant.governance!.maximumRisk ||
                        (grant.governance!.toolId &&
                            grant.governance!.toolId !== request.toolId))
                )
                    return deny("DELEGATION_LIMIT");
                const budget = budgetCheck(
                    request,
                    risk.level,
                    factors.network,
                    Boolean(escalation),
                );
                state.requests[request.id] = {
                    actorId: principal.actorId,
                    request,
                    risk,
                    decision,
                };
                if (
                    decision.approvalRequired ||
                    decision.stepUpRequired ||
                    escalation ||
                    rank(risk.level) >= rank(budget.approvalThreshold)
                ) {
                    const id = randomUUID(),
                        expiresAt = now + 120000;
                    const approval = {
                        version: 1 as const,
                        id,
                        actorId: principal.actorId,
                        request,
                        capability,
                        inputHash: digest(canonical(request.input)),
                        risk,
                        policyHash: activePolicyHash(state),
                        policyVersions: decision.policyVersions,
                        epoch: state.controls.epoch,
                        ownershipEpoch: identity.owner.epoch,
                        createdAt: now,
                        expiresAt,
                        maximumUses: 1 as const,
                        status: "pending" as const,
                        approvingIdentity: null,
                        ownerSessionId: null,
                        ownerDeviceId: null,
                        assurance: null,
                        proofId: null,
                        explanation: {
                            action: request.toolId,
                            requestedBy: principal.actorId,
                            target: request.resource,
                            changes: `Synthetic ${request.environment} action; input digest ${digest(canonical(request.input))}`,
                            why: decision.reason,
                            reversibility: factors.reversibility,
                            impact: factors.blastRadius,
                            capability,
                            zone: factors.toZone,
                            authenticationRequired: "A3" as const,
                            expiresAt,
                        },
                    };
                    state.approvals[id] =
                        GovernanceStateSchema.shape.approvals.valueType.parse(
                            approval,
                        );
                    audit("approval.requested", {
                        approvalId: id,
                        requestId: request.id,
                        policyVersions: decision.policyVersions,
                    });
                    audit("authentication.step_up_required", {
                        approvalId: id,
                        required: "A3",
                    });
                    return {
                        result: "REQUEST_APPROVAL_AND_STEP_UP_AUTH",
                        approval: state.approvals[id],
                        requestHash: digest(canonical(request)),
                    };
                }
                return {
                    result: decision.result,
                    authorization: issue(request),
                };
            }
            case "approval.decide": {
                owner();
                const v = ApprovalDecisionV3Schema.parse(command.data),
                    a = state.approvals[v.approvalId];
                if (
                    !a ||
                    a.actorId === principal.actorId ||
                    a.status !== "pending" ||
                    a.expiresAt <= now ||
                    v.requestHash !== digest(canonical(a.request)) ||
                    a.policyHash !== activePolicyHash(state) ||
                    a.epoch !== state.controls.epoch ||
                    a.ownershipEpoch !== identity.owner.epoch
                )
                    return deny("APPROVAL_BINDING_OR_STATE_INVALID");
                a.status = v.decision === "approve" ? "approved" : "denied";
                a.approvingIdentity = principal.actorId;
                a.ownerSessionId = principal.sessionId;
                a.ownerDeviceId = principal.deviceId;
                a.assurance = "A3";
                a.proofId = digest(canonical(principal.evidence));
                a.expiresAt = Math.min(a.expiresAt, now + 60000);
                audit(
                    v.decision === "approve"
                        ? "approval.granted"
                        : "approval.denied",
                    {
                        approvalId: a.id,
                        requestId: a.request.id,
                        proofId: a.proofId,
                        policyVersions: a.policyVersions,
                    },
                );
                return { decision: a.status, approvalId: a.id };
            }
            case "authorize": {
                const v = z
                    .strictObject({
                        approvalId: Id,
                        request: ActionRequestV3Schema,
                    })
                    .parse(command.data);
                return { authorization: issue(v.request, v.approvalId) };
            }
            case "execute": {
                const v = z
                    .strictObject({
                        authorization: AuthorizationV3Schema,
                        request: ActionRequestV3Schema,
                        transient: z.json().optional(),
                    })
                    .parse(command.data);
                const a = state.authorizations[v.authorization.id];
                if (
                    v.transient !== undefined &&
                    v.request.input.payloadHash !==
                        digest(canonical(v.transient))
                )
                    return deny("TRANSIENT_PAYLOAD_BINDING_INVALID");
                if (a?.status === "consumed") {
                    audit(
                        "security.replay_attempt",
                        { authorizationId: a.id },
                        "denied",
                    );
                    return deny("AUTHORIZATION_REPLAY");
                }
                if (
                    !a ||
                    a.status !== "issued" ||
                    a.uses !== 0 ||
                    canonical(a) !== canonical(v.authorization)
                )
                    return deny("AUTHORIZATION_INVALID");
                if (a.expiresAt <= now) {
                    a.status = "expired";
                    audit("authorization.expired", { authorizationId: a.id });
                    return deny("AUTHORIZATION_EXPIRED");
                }
                const saved = state.requests[a.requestId];
                if (
                    a.actorId !== principal.actorId ||
                    !saved ||
                    saved.actorId !== principal.actorId ||
                    canonical(saved.request) !== canonical(v.request) ||
                    a.inputHash !== digest(canonical(v.request.input)) ||
                    a.epoch !== state.controls.epoch ||
                    a.ownershipEpoch !== identity.owner.epoch ||
                    a.policyHash !== activePolicyHash(state)
                )
                    return deny("AUTHORIZATION_BINDING_INVALID");
                this.liveParent(identity, a.sessionId, a.deviceId, now);
                const { factors, risk, decision } = evaluate(v.request);
                audit("risk.assessed", {
                    requestId: v.request.id,
                    stage: "execution",
                    ...risk,
                });
                audit("policy.evaluated", {
                    requestId: v.request.id,
                    stage: "execution",
                    ...decision,
                });
                checkControls(factors);
                if (
                    decision.result === "DENY" ||
                    rank(risk.level) > rank(a.risk)
                )
                    return deny("AUTHORIZATION_POLICY_CHANGED");
                const grant = a.delegationId
                    ? Object.values(identity.delegations).find(
                          (d) => d.id === a.delegationId,
                      )
                    : undefined;
                if (
                    a.delegationId &&
                    (!grant ||
                        !this.grantValid(identity, grant, now) ||
                        (grant.governance!.toolId &&
                            grant.governance!.toolId !== a.toolId))
                )
                    return deny("DELEGATION_INVALID");
                if (
                    a.approvalId &&
                    state.approvals[a.approvalId]?.status !== "consumed"
                )
                    return deny("APPROVAL_REVOKED");
                const b = budgetCheck(
                    v.request,
                    risk.level,
                    factors.network,
                    Boolean(a.approvalId),
                );
                a.status = "consumed";
                a.uses++;
                b.toolCalls++;
                if (grant) grant.governance!.uses++;
                audit("authorization.consumed", {
                    authorizationId: a.id,
                    requestId: a.requestId,
                    policyVersions: a.policyVersions,
                });
                audit("execution.allowed", {
                    authorizationId: a.id,
                    riskId: a.riskId,
                });
                try {
                    const permit = Object.freeze({});
                    executionPermits.set(
                        permit,
                        digest(
                            canonical({ request: v.request, authorization: a }),
                        ),
                    );
                    let result: unknown;
                    try {
                        result = await this.tools.execute(
                            v.request,
                            structuredClone(a),
                            permit,
                            v.transient,
                        );
                    } finally {
                        executionPermits.delete(permit);
                    }
                    if (!this.tools.verify(v.request, result))
                        return deny("RESULT_VERIFICATION_FAILED");
                    audit("execution.verified", { authorizationId: a.id });
                    return { result, authorizationId: a.id };
                } catch {
                    audit(
                        "execution.failed",
                        {
                            authorizationId: a.id,
                            reason: "OUTCOME_UNCERTAIN_NO_AUTOMATIC_RETRY",
                        },
                        "denied",
                    );
                    return fail("TOOL_FAILED");
                }
            }
            default:
                return deny("SECURITY_COMMAND_DENIED");
        }
    };
    private liveParent(
        identity: IdentityState,
        sessionId: string,
        deviceId: string,
        now: number,
    ) {
        const s = Object.values(identity.sessions).find(
                (s) => s.id === sessionId,
            ),
            d = identity.devices[deviceId];
        if (
            !s ||
            s.revoked ||
            s.ownerId !== identity.owner?.id ||
            s.epoch !== identity.owner.epoch ||
            s.deviceId !== deviceId ||
            s.expiresAt <= now ||
            s.lastActivity + 300000 <= now ||
            s.risk !== "normal" ||
            !d ||
            d.ownerId !== identity.owner.id ||
            d.revokedAt !== null ||
            !["trusted", "privileged"].includes(d.trust) ||
            d.posture === "suspicious" ||
            (d.expiresAt !== null && d.expiresAt <= now)
        )
            return fail("PARENT_SESSION_OR_DEVICE_INVALID");
        return s;
    }
    private grantValid(
        identity: IdentityState,
        d: DelegationRecord,
        now: number,
    ): boolean {
        const subject = identity.subjects[d.subjectId];
        if (
            !d.governance ||
            d.revoked ||
            d.ownerId !== identity.owner?.id ||
            d.epoch !== identity.owner.epoch ||
            d.expiresAt <= now ||
            d.governance.uses >= d.governance.maximumUses ||
            !subject ||
            subject.revoked ||
            !subject.scopes.includes(d.scope) ||
            !subject.resources.includes(d.resource)
        )
            return false;
        try {
            this.liveParent(identity, d.sessionId, d.deviceId, now);
            return true;
        } catch {
            return false;
        }
    }
}
