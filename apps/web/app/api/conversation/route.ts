import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
    loadConfig,
    requireDevelopment,
    runtimeIdentity,
} from "@jarvis/config";
import { FileSecretManager } from "@jarvis/security";
import { signService } from "@jarvis/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BrowserRequest = {
    phase?: unknown;
    request?: unknown;
    proof?: unknown;
};

function normalize(input: BrowserRequest) {
    if (!input || (input.phase !== "begin" && input.phase !== "turn"))
        throw new Error("Invalid phase");
    if (
        !input.request ||
        typeof input.request !== "object" ||
        Array.isArray(input.request)
    )
        throw new Error("Invalid request");
    const request = input.request as Record<string, unknown>;
    if (
        typeof request.message !== "string" ||
        request.message.trim().length < 1 ||
        request.message.length > 20_000
    )
        throw new Error("Invalid message");
    const conversationId =
        request.conversationId === null || request.conversationId === undefined
            ? null
            : typeof request.conversationId === "string"
              ? request.conversationId
              : (() => {
                    throw new Error("Invalid conversation");
                })();
    const conversationSessionId =
        request.conversationSessionId === null ||
        request.conversationSessionId === undefined
            ? null
            : typeof request.conversationSessionId === "string"
              ? request.conversationSessionId
              : (() => {
                    throw new Error("Invalid conversation session");
                })();
    const normalizedRequest = {
        message: request.message.trim(),
        conversationId,
        conversationSessionId,
    };
    if (input.phase === "begin")
        return { phase: "begin" as const, request: normalizedRequest };
    if (
        !input.proof ||
        typeof input.proof !== "object" ||
        Array.isArray(input.proof)
    )
        throw new Error("Invalid proof");
    const proof = input.proof as Record<string, unknown>;
    if (
        typeof proof.challengeId !== "string" ||
        typeof proof.signature !== "string" ||
        proof.challengeId.length > 128 ||
        proof.signature.length > 256
    )
        throw new Error("Invalid proof");
    return {
        phase: "turn" as const,
        request: normalizedRequest,
        proof: {
            challengeId: proof.challengeId,
            signature: proof.signature,
        },
    };
}

export async function POST(request: Request) {
    try {
        const root = resolve(process.cwd(), "../..");
        const config = await loadConfig(
            process.env.JARVIS_CONFIG ??
                resolve(root, "config/development.json"),
        );
        requireDevelopment(config);
        const identity = runtimeIdentity(config);
        if (
            request.headers.get("origin") !== identity.origin ||
            request.headers.get("content-type") !== "application/json"
        )
            return NextResponse.json(
                { error: "ORIGIN_DENIED" },
                { status: 403 },
            );
        if (Number(request.headers.get("content-length") ?? 0) > 65_536)
            return NextResponse.json(
                { error: "REQUEST_TOO_LARGE" },
                { status: 413 },
            );

        const raw = await request.text();
        if (raw.length > 65_536)
            return NextResponse.json(
                { error: "REQUEST_TOO_LARGE" },
                { status: 413 },
            );
        const normalized = normalize(JSON.parse(raw) as BrowserRequest);
        const token = (await cookies()).get("jarvis_session")?.value ?? "";
        const contextHash = createHash("sha256")
            .update(
                identity.origin +
                    ":" +
                    (request.headers.get("user-agent") ?? "").slice(0, 512),
            )
            .digest("hex");
        const body = JSON.stringify({ ...normalized, token, contextHash });
        const actor = {
            version: 1 as const,
            id: "jarvis-web",
            kind: "service" as const,
            environment: config.environment,
        };
        const vault = new FileSecretManager(
            process.env.JARVIS_VAULT_FILE ??
                resolve(root, ".jarvis/development/vault.json"),
            process.env.JARVIS_MASTER_KEY_FILE ??
                resolve(
                    homedir(),
                    ".config/jarvis/typescript/development/master.key",
                ),
            config.environment,
            actor.id,
            new Set([config.identity.webTransportRef]),
        );
        const lease = await vault.lease(config.identity.webTransportRef, actor);
        const key = Buffer.from(lease.value.toString("utf8"), "hex");
        const serviceProof = signService(
            key,
            "service_web",
            "conversation.rpc",
            body,
        );
        lease.destroy();
        key.fill(0);

        const response = await fetch(
            `http://${config.api.host}:${config.api.port}/v1/conversation/rpc`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-jarvis-service-proof": Buffer.from(
                        JSON.stringify(serviceProof),
                    ).toString("base64url"),
                },
                body,
                cache: "no-store",
                signal: AbortSignal.timeout(10_000),
            },
        );
        const data = await response.json();
        return NextResponse.json(data, {
            status: response.status,
            headers: {
                "cache-control": "no-store",
                "x-content-type-options": "nosniff",
            },
        });
    } catch {
        return NextResponse.json(
            { error: "CONVERSATION_UNAVAILABLE" },
            { status: 503, headers: { "cache-control": "no-store" } },
        );
    }
}
