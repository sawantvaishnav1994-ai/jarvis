export type ContextDataClass = "D0" | "D1" | "D2" | "D3" | "D4" | "D5";
export type ContextRetentionMode = "keep" | "until" | "session" | "never-store";
export type ContextTrust = "trusted" | "untrusted";
export type ContextOperatingMode =
    | "assistant"
    | "copilot"
    | "autonomous"
    | "focus"
    | "private"
    | "guest"
    | "safe"
    | "emergency";

export interface ContextAssemblyAuthority {
    ownerId: string;
    conversationId: string;
    sessionId: string;
    turnId: string;
    securityEpoch: number;
    operatingMode: ContextOperatingMode;
    projectId?: string | null;
}

export interface ContextCandidateSource {
    sourceType: string;
    sourceId: string;
    ownerId: string;
    projectId?: string | null;
    provenance: string;
    classification: ContextDataClass;
    freshness: number;
    retention: ContextRetentionMode;
    retentionBoundary?: number | string | null;
    disclosureEligibility: boolean;
    digest: string;
    trust: ContextTrust;
    priority: number;
    size: number;
    payload: string;
    deleted?: boolean;
    revoked?: boolean;
}

export interface ContextAssemblyPolicy {
    disclosureTarget: "local" | "private" | "external-ai";
    classificationCeiling: ContextDataClass;
    maximumSize: number;
    minimumFreshness: number;
    allowUntrusted: boolean;
    now: number;
}

export interface ContextSourceSelection {
    sourceType: string;
    sourceId: string;
    ownerId: string;
    projectId: string | null;
    provenance: string;
    classification: ContextDataClass;
    freshness: number;
    retention: ContextRetentionMode;
    disclosureEligibility: true;
    digest: string;
    trust: ContextTrust;
    priority: number;
    size: number;
    payload: string;
}

export interface ContextSourceExclusion {
    sourceId: string;
    reason:
        | "MALFORMED_SOURCE_DENIED"
        | "OWNER_SCOPE_DENIED"
        | "PROJECT_SCOPE_DENIED"
        | "D5_GENERIC_CONTEXT_DENIED"
        | "CLASSIFICATION_CEILING_DENIED"
        | "DISCLOSURE_DENIED"
        | "STALE_SOURCE_DENIED"
        | "RETENTION_EXPIRED"
        | "SESSION_BOUNDARY_DENIED"
        | "DELETED_OR_REVOKED"
        | "PROVENANCE_REQUIRED"
        | "UNTRUSTED_SOURCE_DENIED"
        | "BUDGET_EXCEEDED";
}

export interface ContextEnvelope {
    turnId: string;
    purpose: "conversation-turn";
    sources: ContextSourceSelection[];
    excluded: ContextSourceExclusion[];
    disclosureTarget: ContextAssemblyPolicy["disclosureTarget"];
    maximumSize: number;
    usedSize: number;
    classificationCeiling: ContextDataClass;
    generatedAt: number;
}

export interface ContextAuthorityVerifier {
    verify(authority: ContextAssemblyAuthority): boolean | Promise<boolean>;
}

export class ContextAssemblyError extends Error {}

const CLASS_RANK: Record<ContextDataClass, number> = {
    D0: 0,
    D1: 1,
    D2: 2,
    D3: 3,
    D4: 4,
    D5: 5,
};
const OPERATING_MODES: readonly ContextOperatingMode[] = [
    "assistant",
    "copilot",
    "autonomous",
    "focus",
    "private",
    "guest",
    "safe",
    "emergency",
];
const RETENTION_MODES: readonly ContextRetentionMode[] = [
    "keep",
    "until",
    "session",
    "never-store",
];
const TRUST_LEVELS: readonly ContextTrust[] = ["trusted", "untrusted"];
const DISCLOSURE_TARGETS: readonly ContextAssemblyPolicy["disclosureTarget"][] =
    ["local", "private", "external-ai"];

function validAuthority(authority: ContextAssemblyAuthority): boolean {
    return (
        authority.ownerId.length > 0 &&
        authority.conversationId.length > 0 &&
        authority.sessionId.length > 0 &&
        authority.turnId.length > 0 &&
        Number.isSafeInteger(authority.securityEpoch) &&
        authority.securityEpoch >= 0 &&
        OPERATING_MODES.includes(authority.operatingMode) &&
        (authority.projectId === undefined ||
            authority.projectId === null ||
            (typeof authority.projectId === "string" &&
                authority.projectId.length > 0))
    );
}

function validPolicy(policy: ContextAssemblyPolicy): boolean {
    return (
        DISCLOSURE_TARGETS.includes(policy.disclosureTarget) &&
        policy.classificationCeiling in CLASS_RANK &&
        Number.isSafeInteger(policy.maximumSize) &&
        policy.maximumSize >= 0 &&
        Number.isSafeInteger(policy.minimumFreshness) &&
        policy.minimumFreshness >= 0 &&
        typeof policy.allowUntrusted === "boolean" &&
        Number.isSafeInteger(policy.now) &&
        policy.now >= 0
    );
}

