import { expect, it, vi } from "vitest";
import { minimizeExternalContext, requireExternalContext } from "@jarvis/security";
const item = (id: string, classification: string, mode: string) => ({
    id, classification, fields: { content: `approved-${id}`, private_notes: "unrelated-private-field", accountId: "synthetic-account" },
    policy: { version: 1, mode, providers: ["synthetic"], regions: ["eu"], fields: ["content"], maximumCharacters: 100 },
});
it("Q: mixed external context excludes D5, local/private fields and wrong providers before synthetic invocation", async () => {
    const raw = [item("ops", "D1", "APPROVED_EXTERNAL_AI"), item("project", "D2", "SPECIFIC_PROVIDER_ONLY"),
        item("sensitive", "D3", "NEVER_EXTERNAL"), item("secret", "D5", "APPROVED_EXTERNAL_AI"),
        item("local", "D2", "LOCAL_ONLY"), item("unselected", "D2", "APPROVED_EXTERNAL_AI")];
    raw[3]!.fields.content = "SYNTHETIC_D5_SENTINEL";
    const provider = vi.fn(async (context: unknown) => ({ received: context }));
    const prepared = requireExternalContext(raw, "synthetic", "eu", ["ops", "project", "sensitive", "secret", "local"], 100);
    const result = await provider(prepared.items);
    expect(provider).toHaveBeenCalledOnce();
    expect(result.received).toEqual([{ id: "ops", fields: { content: "approved-ops" } }, { id: "project", fields: { content: "approved-project" } }]);
    for (const denied of ["SYNTHETIC_D5_SENTINEL", "unrelated-private-field", "synthetic-account", "approved-sensitive", "approved-local", "approved-unselected"])
        expect(JSON.stringify(result)).not.toContain(denied);
    expect(minimizeExternalContext(raw, "unapproved", "eu", ["project"]).items).toEqual([]);
});
it("Q: an unsatisfied provider policy denies invocation rather than sending unfiltered fallback", async () => {
    const provider = vi.fn();
    expect(() => provider(requireExternalContext([item("local", "D2", "LOCAL_ONLY")], "synthetic", "eu", ["local"]).items)).toThrow("EXTERNAL_CONTEXT_POLICY_UNSATISFIED");
    expect(provider).not.toHaveBeenCalled();
});
