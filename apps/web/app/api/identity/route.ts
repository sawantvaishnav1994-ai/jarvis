import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { loadConfig, requireDevelopment } from "@jarvis/config";
import { FileSecretManager } from "@jarvis/security";
import { signService } from "@jarvis/identity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ownerMethods = new Set([
    "action.begin",
    "action.perform",
    "stepup.begin",
    "stepup.finish",
]);
export async function POST(request: Request) {
    let stage = "config";
    try {
        const configPath = resolve(
            process.env.JARVIS_CONFIG ?? resolve(process.cwd(), "config/development.json"),
        );
        const root = resolve(configPath, "../..");
        const config = await loadConfig(configPath);
        requireDevelopment(config);
        stage = "request";
        if (
            request.headers.get("origin") !== config.identity.origin ||
            request.headers.get("content-type") !== "application/json"
        )
            return NextResponse.json(
                { error: "ORIGIN_DENIED" },
                { status: 403 },
            );
        if (Number(request.headers.get("content-length") ?? 0) > 65536)
            return NextResponse.json(
                { error: "REQUEST_TOO_LARGE" },
                { status: 413 },
            );
        const reader = request.body?.getReader();
        let raw = "";
        const decoder = new TextDecoder();
        if (!reader) throw new Error("Missing body");
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            raw += decoder.decode(value, { stream: true });
            if (raw.length > 65536) {
                await reader.cancel();
                return NextResponse.json(
                    { error: "REQUEST_TOO_LARGE" },
                    { status: 413 },
                );
            }
        }
        const input = JSON.parse(raw);
        if (
            !input ||
            typeof input.method !== "string" ||
            !input.params ||
            typeof input.params !== "object" ||
            Array.isArray(input.params)
        )
            throw new Error("Invalid input");
        delete input.params.token;
        delete input.contextHash;
        if (ownerMethods.has(input.method))
            input.params.token =
                (await cookies()).get("jarvis_session")?.value ?? "";
        const contextHash = createHash("sha256")
            .update(
                config.identity.origin +
                    ":" +
                    (request.headers.get("user-agent") ?? "").slice(0, 512),
            )
            .digest("hex");
        const body = JSON.stringify({
            method: input.method,
            params: input.params,
            contextHash,
        });
        const actor = {
            version: 1 as const,
            id: "jarvis-web",
            kind: "service" as const,
            environment: config.environment,
        };
        stage = "vault";
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
        const lease = await vault.lease(config.identity.webTransportRef, actor),
            key = Buffer.from(lease.value.toString("utf8"), "hex");
        stage = "sign";
        const proof = signService(key, "service_web", "identity.rpc", body);
        lease.destroy();
        key.fill(0);
        stage = "upstream";
        const response = await fetch(
            `http://${config.api.host}:${config.api.port}/v1/identity/rpc`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-jarvis-service-proof": Buffer.from(
                        JSON.stringify(proof),
                    ).toString("base64url"),
                },
                body,
                cache: "no-store",
                signal: AbortSignal.timeout(10000),
            },
        );
        stage = "response";
        const data = await response.json();
        let token: string | undefined;
        if (
            ["register.finish", "login.finish"].includes(input.method) &&
            typeof data.result?.token === "string"
        ) {
            token = data.result.token;
            delete data.result.token;
        }
        const result = NextResponse.json(data, {
            status: response.status,
            headers: {
                "cache-control": "no-store",
                "x-content-type-options": "nosniff",
            },
        });
        if (token)
            result.cookies.set("jarvis_session", token, {
                httpOnly: true,
                secure: true,
                sameSite: "strict",
                path: "/api/identity",
                maxAge: 900,
            });
        return result;
    } catch (error) {
        console.error(
            JSON.stringify({
                service: "web-identity",
                event: "identity.proxy.failed",
                stage,
                errorType: error instanceof Error ? error.name : "UnknownError",
            }),
        );
        return NextResponse.json(
            { error: "IDENTITY_UNAVAILABLE" },
            { status: 503, headers: { "cache-control": "no-store" } },
        );
    }
}
