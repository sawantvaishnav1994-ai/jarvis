import { it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { signService } from "@jarvis/identity";
import type {
    ConversationSession,
    ConversationSessionRepository,
} from "@jarvis/core";
import { conversationHandler } from "../../apps/api/src/conversation-http.js";
import { fixture, root, TestIdentityRepository } from "../fixtures/identity.js";
async function listen(server: Server) {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw Error("No listener");
    return addr.port;
}
async function close(server: Server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
}
it.each([
    { local: true, revoke: false },
    { local: true, revoke: true },
    { local: false, revoke: false },
    { local: false, revoke: true },
])(
    "authenticated HTTP turn local=$local revoked=$revoke",
    async ({ local, revoke }) => {
        const repository = new TestIdentityRepository();
        const f = fixture(repository);
        const owner = await root(f);
        const contextHash = "a".repeat(64);
        const session = Object.values(repository.state.sessions)[0]!;
        session.contextHash = contextHash;
        const key = randomBytes(32);
        let modelCalls = 0;
        const model = createServer((req, res) => {
            if (req.url === "/api/show") {
                res.end(
                    JSON.stringify({
                        details: { format: "gguf" },
                        model_info: { architecture: "test" },
                    }),
                );
                return;
            }
            modelCalls++;
            if (revoke)
                repository.state.sessions[session.tokenHash]!.revoked = true;
            res.end(
                JSON.stringify({
                    model: "test:local",
                    done: true,
                    done_reason: "stop",
                    message: {
                        role: "assistant",
                        content: "fixture local answer",
                    },
                    prompt_eval_count: 10,
                    eval_count: 3,
                }),
            );
        });
        const modelPort = await listen(model);
        const sessions = new Map<string, ConversationSession>();
        const sessionRepository: ConversationSessionRepository = {
            async createSession(s) {
                sessions.set(s.id, s);
                if (!local && revoke)
                    repository.state.sessions[session.tokenHash]!.revoked =
                        true;
                return s;
            },
            async getSession(ownerId, id) {
                const s = sessions.get(id);
                return s?.ownerId === ownerId ? s : null;
            },
            async updateSessionState() {
                throw Error("not used");
            },
            async createTurn() {
                throw Error("not used");
            },
            async getTurn() {
                return null;
            },
            async transitionTurn() {
                throw Error("not used");
            },
        };
        const handler = conversationHandler(
            f.engine,
            key,
            sessionRepository,
            local
                ? { model: "test:local", port: modelPort, timeoutMs: 1000 }
                : undefined,
        );
        const api = createServer((req, res) => {
            void handler(req, res).then((handled) => {
                if (!handled) {
                    res.writeHead(404);
                    res.end();
                }
            });
        });
        const apiPort = await listen(api);
        const request = {
            message: "hello",
            conversationId: null,
            conversationSessionId: null,
        };
        async function rpc(payload: object) {
            const body = JSON.stringify({
                ...payload,
                token: owner.session.token,
                contextHash,
            });
            const proof = signService(
                key,
                "service_web",
                "conversation.rpc",
                body,
            );
            const response = await fetch(
                `http://127.0.0.1:${apiPort}/v1/conversation/rpc`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-jarvis-service-proof": Buffer.from(
                            JSON.stringify(proof),
                        ).toString("base64url"),
                    },
                    body,
                },
            );
            return { status: response.status, data: await response.json() };
        }
        try {
            const begin = await rpc({ phase: "begin", request });
            expect(begin.status).toBe(200);
            const result = await rpc({
                phase: "turn",
                request,
                proof: owner.device.proof(begin.data.result),
            });
            expect(modelCalls).toBe(local ? 1 : 0);
            if (revoke) {
                expect(result.status).toBe(403);
                expect(result.data.error).toBe("SESSION_INVALID");
                expect(JSON.stringify(result.data)).not.toContain(
                    "fixture local answer",
                );
                expect(JSON.stringify(result.data)).not.toContain(
                    "JARVIS development response",
                );
            } else {
                expect(result.status).toBe(200);
                expect(result.data.result.response).toBe(
                    local
                        ? "fixture local answer"
                        : "JARVIS development response: hello",
                );
                expect(result.data.result.source.provider).toBe(
                    local ? "local-ollama" : "synthetic-ui",
                );
                expect(result.data.result.tool).toBeNull();
            }
        } finally {
            await close(api);
            await close(model);
            key.fill(0);
        }
    },
);
