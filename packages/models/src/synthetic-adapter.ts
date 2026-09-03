import {
    J06ModelRequestSchema,
    ModelDescriptorSchema,
    type J06ModelRequest,
    type J06ModelResult,
    type ModelDescriptor,
} from "./j06-contracts.js";
import { ModelProviderFailure, type J06ModelAdapter } from "./router.js";

export type SyntheticBehavior = {
    failuresBeforeSuccess?: number;
    retryableFailure?: boolean;
    responseText?: string;
    structured?: unknown;
    usage?: Partial<J06ModelResult["usage"]>;
    delayMs?: number;
};

export class SyntheticModelAdapter implements J06ModelAdapter {
    private calls = 0;

    constructor(
        private readonly model: ModelDescriptor,
        private readonly behavior: SyntheticBehavior = {},
    ) {
        ModelDescriptorSchema.parse(model);
    }

    descriptor(): ModelDescriptor {
        return ModelDescriptorSchema.parse(this.model);
    }

    callCount(): number {
        return this.calls;
    }

    async generate(
        requestInput: J06ModelRequest,
        signal: AbortSignal,
    ): Promise<J06ModelResult> {
        const request = J06ModelRequestSchema.parse(requestInput);
        this.calls += 1;
        if (this.behavior.delayMs) {
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, this.behavior.delayMs);
                const abort = () => {
                    clearTimeout(timer);
                    reject(new ModelProviderFailure("SYNTHETIC_ABORTED", false));
                };
                if (signal.aborted) return abort();
                signal.addEventListener("abort", abort, { once: true });
            });
        }
        if (signal.aborted) throw new ModelProviderFailure("SYNTHETIC_ABORTED", false);
        if (this.calls <= (this.behavior.failuresBeforeSuccess ?? 0)) {
            throw new ModelProviderFailure(
                "SYNTHETIC_FAILURE",
                this.behavior.retryableFailure ?? true,
            );
        }
        const inputTokens = this.behavior.usage?.inputTokens ?? request.inputTokenEstimate;
        const outputTokens = this.behavior.usage?.outputTokens ?? Math.min(8, request.maxOutputTokens);
        const totalTokens = this.behavior.usage?.totalTokens ?? inputTokens + outputTokens;
        const cost = this.behavior.usage?.cost ?? 0;
        return {
            version: 1,
            requestId: request.requestId,
            providerId: this.model.providerId,
            modelId: this.model.modelId,
            text: this.behavior.responseText ?? `${this.model.providerId}:${request.messages.at(-1)!.content}`,
            structured: this.behavior.structured ?? null,
            usage: { inputTokens, outputTokens, totalTokens, cost },
            finishReason: "stop",
            verified: false,
        };
    }

    async *stream(
        requestInput: J06ModelRequest,
        signal: AbortSignal,
    ): AsyncIterable<{ sequence: number; text: string; done: boolean }> {
        const request = J06ModelRequestSchema.parse(requestInput);
        const text = this.behavior.responseText ?? `${this.model.providerId}:${request.messages.at(-1)!.content}`;
        const parts = text.split(" ");
        for (let index = 0; index < parts.length; index += 1) {
            if (signal.aborted) throw new ModelProviderFailure("SYNTHETIC_ABORTED", false);
            yield {
                sequence: index,
                text: `${parts[index]}${index === parts.length - 1 ? "" : " "}`,
                done: index === parts.length - 1,
            };
        }
    }
}
