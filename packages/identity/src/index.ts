import { z } from "zod";
import {
    ContractVersionSchema,
    EnvironmentSchema,
    IdentifierSchema,
} from "@jarvis/shared";
export const ActorKindSchema = z.enum([
    "owner",
    "human",
    "device",
    "core",
    "agent",
    "service",
    "tool",
    "integration",
]);
export const ActorSchema = z.strictObject({
    version: ContractVersionSchema,
    id: IdentifierSchema,
    kind: ActorKindSchema,
    environment: EnvironmentSchema,
    ownerId: IdentifierSchema.optional(),
});
export type Actor = z.infer<typeof ActorSchema>;
export interface IdentityService {
    authenticate(proof: unknown): Promise<Actor>;
    resolveSession(token: string): Promise<Actor>;
    revokeSession(token: string): Promise<void>;
}
export type DeviceTrust = z.infer<
    typeof import("./contracts.js").DeviceTrustSchema
>;
export * from "./contracts.js";
export * from "./crypto.js";
export * from "./passkeys.js";
export * from "./engine.js";
