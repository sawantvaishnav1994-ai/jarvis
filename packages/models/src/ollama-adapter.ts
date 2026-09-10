import { request as httpRequest } from "node:http";
import { z } from "zod";
import {
    J06ModelRequestSchema,
    J06ModelResultSchema,
    type J06ModelRequest,
    type J06ModelResult,
    type ModelDescriptor,
} from "./j06-contracts.js";
import { ModelProviderFailure, type J06ModelAdapter } from "./router.js";

export const LocalOllamaConfigSchema = z.strictObject({
    model: z
        .string()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*:[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
        .max(200),
    port: z.number().int().min(1024).max(65535).default(11434),
    timeoutMs: z.number().int().min(1000).max(120000).default(60000),
});
export type LocalOllamaConfig = z.infer<typeof LocalOllamaConfigSchema>;
const ReplySchema = z.object({
    remote_host: z.literal("").optional(),
    remote_model: z.literal("").optional(),
    model: z.string(),
    done: z.literal(true),
    done_reason: z.enum(["stop", "length"]),
    message: z.object({
        role: z.literal("assistant"),
        content: z.string().min(1).max(100000),
        tool_calls: z.array(z.unknown()).max(0).optional(),
    }),
    prompt_eval_count: z.number().int().nonnegative(),
    eval_count: z.number().int().nonnegative(),
});
const failure = (code: string, retryable = false) =>
    new ModelProviderFailure(code, retryable);

/** Read-only local inference. No DNS, proxies, redirects, credentials or tool calls. */
export class LocalOllamaAdapter implements J06ModelAdapter {
    private readonly config: LocalOllamaConfig;
    constructor(config: LocalOllamaConfig) {
        this.config = LocalOllamaConfigSchema.parse(config);
    }
    descriptor(): ModelDescriptor {
        return {
            version: 1,
            providerId: "local-ollama",
            modelId: this.config.model,
            locality: "LOCAL",
            capabilities: ["text"],
            contextWindowTokens: 4000,
            maxOutputTokens: 500,
            inputCostPerMillion: 0,
            outputCostPerMillion: 0,
            pricingKnown: true,
            health: "HEALTHY",
            credentialRef: null,
        };
    }
    async generate(
        input: J06ModelRequest,
        parentSignal: AbortSignal,
    ): Promise<J06ModelResult> {
        const request = J06ModelRequestSchema.parse(input);
        if (parentSignal.aborted) throw failure("LOCAL_MODEL_CANCELLED");
        if (
            request.processingTarget !== "LOCAL" ||
            request.context.containsSecretMaterial ||
            request.context.classification === "D5" ||
            request.dataPolicy.classification === "D5" ||
            request.responseFormat !== "text" ||
            request.requiredCapabilities.some((c) => c !== "text")
        )
            throw failure("LOCAL_MODEL_BOUNDARY_DENIED");
        if (
            request.maxOutputTokens > 500 ||
            request.maxTotalTokens > 4000 ||
            request.inputTokenEstimate + request.maxOutputTokens >
                request.maxTotalTokens
        )
            throw failure("LOCAL_MODEL_BUDGET_INVALID");
        const signal = AbortSignal.any([
            parentSignal,
            AbortSignal.timeout(
                Math.min(request.timeoutMs, this.config.timeoutMs),
            ),
        ]);
        const body = JSON.stringify({
            model: this.config.model,
            messages: request.messages,
            stream: false,
            keep_alive: "1m",
            options: { num_predict: request.maxOutputTokens, num_ctx: 4000 },
        });
        let raw: unknown;
        try {
            const metadata = z
                .object({
                    remote_host: z.literal("").optional(),
                    remote_model: z.literal("").optional(),
                    details: z.object({ format: z.literal("gguf") }),
                    model_info: z
                        .record(z.string(), z.unknown())
                        .refine((info) => Object.keys(info).length > 0),
                })
                .safeParse(
                    await this.invoke(
                        JSON.stringify({ model: this.config.model }),
                        "/api/show",
                        signal,
                    ),
                );
            if (!metadata.success)
                throw failure("LOCAL_MODEL_LOCALITY_UNVERIFIED");
            raw = await this.invoke(body, "/api/chat", signal);
        } catch (error) {
            if (parentSignal.aborted) throw failure("LOCAL_MODEL_CANCELLED");
            if (signal.aborted) throw failure("LOCAL_MODEL_TIMEOUT");
            if (error instanceof ModelProviderFailure) throw error;
            throw failure("LOCAL_MODEL_UNAVAILABLE", true);
        }
        const parsed = ReplySchema.safeParse(raw);
        if (!parsed.success || parsed.data.model !== this.config.model)
            throw failure("LOCAL_MODEL_REPLY_INVALID");
        const reply = parsed.data;
        if (
            reply.eval_count > request.maxOutputTokens ||
            reply.prompt_eval_count + reply.eval_count > request.maxTotalTokens
        )
            throw failure("LOCAL_MODEL_BUDGET_EXCEEDED");
        return J06ModelResultSchema.parse({
            version: 1,
            requestId: request.requestId,
            providerId: "local-ollama",
            modelId: this.config.model,
            text: reply.message.content,
            structured: null,
            usage: {
                inputTokens: reply.prompt_eval_count,
                outputTokens: reply.eval_count,
                totalTokens: reply.prompt_eval_count + reply.eval_count,
                cost: 0,
            },
            finishReason: reply.done_reason,
            verified: false,
        });
    }
    private invoke(
        body: string,
        path: "/api/show" | "/api/chat",
        signal: AbortSignal,
    ): Promise<unknown> {
        return new Promise<unknown>((resolve, reject) => {
            const req = httpRequest(
                {
                    hostname: "127.0.0.1",
                    port: this.config.port,
                    path,
                    method: "POST",
                    signal,
                    agent: false,
                    headers: {
                        "content-type": "application/json",
                        "content-length": Buffer.byteLength(body),
                    },
                },
                (res) => {
                    if (res.statusCode !== 200) {
                        res.destroy();
                        reject(
                            failure(
                                "LOCAL_MODEL_HTTP_FAILURE",
                                res.statusCode === 503,
                            ),
                        );
                        return;
                    }
                    let length = 0;
                    const chunks: Buffer[] = [];
                    res.on("data", (chunk: Buffer) => {
                        length += chunk.length;
                        if (length > 524288) {
                            res.destroy(failure("LOCAL_MODEL_REPLY_TOO_LARGE"));
                            return;
                        }
                        chunks.push(chunk);
                    });
                    res.on("error", reject);
                    res.on("end", () => {
                        try {
                            resolve(
                                JSON.parse(
                                    Buffer.concat(chunks).toString("utf8"),
                                ),
                            );
                        } catch {
                            reject(failure("LOCAL_MODEL_REPLY_INVALID"));
                        }
                    });
                },
            );
            req.on("error", reject);
            req.end(body);
        });
    }
}
