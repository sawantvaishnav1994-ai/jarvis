import { it, expect, vi } from "vitest";
import type { AuthorizationV3, SecretManager } from "@jarvis/security";
import { SecretHandleExecutor, SecretUseSchema, SecretUseReceiptSchema } from "@jarvis/storage";

const input = { version: 1, handle: "secret://synthetic/credential-check", tool: "synthetic.credential-check" };
it("accepts only versioned opaque-handle input, not executable callbacks or output requests", () => {
    expect(SecretUseSchema.parse(input)).toEqual(input);
    for (const extra of [{ output: "plaintext" }, { script: "arbitrary" }, { secret: "plaintext" }])
        expect(() => SecretUseSchema.parse({ ...input, ...extra })).toThrow();
    expect(() => SecretUseSchema.parse({ ...input, tool: "raw.secret.read" })).toThrow();
});
it("refuses any credential, MAC, hash or arbitrary output field in its receipt", () => {
    const receipt = { version: 1, tool: "synthetic.credential-check", verified: true, secretReturned: false };
    expect(SecretUseReceiptSchema.parse(receipt)).toEqual(receipt);
    for (const name of ["credential", "secret", "mac", "hash", "payload"])
        expect(() => SecretUseReceiptSchema.parse({ ...receipt, [name]: "forbidden" })).toThrow();
});
it("refuses a direct call outside an authenticated storage transaction before vault access", async () => {
    const vault: SecretManager = { lease: vi.fn() };
    await expect(new SecretHandleExecutor(vault, "trusted-executor").execute({} as AuthorizationV3, input))
        .rejects.toThrow("AUTHENTICATED_TRANSACTION_REQUIRED");
    expect(vault.lease).not.toHaveBeenCalled();
});
