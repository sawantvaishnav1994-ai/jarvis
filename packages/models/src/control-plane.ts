import {
    ProviderHealthSchema,
    type ModelDescriptor,
    type ProviderHealth,
} from "./j06-contracts.js";
import { ModelProviderRegistry, ModelRoutingError } from "./router.js";

export type SafeModelDescriptor = Omit<ModelDescriptor, "credentialRef"> & {
    credentialConfigured: boolean;
};

export class OwnerControlledModelRegistry extends ModelProviderRegistry {
    private readonly healthOverrides = new Map<string, ProviderHealth>();

    setHealth(providerId: string, modelId: string, healthInput: ProviderHealth): void {
        const health = ProviderHealthSchema.parse(healthInput);
        const found = super.list().some(
            (descriptor) => descriptor.providerId === providerId && descriptor.modelId === modelId,
        );
        if (!found) throw new ModelRoutingError("MODEL_NOT_FOUND", "Cannot control an unknown model");
        this.healthOverrides.set(`${providerId}\u0000${modelId}`, health);
    }

    override list(): ModelDescriptor[] {
        return super.list().map((descriptor) => ({
            ...descriptor,
            health:
                this.healthOverrides.get(`${descriptor.providerId}\u0000${descriptor.modelId}`) ??
                descriptor.health,
        }));
    }

    inspect(): SafeModelDescriptor[] {
        return this.list().map(({ credentialRef, ...descriptor }) => ({
            ...descriptor,
            credentialConfigured: credentialRef !== null,
        }));
    }
}
