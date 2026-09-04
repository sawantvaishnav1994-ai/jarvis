import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@jarvis/config";
import { J14TurnPipeline, type J14TurnPipelineInput } from "@jarvis/core";
import { FileSecretManager } from "@jarvis/security";
import {
    databasePool,
    migrate,
    PostgresConversationSessionRepository,
    type DatabasePool,
} from "@jarvis/storage";

let admin: DatabasePool;
let migratorPool: DatabasePool;
let pool: DatabasePool;
const config = await loadConfig("config/development.json");
const actor = {
    version: 1 as const,
    id: "j1.4-integration",
    kind: "service" as const,
    environment: "development" as const,
};
const database = "jarvis_j14_test_" + randomBytes(8).toString("hex");
const ownerId = "j14-owner-" + randomUUID();
const deviceId = "j14-device-" + randomUUID();
const identitySessionId = "j14-session-" + randomUUID();
const conversationId = randomUUID();

beforeAll(async () => {
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
    );
    const migrator = await manager.lease(
        config.storage.postgres.migratorPasswordRef,
        actor,
    );
    try {
        if (!/^jarvis_j14_test_[a-f0-9]{16}$/.test(database))
            throw new Error("UNSAFE_TEST_DATABASE");
        admin = databasePool(
            config.storage.postgres,
            migrator.value.toString("utf8"),
            true,
        );
        await admin.query(`CREATE DATABASE ${database}`);
        migratorPool = databasePool(
            { ...config.storage.postgres, database },
            migrator.value.toString("utf8"),
            true,
        );
        await migrate(
            migratorPool,
            "infrastructure/migrations",
            "development",
            config.storage.postgres.runtimeUser,
            runtime.value.toString("utf8"),
        );
        pool = databasePool(
            { ...config.storage.postgres, database },
            runtime.value.toString("utf8"),
        );
    } finally {
        runtime.destroy();
        migrator.destroy();
    }
    await pool.query(
        "INSERT INTO identity.root_owner(singleton,id,payload) VALUES(true,$1,'synthetic')",
        [ownerId],
    );
    await pool.query(
        "INSERT INTO identity.devices(id,payload) VALUES($1,'synthetic')",
        [deviceId],
    );
    await pool.query(
        "INSERT INTO identity.sessions(id,payload) VALUES($1,'synthetic')",
        [identitySessionId],
    );
    await pool.query(
        "INSERT INTO storage.record_catalog(id,owner_id,domain,revision,data_class) VALUES($1,$2,'conversation',1,'D1')",
        [conversationId, ownerId],
    );
    await pool.query(
        "INSERT INTO conversations.conversations(id,owner_id,payload,metadata) VALUES($1,$2,'synthetic','{}')",
        [conversationId, ownerId],
    );
}, 30_000);

afterAll(async () => {
    await pool?.end();
    await migratorPool?.end();
    if (admin) {
        if (!/^jarvis_j14_test_[a-f0-9]{16}$/.test(database))
            throw new Error("UNSAFE_TEST_DATABASE");
        await admin.query(`DROP DATABASE ${database}`);
        await admin.end();
    }
});