function validCandidate(source: ContextCandidateSource): boolean {
    return (
        typeof source.sourceType === "string" &&
        source.sourceType.length > 0 &&
        typeof source.sourceId === "string" &&
        source.sourceId.length > 0 &&
        typeof source.ownerId === "string" &&
        source.ownerId.length > 0 &&
        (source.projectId === undefined ||
            source.projectId === null ||
            (typeof source.projectId === "string" &&
                source.projectId.length > 0)) &&
        typeof source.provenance === "string" &&
        source.classification in CLASS_RANK &&
        Number.isSafeInteger(source.freshness) &&
        source.freshness >= 0 &&
        RETENTION_MODES.includes(source.retention) &&
        typeof source.disclosureEligibility === "boolean" &&
        typeof source.digest === "string" &&
        TRUST_LEVELS.includes(source.trust) &&
        Number.isSafeInteger(source.priority) &&
        Number.isSafeInteger(source.size) &&
        source.size >= 0 &&
        typeof source.payload === "string" &&
        (source.deleted === undefined || typeof source.deleted === "boolean") &&
        (source.revoked === undefined || typeof source.revoked === "boolean")
    );
}

function retentionAllowed(
    source: ContextCandidateSource,
    authority: ContextAssemblyAuthority,
    policy: ContextAssemblyPolicy,
): "ok" | ContextSourceExclusion["reason"] {
    if (source.retention === "until") {
        if (
            typeof source.retentionBoundary !== "number" ||
            source.retentionBoundary <= policy.now
        )
            return "RETENTION_EXPIRED";
    }
    if (source.retention === "session") {
        if (source.retentionBoundary !== authority.sessionId)
            return "SESSION_BOUNDARY_DENIED";
    }
    return "ok";
}

function stableOrder(
    a: ContextCandidateSource,
    b: ContextCandidateSource,
): number {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.freshness !== b.freshness) return b.freshness - a.freshness;
    if (a.sourceType !== b.sourceType)
        return a.sourceType.localeCompare(b.sourceType);
    return a.sourceId.localeCompare(b.sourceId);
}

export class ContextAssembler {
    constructor(private readonly verifier: ContextAuthorityVerifier) {}

    async assemble(
        authority: ContextAssemblyAuthority,
        candidates: readonly ContextCandidateSource[],
        policy: ContextAssemblyPolicy,
    ): Promise<ContextEnvelope> {
        if (
            !validAuthority(authority) ||
            !validPolicy(policy) ||
            !(await this.verifier.verify(authority))
        )
            throw new ContextAssemblyError("CONTEXT_AUTHORITY_INVALID");

        const selected: ContextSourceSelection[] = [];
        const excluded: ContextSourceExclusion[] = [];
        const validCandidates: ContextCandidateSource[] = [];
        let usedSize = 0;

        for (const source of candidates) {
            if (!validCandidate(source)) {
                excluded.push({
                    sourceId:
                        typeof source.sourceId === "string"
                            ? source.sourceId
                            : "",
                    reason: "MALFORMED_SOURCE_DENIED",
                });
                continue;
            }
            validCandidates.push(source);
        }

        for (const source of validCandidates.sort(stableOrder)) {
            let reason: ContextSourceExclusion["reason"] | null = null;
            if (source.ownerId !== authority.ownerId)
                reason = "OWNER_SCOPE_DENIED";
            else if (
                authority.projectId &&
                source.projectId &&
                source.projectId !== authority.projectId
            )
                reason = "PROJECT_SCOPE_DENIED";
            else if (source.classification === "D5")
                reason = "D5_GENERIC_CONTEXT_DENIED";
            else if (
                CLASS_RANK[source.classification] >
                CLASS_RANK[policy.classificationCeiling]
            )
                reason = "CLASSIFICATION_CEILING_DENIED";
            else if (!source.disclosureEligibility)
                reason = "DISCLOSURE_DENIED";
            else if (source.freshness < policy.minimumFreshness)
                reason = "STALE_SOURCE_DENIED";
            else if (source.deleted || source.revoked)
                reason = "DELETED_OR_REVOKED";
            else if (!source.provenance || !source.digest)
                reason = "PROVENANCE_REQUIRED";
            else if (source.trust === "untrusted" && !policy.allowUntrusted)
                reason = "UNTRUSTED_SOURCE_DENIED";
            else {
                const retention = retentionAllowed(source, authority, policy);
                if (retention !== "ok") reason = retention;
            }

            if (!reason && usedSize + source.size > policy.maximumSize)
                reason = "BUDGET_EXCEEDED";

            if (reason) {
                excluded.push({ sourceId: source.sourceId, reason });
                continue;
            }

            usedSize += source.size;
            selected.push({
                sourceType: source.sourceType,
                sourceId: source.sourceId,
                ownerId: source.ownerId,
                projectId: source.projectId ?? null,
                provenance: source.provenance,
                classification: source.classification,
                freshness: source.freshness,
                retention: source.retention,
                disclosureEligibility: true,
                digest: source.digest,
                trust: source.trust,
                priority: source.priority,
                size: source.size,
                payload: source.payload,
            });
        }

        return {
            turnId: authority.turnId,
            purpose: "conversation-turn",
            sources: selected,
            excluded,
            disclosureTarget: policy.disclosureTarget,
            maximumSize: policy.maximumSize,
            usedSize,
            classificationCeiling: policy.classificationCeiling,
            generatedAt: policy.now,
        };
    }
}
