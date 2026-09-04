import { describe, expect, it } from "vitest";
import {
    ContextAssembler,
    ConversationSessionEngine,
    J13ModelOrchestrator,
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

class MemoryConversationRepository implements ConversationSessionRepository {
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

const uuids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
];

const conversationAuthority = {
    ownerId: "owner",
    actorId: "owner",
    deviceId: "device-1",
    identitySessionId: "identity-session-1",
    securityEpoch: 3,
    operatingMode: "assistant" as const,
};

const modelDescriptor: ModelDescriptor = {
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

const modelRequest: J06ModelRequest = {
    version: 1,
    requestId: "request-integration",
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
        packageId: "ctx-integration",
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

describe("J1.3 integration with J1.1 and J1.2", () => {
    it("runs authorized session -> turn -> context -> model and blocks revoked continuation", async () => {
        const repository = new MemoryConversationRepository();
        let nextId = 0;
        let authorityValid = true;
        const sessions = new ConversationSessionEngine(
            repository,
            async () => authorityValid,
            () => uuids[nextId++]!,
        );
        const session = await sessions.openSession(conversationAuthority);
        const turn = await sessions.acceptTurn({
            authority: conversationAuthority,
            sessionId: session.id,
            conversationId: uuids[2]!,
            idempotencyKey: "integration-key",
            correlationId: "integration-correlation",
        });
        await sessions.transition(
            conversationAuthority,
            turn.id,
            "assembling_context",
        );
        const contextAuthority = {
            ownerId: "owner",
            conversationId: uuids[2]!,
            sessionId: session.id,
            turnId: turn.id,
            securityEpoch: 3,
            operatingMode: "assistant" as const,
            projectId: "jarvis",
        };
        const envelope = await new ContextAssembler({
            verify: () => authorityValid,
        }).assemble(
            contextAuthority,
            [
                {
                    sourceType: "conversation",
                    sourceId: "turn-input",
                    ownerId: "owner",
                    projectId: "jarvis",
                    provenance: "J1.1:turn-input",
                    classification: "D2",
                    freshness: 10,
                    retention: "session",
                    retentionBoundary: session.id,
                    disclosureEligibility: true,
                    digest: "b".repeat(64),
                    trust: "trusted",
                    priority: 100,
                    size: 10,
                    payload: "authorized turn context",
                },
            ],
            {
                disclosureTarget: "external-ai",
                classificationCeiling: "D2",
                maximumSize: 100,
                minimumFreshness: 0,
                allowUntrusted: false,
                now: 20,
            },
        );
        await sessions.transition(
            conversationAuthority,
            turn.id,
            "awaiting_model",
        );
        const registry = new ModelProviderRegistry();
        registry.register(new SyntheticModelAdapter(modelDescriptor));
        let operation = 0;
        const orchestrator = new J13ModelOrchestrator(
            new ModelRouter(registry),
            { verify: () => authorityValid },
            { create: () => `model-operation-${++operation}` },
            { now: () => 100 },
        );
        const result = await orchestrator.execute(
            {
                operationKey: `${turn.id}:model`,
                authority: contextAuthority,
                context: envelope,
                request: modelRequest,
                policy: {
                    route: {
                        allowedProviderIds: [],
                        deniedProviderIds: [],
                        preferredProviderIds: ["synthetic"],
                        allowDegraded: false,
                        maxAttempts: 1,
                    },
                    operationTimeoutMs: 2_000,
                    circuitFailureThreshold: 2,
                    circuitResetMs: 1_000,
                },
            },
            new AbortController().signal,
        );
        expect(result.result.providerId).toBe("synthetic");
        expect(result.acceptedAsContentOnly).toBe(true);

        authorityValid = false;
        await expect(
            orchestrator.execute(
                {
                    operationKey: `${turn.id}:model-after-revoke`,
                    authority: contextAuthority,
                    context: envelope,
                    request: modelRequest,
                    policy: {
                        route: {
                            allowedProviderIds: [],
                            deniedProviderIds: [],
                            preferredProviderIds: [],
                            allowDegraded: false,
                            maxAttempts: 1,
                        },
                        operationTimeoutMs: 2_000,
                        circuitFailureThreshold: 2,
                        circuitResetMs: 1_000,
                    },
                },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "MODEL_AUTHORITY_INVALID" });
    });
});