describe("J1.4 PostgreSQL turn coordination", () => {
    it("binds a governed pipeline execution to a real persisted J1.1 session and turn", async () => {
        const repository = new PostgresConversationSessionRepository(pool);
        const session = await repository.createSession({
            id: randomUUID(),
            ownerId,
            actorId: ownerId,
            deviceId,
            identitySessionId,
            securityEpoch: 4,
            operatingMode: "assistant",
            state: "ACTIVE",
            version: 1,
        });
        const turn = await repository.createTurn({
            id: randomUUID(),
            ownerId,
            conversationId,
            sessionId: session.id,
            inputMessageId: null,
            state: "accepted",
            idempotencyKey: "j14-postgres-turn",
            correlationId: "j14-postgres-correlation",
            reasonCode: null,
            version: 1,
        });
        const authority = {
            ownerId,
            conversationId,
            sessionId: session.id,
            turnId: turn.id,
            securityEpoch: 4,
            operatingMode: "assistant" as const,
            projectId: "jarvis",
        };
        const input: J14TurnPipelineInput = {
            authority,
            conversationId,
            sessionId: session.id,
            turnId: turn.id,
            correlationId: "j14-postgres-correlation",
            idempotencyKey: "j14-postgres-pipeline",
            inputDigest: "a".repeat(64),
            contextDigest: "b".repeat(64),
            modelOperationDigest: "c".repeat(64),
            candidates: [],
            contextPolicy: {
                disclosureTarget: "local",
                classificationCeiling: "D1",
                maximumSize: 0,
                minimumFreshness: 0,
                allowUntrusted: false,
                now: 10,
            },
            modelRequest: {
                version: 1,
                requestId: "j14-postgres-request",
                ownerId,
                projectId: "jarvis",
                messages: [{ role: "user", content: "hello" }],
                requiredCapabilities: ["text"],
                processingTarget: "LOCAL",
                dataPolicy: {
                    version: 1,
                    classification: "D1",
                    privacy: "local-only",
                    retention: { mode: "session" },
                    consent: {
                        storeConversation: false,
                        createMemory: false,
                        projectKnowledge: false,
                        keepAttachments: false,
                        personalization: false,
                        externalAI: false,
                    },
                },
                context: {
                    packageId: "j14-postgres-context",
                    classification: "D1",
                    privacy: "local-only",
                    externalAI: false,
                    minimized: true,
                    containsSecretMaterial: false,
                },
                inputTokenEstimate: 1,
                maxOutputTokens: 5,
                maxTotalTokens: 10,
                maxCost: 0,
                timeoutMs: 1_000,
                responseFormat: "text",
                contractId: null,
            },
            modelPolicy: {
                route: {
                    allowedProviderIds: [],
                    deniedProviderIds: [],
                    preferredProviderIds: [],
                    allowDegraded: false,
                    maxAttempts: 1,
                },
                operationTimeoutMs: 1_000,
                operationAttemptLimit: 1,
                operationMaxTokens: 10,
                operationMaxCost: 0,
                operationAllowUnknownCost: false,
                circuitFailureThreshold: 2,
                circuitResetMs: 1_000,
            },
        };
        const pipeline = new J14TurnPipeline(
            {
                verify: async (candidate) => {
                    const stored = await repository.getSession(
                        candidate.ownerId,
                        candidate.sessionId,
                    );
                    return stored &&
                        stored.state === "ACTIVE" &&
                        stored.securityEpoch === candidate.securityEpoch
                        ? { valid: true, reason: "OK" as const }
                        : { valid: false, reason: "REVOKED" as const };
                },
            },
            {
                assemble: async (candidate, _sources, policy) => ({
                    turnId: candidate.turnId,
                    purpose: "conversation-turn",
                    sources: [],
                    excluded: [],
                    disclosureTarget: policy.disclosureTarget,
                    maximumSize: policy.maximumSize,
                    usedSize: 0,
                    classificationCeiling: policy.classificationCeiling,
                    generatedAt: policy.now,
                }),
            },
            {
                execute: async () => ({
                    operationId: "j14-postgres-operation",
                    turnId: turn.id,
                    correlationId: "j14-model-correlation",
                    result: {
                        version: 1,
                        requestId: "j14-postgres-request",
                        providerId: "local-synthetic",
                        modelId: "local-model",
                        text: "ok",
                        structured: null,
                        usage: {
                            inputTokens: 1,
                            outputTokens: 1,
                            totalTokens: 2,
                            cost: 0,
                        },
                        finishReason: "stop",
                        verified: true,
                    },
                    decision: {
                        version: 1,
                        requestId: "j14-postgres-request",
                        selectedProviderId: "local-synthetic",
                        selectedModelId: "local-model",
                        candidates: [],
                        reasons: [],
                    },
                    attemptsBound: 1,
                    fallbackPossible: false,
                    reservedTokenBudget: 2,
                    reservedCostBudget: 0,
                    selectedEstimatedMaximumCost: 0,
                    actualCost: 0,
                    costStatus: "actual",
                    cancellationState: "not-requested",
                    acceptedAsContentOnly: true,
                }),
            },
            { now: () => 100 },
        );
        const completed = await pipeline.execute(
            input,
            new AbortController().signal,
        );
        expect(completed.state).toBe("COMPLETED");
        expect(completed.response).toBe("ok");

        await repository.updateSessionState(
            ownerId,
            session.id,
            session.version,
            "REVOKED",
        );
        const revoked = await pipeline.execute(
            {
                ...input,
                idempotencyKey: "j14-postgres-after-revoke",
                inputDigest: "d".repeat(64),
                modelOperationDigest: "e".repeat(64),
            },
            new AbortController().signal,
        );
        expect(revoked.state).toBe("REVOKED");
    });
});
