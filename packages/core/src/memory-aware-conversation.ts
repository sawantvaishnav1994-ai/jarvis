import {
    ContextAssembler,
    ContextAssemblyError,
    type ContextAssemblyAuthority,
    type ContextAssemblyPolicy,
    type ContextCandidateSource,
    type ContextEnvelope,
} from "./context-assembly.js";

export interface ConversationMemoryQuery {
    ownerId: string;
    projectId: string | null;
    conversationId: string;
    sessionId: string;
    turnId: string;
    securityEpoch: number;
    query: string;
    limit: number;
}

export interface ConversationMemoryItem {
    memoryId: string;
    ownerId: string;
    projectId: string | null;
    provenance: string;
    classification: ContextCandidateSource["classification"];
    freshness: number;
    retention: ContextCandidateSource["retention"];
    retentionBoundary?: number | string | null;
    disclosureEligibility: boolean;
    digest: string;
    trust: ContextCandidateSource["trust"];
    priority: number;
    payload: string;
    deleted?: boolean;
    revoked?: boolean;
}

export interface ConversationMemoryPackage {
    ownerId: string;
    projectId: string | null;
    turnId: string;
    securityEpoch: number;
    items: readonly ConversationMemoryItem[];
    degraded: boolean;
    degradationReasons: readonly string[];
}

export interface ConversationMemoryRetrievalPort {
    retrieve(query: ConversationMemoryQuery): Promise<ConversationMemoryPackage>;
}

export interface ConversationMemoryCandidate {
    ownerId: string;
    projectId: string | null;
    conversationId: string;
    turnId: string;
    securityEpoch: number;
    content: string;
    provenance: string;
}

export interface ConversationMemoryAdmissionResult {
    decision:
        | "ACCEPT"
        | "ACCEPT_EPHEMERAL"
        | "MERGE_WITH_EXISTING"
        | "SUPERSEDE_EXISTING"
        | "MARK_CONFLICT"
        | "REQUIRE_OWNER_CONFIRMATION"
        | "REJECT";
    canonicalMemoryId: string | null;
    reasonCodes: readonly string[];
}

export interface ConversationMemoryAdmissionPort {
    submit(candidate: ConversationMemoryCandidate): Promise<ConversationMemoryAdmissionResult>;
}

export interface MemoryAwareContextResult {
    context: ContextEnvelope;
    memoryDegraded: boolean;
    memoryDegradationReasons: readonly string[];
}

export class MemoryAwareConversationError extends Error {}

function validQuery(query: string, limit: number): boolean {
    return (
        typeof query === "string" &&
        query.trim().length > 0 &&
        query.length <= 10000 &&
        Number.isSafeInteger(limit) &&
        limit >= 1 &&
        limit <= 100
    );
}

function itemToCandidate(item: ConversationMemoryItem): ContextCandidateSource {
    return {
        sourceType: "memory",
        sourceId: item.memoryId,
        ownerId: item.ownerId,
        projectId: item.projectId,
        provenance: item.provenance,
        classification: item.classification,
        freshness: item.freshness,
        retention: item.retention,
        retentionBoundary: item.retentionBoundary,
        disclosureEligibility: item.disclosureEligibility,
        digest: item.digest,
        trust: item.trust,
        priority: item.priority,
        size: item.payload.length,
        payload: item.payload,
        deleted: item.deleted,
        revoked: item.revoked,
    };
}

export class MemoryAwareConversationService {
    constructor(
        private readonly assembler: ContextAssembler,
        private readonly retrieval: ConversationMemoryRetrievalPort,
        private readonly admission: ConversationMemoryAdmissionPort,
    ) {}

    async assembleContext(
        authority: ContextAssemblyAuthority,
        baseCandidates: readonly ContextCandidateSource[],
        policy: ContextAssemblyPolicy,
        query: string,
        limit = 20,
    ): Promise<MemoryAwareContextResult> {
        if (!validQuery(query, limit))
            throw new MemoryAwareConversationError("J16_MEMORY_QUERY_INVALID");

        const memory = await this.retrieval.retrieve({
            ownerId: authority.ownerId,
            projectId: authority.projectId ?? null,
            conversationId: authority.conversationId,
            sessionId: authority.sessionId,
            turnId: authority.turnId,
            securityEpoch: authority.securityEpoch,
            query,
            limit,
        });

        if (
            memory.ownerId !== authority.ownerId ||
            memory.projectId !== (authority.projectId ?? null) ||
            memory.turnId !== authority.turnId ||
            memory.securityEpoch !== authority.securityEpoch
        )
            throw new MemoryAwareConversationError("J16_MEMORY_AUTHORITY_MISMATCH");

        const memoryCandidates = memory.items.map(itemToCandidate);
        let context: ContextEnvelope;
        try {
            context = await this.assembler.assemble(
                authority,
                [...baseCandidates, ...memoryCandidates],
                policy,
            );
        } catch (error) {
            if (error instanceof ContextAssemblyError) throw error;
            throw new MemoryAwareConversationError("J16_CONTEXT_ASSEMBLY_FAILED");
        }

        return {
            context,
            memoryDegraded: memory.degraded,
            memoryDegradationReasons: [...memory.degradationReasons],
        };
    }

    async submitCandidate(
        authority: ContextAssemblyAuthority,
        candidate: ConversationMemoryCandidate,
    ): Promise<ConversationMemoryAdmissionResult> {
        if (
            candidate.ownerId !== authority.ownerId ||
            candidate.projectId !== (authority.projectId ?? null) ||
            candidate.conversationId !== authority.conversationId ||
            candidate.turnId !== authority.turnId ||
            candidate.securityEpoch !== authority.securityEpoch ||
            candidate.content.trim().length === 0 ||
            candidate.content.length > 50000 ||
            candidate.provenance.trim().length === 0
        )
            throw new MemoryAwareConversationError("J16_MEMORY_CANDIDATE_AUTHORITY_MISMATCH");

        return this.admission.submit(candidate);
    }
}
