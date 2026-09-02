import { randomUUID } from "node:crypto";
import { canonical, digest } from "@jarvis/identity";
import {
    RiskFactorsSchema,
    RiskAssessmentSchema,
    PolicyDecisionV3Schema,
    type RiskAssessment,
    type PolicyV3,
    type ActionRequestV3,
    type GovernanceState,
    type PolicyDecisionV3,
    type RiskFactors,
} from "./governance-contracts.js";

export const rank = (value: string): number => Number(value.slice(1));
export const policyVersion = (p: PolicyV3): string => `${p.id}@${p.revision}`;
export function activePolicyHash(state: GovernanceState): string {
    return digest(
        canonical({
            policies: state.policies.filter((p) => p.status === "active"),
            riskRules: state.riskRules,
        }),
    );
}
export function assessRisk(raw: RiskFactors, now: number): RiskAssessment {
    const f = RiskFactorsSchema.parse(raw);
    const reasons: string[] = [];
    let level = [0, 0, 1, 1, 3, 5][rank(f.permission)]!;
    const floor = (n: number, reason: string) => {
        level = Math.max(level, n);
        if (n) reasons.push(reason);
    };
    floor(
        f.reversibility === "IRREVERSIBLE"
            ? 4
            : f.reversibility === "PARTIALLY_REVERSIBLE"
              ? 2
              : 0,
        "reversibility",
    );
    floor(
        {
            record: 0,
            file: 0,
            repository: 1,
            service: 2,
            "many-users": 4,
            "all-data": 5,
            "physical-domain": 4,
        }[f.blastRadius],
        "blast-radius",
    );
    floor(
        f.financialMinor > 100000 ? 4 : f.financialMinor > 0 ? 3 : 0,
        "financial-impact",
    );
    floor(f.privacy, "privacy-impact");
    floor(f.security, "security-impact");
    floor(f.physical, "physical-impact");
    floor(
        f.production || f.environment === "production" ? 3 : 0,
        "production-impact",
    );
    floor(
        f.volume >= 10000 ? 4 : f.volume > 100 ? 3 : f.volume > 1 ? 1 : 0,
        "volume",
    );
    floor(
        f.resourceCount > 100 ? 4 : f.resourceCount > 1 ? 2 : 0,
        "resource-count",
    );
    floor(
        f.identityTrust === "restricted" && rank(f.permission) >= 3 ? 1 : 0,
        "identity-trust",
    );
    floor(
        f.assurance === "A1" && rank(f.permission) >= 4 ? 3 : 0,
        "session-assurance",
    );
    floor(f.novelty ? 2 : 0, "novelty");
    floor(f.unusual ? 4 : 0, "unusual-behavior");
    floor(
        f.confidence < 0.5 || !f.verified ? 3 : f.confidence < 0.9 ? 2 : 0,
        "verification-confidence",
    );
    floor(
        rank(f.toZone) > rank(f.fromZone) ? Math.max(2, rank(f.toZone) - 1) : 0,
        "security-zone-crossing",
    );
    floor(
        f.toZone === "Z5" || (f.external && f.privacy >= 3) ? 5 : 0,
        "restricted-disclosure",
    );
    return RiskAssessmentSchema.parse({
        version: 1,
        id: randomUUID(),
        level: `R${level}`,
        factors: f,
        reasons: reasons.length
            ? reasons
            : ["negligible verified scoped action"],
        assessedAt: now,
    });
}
const precedence = [
    "constitution",
    "owner",
    "system",
    "resource",
    "actor",
    "workflow",
    "request",
];
export function evaluateGovernancePolicy(
    state: GovernanceState,
    actorId: string,
    capability: string,
    request: ActionRequestV3,
    risk: RiskAssessment,
    now: number,
): PolicyDecisionV3 {
    const matched = state.policies
        .filter((p) => p.status === "active")
        .sort(
            (a, b) =>
                precedence.indexOf(a.precedence) -
                precedence.indexOf(b.precedence),
        )
        .flatMap((p) =>
            p.rules
                .filter(
                    (r) =>
                        r.capabilities.includes(capability as never) &&
                        r.scope.resource === request.resource &&
                        r.scope.environments.includes(request.environment) &&
                        (r.actorIds.length === 0 ||
                            r.actorIds.includes(actorId)),
                )
                .map((rule) => ({ policy: p, rule })),
        );
    const versions = [...new Set(matched.map((m) => policyVersion(m.policy)))];
    const rules = matched.map((m) => `${policyVersion(m.policy)}:${m.rule.id}`);
    const deny = (reason: string) =>
        PolicyDecisionV3Schema.parse({
            version: 1,
            result: "DENY",
            reason,
            policyVersions: versions,
            ruleIds: rules,
            riskId: risk.id,
            approvalRequired: false,
            stepUpRequired: false,
            escalationAllowed: false,
        });
    if (risk.level === "R5" || risk.factors.permission === "P5")
        return deny(
            "Constitution prohibits critical/restricted mock execution; A4 is not established.",
        );
    if (!matched.length)
        return deny(
            "No active policy explicitly permits this capability and exact resource/environment.",
        );
    const blocking = matched.find((m) => m.rule.effect === "deny");
    if (blocking)
        return deny(
            `Denied by ${policyVersion(blocking.policy)}:${blocking.rule.id}; lower-level rules cannot override this denial.`,
        );
    for (const { rule: r, policy: p } of matched) {
        if (now < r.notBefore || (r.expiresAt !== null && now >= r.expiresAt))
            return deny(`Policy window closed: ${policyVersion(p)}:${r.id}.`);
        if (rank(risk.level) > rank(r.maximumRisk))
            return deny(
                `Risk exceeds ${r.maximumRisk} in ${policyVersion(p)}:${r.id}.`,
            );
        if (
            (r.requireSimulation && !risk.factors.simulated) ||
            (r.requireTests && !risk.factors.testsPassed) ||
            (r.requireScan && !risk.factors.scanPassed) ||
            risk.factors.confidence < r.minimumConfidence
        )
            return deny(
                `Required simulation/tests/scan/confidence not verified: ${r.id}.`,
            );
        if (
            r.branches.length &&
            !r.branches.includes(String(request.input.branch))
        )
            return deny(`Branch not approved: ${r.id}.`);
        if (r.pathPrefixes.length) {
            const files = request.input.files;
            if (
                !Array.isArray(files) ||
                !files.length ||
                files.some(
                    (f) =>
                        typeof f !== "string" ||
                        f.includes("..") ||
                        !r.pathPrefixes.some((prefix) => f.startsWith(prefix)),
                )
            )
                return deny(`Changed files exceed standing scope: ${r.id}.`);
        }
        if (r.scope.fields.length) {
            const fields = request.input.fields;
            if (
                !Array.isArray(fields) ||
                fields.some(
                    (f) => typeof f !== "string" || !r.scope.fields.includes(f),
                )
            )
                return deny(`Requested fields exceed ${r.id}.`);
        }
        if (
            r.financial &&
            risk.factors.financialMinor > r.financial.singleActionMinor
        )
            return deny(
                "Financial amount exceeds policy; financial execution remains disabled.",
            );
    }
    const defaultResult = state.riskRules[rank(risk.level)]!;
    if (defaultResult === "DENY")
        return deny(`Risk policy denies ${risk.level}.`);
    const approval =
        rank(risk.level) >= 3 ||
        matched.some((m) => m.rule.requireApproval) ||
        defaultResult.includes("APPROVAL");
    const stepUp =
        rank(risk.level) >= 4 ||
        matched.some((m) => m.rule.requireStepUp) ||
        defaultResult.includes("STEP_UP");
    const result = approval
        ? stepUp
            ? "REQUEST_APPROVAL_AND_STEP_UP_AUTH"
            : "REQUEST_APPROVAL"
        : stepUp
          ? "REQUEST_STEP_UP_AUTH"
          : rank(risk.level) === 0
            ? "AUTO_ALLOW"
            : "ALLOW_WITH_AUDIT";
    return PolicyDecisionV3Schema.parse({
        version: 1,
        result,
        reason: `${approval ? "Owner approval required" : "Explicitly allowed"}: ${risk.level}; matched ${rules.join(", ")}. All execution is audited.`,
        policyVersions: versions,
        ruleIds: rules,
        riskId: risk.id,
        approvalRequired: approval,
        stepUpRequired: stepUp,
        escalationAllowed: matched.some((m) => m.rule.allowEscalationRequest),
    });
}
