import {
    J06ModelRequestSchema,
    J06ModelResultSchema,
    ModelDescriptorSchema,
    type J06ModelRequest,
    type J06ModelResult,
    type ModelDescriptor,
} from "./j06-contracts.js";
import type { J06ModelAdapter } from "./router.js";

export interface ReferenceModelTransport {
    invoke(
        descriptor: ModelDescriptor,
        request: J06ModelRequest,
        signal: AbortSignal,
    ): Promise<J06ModelResult>;
}

export class ReferenceModelAdapter implements J06ModelAdapter {
    private readonly model: ModelDescriptor;

    constructor(
        descriptor: ModelDescriptor,
        private readonly transport: ReferenceModelTransport,
    ) {
        this.model = ModelDescriptorSchema.parse(descriptor);
    }

    descriptor(): ModelDescriptor {
        return ModelDescriptorSchema.parse(this.model);
    }

    async generate(
        requestInput: J06ModelRequest,
        signal: AbortSignal,
    ): Promise<J06ModelResult> {
        const request = J06ModelRequestSchema.parse(requestInput);
        if (signal.aborted) throw new Error("MODEL_CANCELLED");
        return J06ModelResultSchema.parse(
            await this.transport.invoke(this.model, request, signal),
        );
    }
}
