import { createHmac } from "node:crypto";
import { z } from "zod";
import { BoundaryError, SecretReferenceSchema } from "@jarvis/shared";
import type { AuthorizationV3, SecretManager, SecretLease } from "@jarvis/security";
import { currentDataTransaction } from "./transaction.js";

export const SecretUseSchema = z.strictObject({
    version: z.literal(1),
    handle: SecretReferenceSchema,
    tool: z.literal("synthetic.credential-check"),
});
export const SecretUseReceiptSchema = z.strictObject({
    version: z.literal(1),
    tool: z.literal("synthetic.credential-check"),
    verified: z.literal(true),
    secretReturned: z.literal(false),
});

/** Trusted execution adapter, never a raw-secret read API. Only the closed
 * synthetic tool is registered; requests cannot supply handlers or output formats.
 * The surrounding J0.3 gateway consumes the exact one-use execution permit.
 */
export class SecretHandleExecutor {
    constructor(
        private readonly vault: SecretManager,
        private readonly serviceId: string,
        private readonly clock: () => number = Date.now,
    ) {}
    async execute(auth: AuthorizationV3, raw: unknown) {
        currentDataTransaction();
        const input = SecretUseSchema.parse(raw);
        if (input.handle !== "secret://synthetic/credential-check" ||
            auth.toolId !== "data.secret.use" || auth.resource !== "owner-data" ||
            auth.capability !== "secrets.handle.use" || auth.permission !== "P4" ||
            auth.zone !== "Z4" || auth.assurance !== "A3" || !auth.approvalId ||
            auth.environment !== "development" || auth.status !== "consumed" ||
            auth.uses !== 1 || auth.expiresAt <= this.clock())
            throw new BoundaryError("SECRET_USE_SCOPE_DENIED");
        let lease: SecretLease | undefined;
        try {
            lease = await this.vault.lease("development/tools/synthetic-credential", {
                version: 1, id: this.serviceId, kind: "service", environment: "development",
            }, Math.min(10000, auth.expiresAt - this.clock()));
            if (lease.expiresAt <= this.clock() || auth.expiresAt <= this.clock())
                throw new BoundaryError("SECRET_USE_EXPIRED");
            if (lease.value.length < 32 || lease.value.every(byte => byte === 0))
                throw new BoundaryError("SECRET_USE_INVALID_CREDENTIAL");
            // Synthetic tool consumes the actual credential internally. Neither
            // raw bytes, hash, MAC nor arbitrary tool output crosses back to the model.
            const proof = createHmac("sha256", lease.value)
                .update("jarvis-synthetic-credential-check-v1").digest();
            try {
                if (proof.length !== 32) throw new BoundaryError("SECRET_USE_FAILED");
            } finally { proof.fill(0); }
            return SecretUseReceiptSchema.parse({
                version: 1, tool: input.tool, verified: true, secretReturned: false,
            });
        } catch {
            throw new BoundaryError("SECRET_USE_FAILED");
        } finally { lease?.destroy(); }
    }
}
