import { z } from "zod";
import {
    BoundaryError,
    ContractVersionSchema,
    PrivacySchema,
} from "@jarvis/shared";

export * from "./j06-contracts.js";
export * from "./router.js";
export * from "./synthetic-adapter.js";

export const ModelRequestSchema = z.strictObject({
    version: ContractVersionSchema,
    messages: z
        .array(
            z.strictObject({
                role: z.enum(["system", "user", "assistant"]),
                content: z.string().max(10000),
            }),
        )
        .min(1)
        .max(64),
    capabilities: z
        .array(z.enum(["text", "reasoning", "vision", "tools"]))
        .max(4),
    privacyLevel: PrivacySchema,
    maxCost: z.number().finite().nonnegative().max(100),
    timeoutMs: z.number().int().min(1).max(300000),
});
export type ModelRequest = z.infer<typeof ModelRequestSchema>;
export const ModelReplySchema = z.strictObject({
    version: ContractVersionSchema,
    provider: z.string().min(1).max(100),
    text: z.string().max(50000),
    cost: z.number().finite().nonnegative(),
});
export type ModelReply = z.infer<typeof ModelReplySchema>;
export interface ModelProvider {
    readonly id: string;
    readonly local: boolean;
    generate(request: ModelRequest, signal: AbortSignal): Promise<ModelReply>;
}
export class MockModel implements ModelProvider {
    readonly local = true;
    constructor(readonly id = "mock-a") {}
    async generate(
        request: ModelRequest,
        signal: AbortSignal,
    ): Promise<ModelReply> {
        ModelRequestSchema.parse(request);
        if (signal.aborted) throw new BoundaryError("MODEL_CANCELLED");
        return {
            version: 1,
            provider: this.id,
            text: this.id + ": " + request.messages.at(-1)!.content,
            cost: 0,
        };
    }
}
