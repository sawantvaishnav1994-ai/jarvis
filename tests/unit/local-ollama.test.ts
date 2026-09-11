import { afterEach, describe, expect, it } from "vitest";
import {
    createServer,
    type Server,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";
import { LocalOllamaAdapter, J06ModelRequestSchema } from "@jarvis/models";
import { dataPolicy } from "../fixtures/data.js";
const servers: Server[] = [];
afterEach(async () => {
    await Promise.all(
        servers.splice(0).map(
            (s) =>
                new Promise<void>((resolve) => {
                    s.closeAllConnections();
                    s.close(() => resolve());
                }),
        ),
    );
});
const request = () =>
    J06ModelRequestSchema.parse({
        version: 1,
        requestId: "req",
        ownerId: "owner",
        projectId: "jarvis",
        messages: [{ role: "user", content: "hello" }],
        requiredCapabilities: ["text"],
        processingTarget: "LOCAL",
        dataPolicy: dataPolicy(),
        context: {
            packageId: "ctx",
            classification: "D2",
            privacy: "local-only",
            externalAI: false,
            minimized: true,
            containsSecretMaterial: false,
        },
        inputTokenEstimate: 10,
        maxOutputTokens: 100,
        maxTotalTokens: 500,
        maxCost: 0,
        timeoutMs: 1000,
        responseFormat: "text",
        contractId: null,
    });
const reply = {
    model: "test:local",
    done: true,
    done_reason: "stop",
    message: { role: "assistant", content: "hello back" },
    prompt_eval_count: 10,
    eval_count: 3,
};
async function server(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
    remote = false,
) {
    const calls: string[] = [];
    const s = createServer((req, res) => {
        calls.push(req.url!);
        if (req.url === "/api/show") {
            res.end(
                JSON.stringify({
                    details: { format: "gguf" },
                    model_info: { architecture: "test" },
                    ...(remote
                        ? { remote_host: "https://example.invalid" }
                        : {}),
                }),
            );
        } else handler(req, res);
    });
    servers.push(s);
    await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
    const addr = s.address();
    if (!addr || typeof addr === "string") throw Error("No test listener");
    return {
        adapter: new LocalOllamaAdapter({
            model: "test:local",
            port: addr.port,
            timeoutMs: 1000,
        }),
        calls,
    };
}
describe("local model boundary", () => {
    it("preflights locality and sends only normalized messages to loopback", async () => {
        let sent: Record<string, unknown> = {};
        const { adapter, calls } = await server((req, res) => {
            let body = "";
            req.on("data", (c) => (body += c));
            req.on("end", () => {
                sent = JSON.parse(body);
                res.end(JSON.stringify(reply));
            });
        });
        const result = await adapter.generate(
            request(),
            new AbortController().signal,
        );
        expect(result.text).toBe("hello back");
        expect(result.verified).toBe(false);
        expect(result.usage.totalTokens).toBe(13);
        expect(calls).toEqual(["/api/show", "/api/chat"]);
        expect(sent).not.toHaveProperty("ownerId");
        expect(sent).not.toHaveProperty("context");
        expect(sent).not.toHaveProperty("tools");
    });
    it("rejects a remote-backed model before sending conversation content", async () => {
        const { adapter, calls } = await server(
            (_req, res) => res.end(JSON.stringify(reply)),
            true,
        );
        await expect(
            adapter.generate(request(), new AbortController().signal),
        ).rejects.toMatchObject({ code: "LOCAL_MODEL_LOCALITY_UNVERIFIED" });
        expect(calls).toEqual(["/api/show"]);
    });
    it("blocks D5 and nonlocal processing before opening a socket", async () => {
        const { adapter, calls } = await server((_req, res) =>
            res.end(JSON.stringify(reply)),
        );
        const req = request();
        req.context.classification = "D5";
        await expect(
            adapter.generate(req, new AbortController().signal),
        ).rejects.toMatchObject({ code: "LOCAL_MODEL_BOUNDARY_DENIED" });
        req.context.classification = "D2";
        req.processingTarget = "APPROVED_EXTERNAL";
        await expect(
            adapter.generate(req, new AbortController().signal),
        ).rejects.toMatchObject({ code: "LOCAL_MODEL_BOUNDARY_DENIED" });
        expect(calls).toEqual([]);
    });
    it.each([
        [
            "wrong model",
            { ...reply, model: "other:local" },
            "LOCAL_MODEL_REPLY_INVALID",
        ],
        [
            "over budget",
            { ...reply, eval_count: 101 },
            "LOCAL_MODEL_BUDGET_EXCEEDED",
        ],
        [
            "tool calls",
            { ...reply, message: { ...reply.message, tool_calls: [{}] } },
            "LOCAL_MODEL_REPLY_INVALID",
        ],
        [
            "cloud response",
            { ...reply, remote_host: "https://example.invalid" },
            "LOCAL_MODEL_REPLY_INVALID",
        ],
    ])("rejects %s", async (_name, value, code) => {
        const { adapter } = await server((_req, res) =>
            res.end(JSON.stringify(value)),
        );
        await expect(
            adapter.generate(request(), new AbortController().signal),
        ).rejects.toMatchObject({ code });
    });
    it("does not follow redirects", async () => {
        const { adapter } = await server((_req, res) => {
            res.writeHead(302, { location: "http://example.invalid" });
            res.end();
        });
        await expect(
            adapter.generate(request(), new AbortController().signal),
        ).rejects.toMatchObject({ code: "LOCAL_MODEL_HTTP_FAILURE" });
    });
    it("cancels in-flight work and bounds a stalled server", async () => {
        const { adapter } = await server(() => {});
        const abort = new AbortController();
        const p = adapter.generate(request(), abort.signal);
        abort.abort();
        await expect(p).rejects.toMatchObject({
            code: "LOCAL_MODEL_CANCELLED",
        });
        const req = request();
        req.timeoutMs = 20;
        await expect(
            adapter.generate(req, new AbortController().signal),
        ).rejects.toMatchObject({ code: "LOCAL_MODEL_TIMEOUT" });
    });
    it("bounds oversized response bodies", async () => {
        const { adapter } = await server((_req, res) =>
            res.end("x".repeat(600000)),
        );
        await expect(
            adapter.generate(request(), new AbortController().signal),
        ).rejects.toMatchObject({ code: "LOCAL_MODEL_REPLY_TOO_LARGE" });
    });
});
