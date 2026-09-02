import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
    IdentityEngine,
    IdentityFault,
    type ServiceProof,
} from "@jarvis/identity";
import { GovernedToolGateway } from "@jarvis/tools";
import { BoundaryError } from "@jarvis/shared";
import { randomBytes, randomUUID } from "node:crypto";
const RequestSchema = z.strictObject({
    method: z.string().max(40),
    params: z.record(z.string(), z.json()),
    contextHash: z.string().regex(/^[a-f0-9]{64}$/),
});
const proofSchema = z.strictObject({
    challengeId: z.string().max(128),
    signature: z.string().max(256),
});
const text = z.string().max(20000);
export function identityHandler(
    engine: IdentityEngine,
    serviceKey: Buffer,
    gateway: GovernedToolGateway,
) {
    return async (
        req: IncomingMessage,
        res: ServerResponse,
    ): Promise<boolean> => {
        if (req.url !== "/v1/identity/rpc") return false;
        if (
            req.method !== "POST" ||
            req.headers["content-type"] !== "application/json"
        ) {
            res.writeHead(405);
            res.end('{"error":"METHOD_NOT_ALLOWED"}');
            return true;
        }
        try {
            let body = "";
            for await (const chunk of req) {
                body += chunk;
                if (body.length > 65536)
                    throw new IdentityFault("REQUEST_TOO_LARGE");
            }
            const header = req.headers["x-jarvis-service-proof"];
            if (typeof header !== "string" || header.length > 2048)
                throw new IdentityFault("SERVICE_AUTH_REQUIRED");
            const service = JSON.parse(
                Buffer.from(header, "base64url").toString("utf8"),
            ) as ServiceProof;
            await engine.acceptService(
                serviceKey,
                service,
                "identity.rpc",
                body,
            );
            const {
                method,
                params: p,
                contextHash,
            } = RequestSchema.parse(JSON.parse(body));
            let result: unknown;
            switch (method) {
                case "security.subject.begin":
                    result = await engine.beginSecuritySubject(
                        text.parse(p.subjectId),
                        p.input,
                    );
                    break;
                case "security.subject.perform":
                    result = await engine.performSecuritySubject(
                        text.parse(p.subjectId),
                        proofSchema.parse(p.proof),
                        p.input,
                    );
                    break;
                case "root.begin":
                    result = await engine.beginRoot(
                        text.parse(p.bootstrap),
                        text.parse(p.displayName),
                        p.device,
                    );
                    break;
                case "enroll.begin":
                    result = await engine.beginEnrollment(p.device);
                    break;
                case "register.finish":
                    result = await engine.finishRegistration(
                        z.enum(["root", "enroll", "recovery"]).parse(p.kind),
                        proofSchema.parse(p.proof),
                        p.response,
                        contextHash,
                    );
                    break;
                case "login.begin":
                    result = await engine.beginLogin(text.parse(p.deviceId));
                    break;
                case "login.finish":
                    result = await engine.finishLogin(
                        proofSchema.parse(p.proof),
                        p.response,
                        contextHash,
                    );
                    break;
                case "action.begin":
                    result = await engine.beginAction(
                        text.parse(p.token),
                        p.action,
                        p.input,
                        contextHash,
                    );
                    break;
                case "action.perform":
                    result = await engine.perform(
                        {
                            ...proofSchema.parse(p.proof),
                            token: text.parse(p.token),
                            ...(p.approvalId
                                ? { approvalId: text.parse(p.approvalId) }
                                : {}),
                        },
                        p.action,
                        p.input,
                        contextHash,
                    );
                    break;
                case "stepup.begin":
                    result = await engine.beginStepUp(
                        text.parse(p.token),
                        p.action,
                        p.input,
                        contextHash,
                    );
                    break;
                case "stepup.finish":
                    result = await engine.finishStepUp(
                        text.parse(p.token),
                        proofSchema.parse(p.proof),
                        p.response,
                        contextHash,
                    );
                    break;
                case "recovery.begin":
                    result = await engine.beginRecovery(
                        text.parse(p.package),
                        text.parse(p.recoveryKey),
                        text.parse(p.ownerId),
                        p.device,
                        typeof p.bootstrap === "string" ? p.bootstrap : "",
                    );
                    break;
                case "delegated.begin":
                    result = await engine.beginDelegated(
                        text.parse(p.capability),
                        text.parse(p.scope),
                        text.parse(p.resource),
                    );
                    break;
                case "delegated.perform": {
                    const scope = text.parse(p.scope),
                        resource = text.parse(p.resource);
                    result = await engine.performDelegated(
                        text.parse(p.capability),
                        proofSchema.parse(p.proof),
                        scope,
                        resource,
                        async (subject, authority) => {
                            // This composition root constructs context only after cryptographic
                            // capability verification. No HTTP actor/context object is accepted.
                            return gateway
                                .invoke(
                                    "mock.repository.read",
                                    resource,
                                    {
                                        version: 2,
                                        actor: {
                                            version: 1,
                                            id: subject.id,
                                            kind: subject.kind,
                                            ownerId: subject.ownerId,
                                            environment: "development",
                                        },
                                        environment: "development",
                                        requestId: randomUUID(),
                                        authority,
                                        trace: {
                                            traceId:
                                                randomBytes(16).toString("hex"),
                                            spanId: randomBytes(8).toString(
                                                "hex",
                                            ),
                                        },
                                    },
                                    new AbortController().signal,
                                )
                                .catch((error: unknown) => {
                                    if (error instanceof BoundaryError)
                                        throw new IdentityFault(error.code);
                                    throw error;
                                });
                        },
                    );
                    break;
                }
                default:
                    throw new IdentityFault("IDENTITY_METHOD_DENIED");
            }
            res.writeHead(200);
            res.end(JSON.stringify({ result }));
        } catch (error) {
            const code =
                error instanceof IdentityFault
                    ? error.code
                    : error instanceof z.ZodError
                      ? "IDENTITY_INPUT_INVALID"
                      : "IDENTITY_UNAVAILABLE";
            res.writeHead(code === "IDENTITY_UNAVAILABLE" ? 503 : 403);
            res.end(JSON.stringify({ error: code }));
        }
        return true;
    };
}
