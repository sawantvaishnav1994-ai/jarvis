import { describe, expect, it } from "vitest";
import {
    ContextAssembler,
    ConversationSessionEngine,
    J13ModelOrchestrator,
    J14TurnPipeline,
    type ConversationSession,
    type ConversationSessionRepository,
    type ConversationTurn,
} from "@jarvis/core";
import {
    ModelProviderRegistry,
    ModelRouter,
    SyntheticModelAdapter,
    type J06ModelRequest,
    type ModelDescriptor,
} from "@jarvis/models";

class MemoryRepository implements ConversationSessionRepository {
    sessions = new Map<string, ConversationSession>();
    turns = new Map<string, ConversationTurn>();
    async createSession(session: ConversationSession) {
        this.sessions.set(session.id, session);
        return session;
    }
    async getSession(_ownerId: string, sessionId: string) {
        return this.sessions.get(sessionId) ?? null;
    }
    async updateSessionState(
        _ownerId: string,
        sessionId: string,
        expectedVersion: number,
        state: ConversationSession["state"],
    ) {
        const current = this.sessions.get(sessionId)!;
        if (current.version !== expectedVersion) throw new Error("conflict");
        const next = { ...current, state, version: current.version + 1 };
        this.sessions.set(sessionId, next);
        return next;
    }
    async createTurn(turn: ConversationTurn) {
        this.turns.set(turn.id, turn);
        return turn;
    }
    async getTurn(_ownerId: string, turnId: string) {
        return this.turns.get(turnId) ?? null;
    }
    async transitionTurn(
        _ownerId: string,
        turnId: string,
        expectedVersion: number,
        state: ConversationTurn["state"],
        reasonCode: string | null,
    ) {
        const current = this.turns.get(turnId)!;
        if (current.version !== expectedVersion) throw new Error("conflict");
        const next = {
            ...current,
            state,
            reasonCode,
            version: current.version + 1,
        };
        this.turns.set(turnId, next);
        return next;
    }
}

const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
];
const conversationAuthority = {
    ownerId: "owner",
    actorId: "owner",
    deviceId: "device-1",
    identitySessionId: "identity-1",
    securityEpoch: 7,
    operatingMode: "assistant" as const,
};
const descriptor: ModelDescriptor = {
    version: 1,
    providerId: "synthetic",
    modelId: "reasoner",
    locality: "APPROVED_EXTERNAL",
    capabilities: ["text", "reasoning"],
    contextWindowTokens: 4_000,
    maxOutputTokens: 500,
    inputCostPerMillion: 1,
    outputCostPerMillion: 2,
    health: "HEALTHY",
    credentialRef: null,
};
const request: J06ModelRequest = {
    version: 1,
    requestId: "j14-integration-request",
    ownerId: "owner",
    projectId: "jarvis",
    messages: [{ role: "user", content: "respond" }],
    requiredCapabilities: ["text"],
    processingTarget: "APPROVED_EXTERNAL",
    dataPolicy: {
        version: 1,
        classification: "D2",
        privacy: "ai-allow",
        retention: { mode: "keep" },
        consent: {
            storeConversation: true,
            createMemory: false,
            projectKnowledge: false,
            keepAttachments: false,
            personalization: false,
            externalAI: true,
        },
    },
    context: {
        packageId: "j14-integration-context",
        classification: "D2",
        privacy: "ai-allow",
        externalAI: true,
        minimized: true,
        containsSecretMaterial: false,
    },
    inputTokenEstimate: 20,
    maxOutputTokens: 20,
    maxTotalTokens: 100,
    maxCost: 1,
    timeoutMs: 1_000,
    responseFormat: "text",
    contractId: null,
};

describe("J1.4 J1.1 -> J1.2 -> J1.3 composition", () => {
    it("executes one governed content-only turn and blocks a stale continuation", async () => {
        const repository = new MemoryRepository();
        let next = 0;
        let valid = true;
        const sessions = new ConversationSessionEngine(
            repository,
            async () => valid,
            () => ids[next++]!,
        );
        const session = await sessions.openSession(conversationAuthority);
        const turn = await sessions.acceptTurn({
            authority: conversationAuthority,
            sessionId: session.id,
            conversationId: ids[2]!,
            idempotencyKey: "j14-turn",
            correlationId: "j14-correlation",
        });
        const contextAuthority = {
            ownerId: "owner",
            conversationId: ids[2]!,
            sessionId: session.id,
            turnId: turn.id,
            securityEpoch: 7,
            operatingMode: "assistant" as const,
            projectId: "jarvis",
        };
        const assembler = new ContextAssembler({ verify: () => valid });
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(descriptor));
        let operation = 0;
        const orchestrator = new J13ModelOrchestrator(
            new ModelRouter(registry),
            { verify: () => valid },
            { create: () => `j14-operation-${++operation}` },
            { now: () => 100 },
        );
        const pipeline = new J14TurnPipeline(
            {
                verify: () => ({
                    valid,
                    reason: valid ? "OK" : "REVOKED",
                }),
            },
            assembler,
            orchestrator,
            { now: () => 100 },
        );
        const baseInput = {
            authority: contextAuthority,
            conversationId: contextAuthority.conversationId,
            sessionId: contextAuthority.sessionId,
            turnId: contextAuthority.turnId,
            correlationId: "j14-correlation",
            idempotencyKey: "j14-pipeline",
            inputDigest: "a".repeat(64),
            contextDigest: "b".repeat(64),
            modelOperationDigest: "c".repeat(64),
            candidates: [
                {
                    sourceType: "conversation",
                    sourceId: "input",
                    ownerId: "owner",
                    projectId: "jarvis",
                    provenance: "J1.1:turn-input",
                    classification: "D2" as const,
                    freshness: 10,
                    retention: "session" as const,
                    retentionBoundary: session.id,
                    disclosureEligibility: true,
                    digest: "d".repeat(64),
                    trust: "trusted" as const,
                    priority: 100,
                    size: 10,
                    payload: "authorized turn context",
                },
            ],
            contextPolicy: {
                disclosureTarget: "external-ai" as const,
                classificationCeiling: "D2" as const,
                maximumSize: 100,
                minimumFreshness: 0,
                allowUntrusted: false,
                now: 20,
            },
            modelRequest: request,
            modelPolicy: {
                route: {
                    allowedProviderIds: [],
                    deniedProviderIds: [],
                    preferredProviderIds: ["synthetic"],
                    allowDegraded: false,
                    maxAttempts: 1,
                },
                operationTimeoutMs: 2_000,
                operationAttemptLimit: 2,
                operationMaxTokens: 200,
                operationMaxCost: 1,
                operationAllowUnknownCost: false,
                circuitFailureThreshold: 2,
                circuitResetMs: 1_000,
            },
        };
        const completed = await pipeline.execute(
            baseInput,
            new AbortController().signal,
        );
        expect(completed.state).toBe("COMPLETED");
        expect(completed.response).toContain("synthetic");
        expect(completed.toolExecutionCommitted).toBe(false);
        expect(completed.memoryWriteCommitted).toBe(false);

        valid = false;
        const revoked = await pipeline.execute(
            {
                ...baseInput,
                idempotencyKey: "j14-pipeline-revoked",
                inputDigest: "e".repeat(64),
                modelOperationDigest: "f".repeat(64),
            },
            new AbortController().signal,
        );
        expect(revoked.state).toBe("REVOKED");
    });
});
