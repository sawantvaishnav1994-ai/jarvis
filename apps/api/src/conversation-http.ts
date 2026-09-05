import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
    IdentityEngine,
    IdentityFault,
    type ServiceProof,
} from "@jarvis/identity";
import {
    ContextAssembler,
    J13ModelOrchestrator,
    J14TurnPipeline,
} from "@jarvis/core";
import {
    ModelProviderRegistry,
    ModelRouter,
    SyntheticModelAdapter,
    type J06ModelRequest,
    type ModelDescriptor,
} from "@jarvis/models";

const TurnRequestSchema = z.strictObject({
    message: z.string().trim().min(1).max(20_000),
    conversationId: z.string().uuid().nullable().default(null),
});
const ProofSchema = z.strictObject({
    challengeId: z.string().min(1).max(128),
    signature: z.string().min(1).max(256),
});
const RpcSchema = z.discriminatedUnion("phase", [
    z.strictObject({
        phase: z.literal("begin"),
        request: TurnRequestSchema,
        token: z.string().max(128),
        contextHash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
    z.strictObject({
        phase: z.literal("turn"),
        request: TurnRequestSchema,
        proof: ProofSchema,
        token: z.string().max(128),
        contextHash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
]);
const IdentitySnapshotSchema = z.object({
    owner: z.object({ id: z.string().min(1) }),
    currentSession: z.object({
        id: z.string().min(1),
        deviceId: z.string().min(1),
        assurance: z.enum(["A1", "A2"]),
    }),
    sessions: z.array(
        z.object({
            id: z.string().min(1),
            ownerId: z.string().min(1),
            deviceId: z.string().min(1),
            assurance: z.enum(["A1", "A2"]),
            epoch: z.number().int().nonnegative(),
            revoked: z.boolean(),
            risk: z.enum(["normal", "restricted"]),
        }),
    ),
});

const descriptor: ModelDescriptor = {
    version: 1,
    providerId: "synthetic-ui",
    modelId: "j1.11-development",
    locality: "LOCAL",
    capabilities: ["text", "reasoning", "streaming"],
    contextWindowTokens: 4_000,
    maxOutputTokens: 500,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    health: "HEALTHY",
    credentialRef: null,
};

function bindingDigest(request: z.infer<typeof TurnRequestSchema>): string {
    return createHash("sha256")
        .update(JSON.stringify(request))
        .digest("hex");
}

async function readBody(req: IncomingMessage): Promise<string> {
    let body = "";
    for await (const chunk of req) {
        body += chunk;
        if (body.length > 65_536) throw new IdentityFault("REQUEST_TOO_LARGE");
    }
    return body;
}

function localModelRequest(
    ownerId: string,
    message: string,
    requestId: string,
): J06ModelRequest {
    return {
        version: 1,
        requestId,
        ownerId,
        projectId: "jarvis",
        messages: [{ role: "user", content: message }],
        requiredCapabilities: ["text"],
        processingTarget: "LOCAL",
        dataPolicy: {
            version: 1,
            classification: "D2",
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
            packageId: `j1.11:${requestId}`,
            classification: "D2",
            privacy: "local-only",
            externalAI: false,
            minimized: true,
            containsSecretMaterial: false,
        },
        inputTokenEstimate: Math.min(2_000, Math.ceil(message.length / 4)),
        maxOutputTokens: 200,
        maxTotalTokens: 2_500,
        maxCost: 0,
        timeoutMs: 5_000,
        responseFormat: "text",
        contractId: null,
    };
}

export function conversationHandler(
    engine: IdentityEngine,
    serviceKey: Buffer,
) {
    return async (
        req: IncomingMessage,
        res: ServerResponse,
    ): Promise<boolean> => {
        if (req.url !== "/v1/conversation/rpc") return false;
        if (
            req.method !== "POST" ||
            req.headers["content-type"] !== "application/json"
        ) {
            res.writeHead(405);
            res.end('{"error":"METHOD_NOT_ALLOWED"}');
            return true;
        }
        try {
            const body = await readBody(req);
            const header = req.headers["x-jarvis-service-proof"];
            if (typeof header !== "string" || header.length > 2_048)
                throw new IdentityFault("SERVICE_AUTH_REQUIRED");
            const service = JSON.parse(
                Buffer.from(header, "base64url").toString("utf8"),
            ) as ServiceProof;
            await engine.acceptService(
                serviceKey,
                service,
                "conversation.rpc",
                body,
            );
            const rpc = RpcSchema.parse(JSON.parse(body));
            const digest = bindingDigest(rpc.request);
            if (rpc.phase === "begin") {
                const challenge = await engine.beginAction(
                    rpc.token,
                    "identity.inspect",
                    { requestBindingDigest: digest },
                    rpc.contextHash,
                );
                res.writeHead(200);
                res.end(JSON.stringify({ result: { ...challenge, bindingDigest: digest } }));
                return true;
            }

            const inspected = IdentitySnapshotSchema.parse(
                await engine.perform(
                    { token: rpc.token, ...rpc.proof },
                    "identity.inspect",
                    { requestBindingDigest: digest },
                    rpc.contextHash,
                ),
            );
            const current = inspected.sessions.find(
                (session) => session.id === inspected.currentSession.id,
            );
            if (
                !current ||
                current.revoked ||
                current.risk !== "normal" ||
                current.assurance !== "A2" ||
                current.ownerId !== inspected.owner.id ||
                current.deviceId !== inspected.currentSession.deviceId
            )
                throw new IdentityFault("SESSION_INVALID");

            const conversationId = rpc.request.conversationId ?? randomUUID();
            const turnId = randomUUID();
            const authority = {
                ownerId: inspected.owner.id,
                projectId: "jarvis",
                conversationId,
                sessionId: current.id,
                turnId,
                securityEpoch: current.epoch,
                operatingMode: "assistant" as const,
            };
            let authorityLive = true;
            const assembler = new ContextAssembler({
                verify: () => authorityLive,
            });
            const registry = new ModelProviderRegistry();
            registry.register(
                new SyntheticModelAdapter(descriptor, {
                    responseText: `JARVIS development response: ${rpc.request.message}`,
                }),
            );
            const orchestrator = new J13ModelOrchestrator(
                new ModelRouter(registry),
                { verify: () => authorityLive },
                { create: () => `j1.11:${randomUUID()}` },
                { now: Date.now },
            );
            const pipeline = new J14TurnPipeline(
                {
                    verify: () => ({
                        valid: authorityLive,
                        reason: authorityLive ? "OK" : "REVOKED",
                    }),
                },
                assembler,
                orchestrator,
                { now: Date.now },
            );
            const inputDigest = createHash("sha256")
                .update(rpc.request.message)
                .digest("hex");
            const contextDigest = createHash("sha256")
                .update(`context:${inputDigest}`)
                .digest("hex");
            const modelOperationDigest = createHash("sha256")
                .update(`model:${inputDigest}`)
                .digest("hex");
            const result = await pipeline.execute(
                {
                    authority,
                    conversationId,
                    sessionId: current.id,
                    turnId,
                    correlationId: `j1.11:${randomUUID()}`,
                    idempotencyKey: `j1.11:${digest}`,
                    inputDigest,
                    contextDigest,
                    modelOperationDigest,
                    candidates: [
                        {
                            sourceType: "conversation",
                            sourceId: `input:${turnId}`,
                            ownerId: inspected.owner.id,
                            projectId: "jarvis",
                            provenance: "J1.11:authenticated-browser-turn",
                            classification: "D2",
                            freshness: Date.now(),
                            retention: "session",
                            retentionBoundary: current.id,
                            disclosureEligibility: true,
                            digest: inputDigest,
                            trust: "trusted",
                            priority: 100,
                            size: rpc.request.message.length,
                            payload: rpc.request.message,
                        },
                    ],
                    contextPolicy: {
                        disclosureTarget: "local",
                        classificationCeiling: "D2",
                        maximumSize: 20_000,
                        minimumFreshness: 0,
                        allowUntrusted: false,
                        now: 0,
                    },
                    modelRequest: localModelRequest(
                        inspected.owner.id,
                        rpc.request.message,
                        `j1.11:${turnId}`,
                    ),
                    modelPolicy: {
                        route: {
                            allowedProviderIds: ["synthetic-ui"],
                            deniedProviderIds: [],
                            preferredProviderIds: ["synthetic-ui"],
                            allowDegraded: false,
                            maxAttempts: 1,
                        },
                        operationTimeoutMs: 5_000,
                        operationAttemptLimit: 1,
                        operationMaxTokens: 2_500,
                        operationMaxCost: 0,
                        operationAllowUnknownCost: false,
                        circuitFailureThreshold: 2,
                        circuitResetMs: 1_000,
                    },
                },
                AbortSignal.timeout(6_000),
            );
            authorityLive = false;
            res.writeHead(200);
            res.end(
                JSON.stringify({
                    result: {
                        conversationId,
                        turnId,
                        response: result.response,
                        state: result.state,
                        events: result.events,
                        mode: "assistant",
                        securityEpoch: current.epoch,
                        privacy: {
                            classification: "D2",
                            processing: "LOCAL",
                            externalAI: false,
                            stored: false,
                        },
                        source: {
                            provider: "synthetic-ui",
                            provenance: "J1.11:authenticated-browser-turn",
                        },
                        approval: null,
                        tool: null,
                    },
                }),
            );
        } catch (error) {
            const code =
                error instanceof IdentityFault
                    ? error.code
                    : error instanceof z.ZodError
                      ? "CONVERSATION_INPUT_INVALID"
                      : "CONVERSATION_UNAVAILABLE";
            res.writeHead(code === "CONVERSATION_UNAVAILABLE" ? 503 : 403);
            res.end(JSON.stringify({ error: code }));
        }
        return true;
    };
}
