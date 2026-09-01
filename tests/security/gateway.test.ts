import { it, expect, vi } from "vitest";
import { ToolGateway, type JarvisTool } from "@jarvis/tools";
import { FoundationPolicy, type ApprovalService } from "@jarvis/security";
import { AuditRecordSchema, type AuditRecord } from "@jarvis/audit";
import { context } from "../fixtures/foundation.js";
const signal = () => new AbortController().signal;
function fixture() {
    const records: AuditRecord[] = [];
    const execute = vi.fn(async (input: string) => input.toUpperCase());
    const tool: JarvisTool<string, string> = {
        version: 1,
        id: "mock.echo",
        name: "Mock echo",
        description: "Harmless synthetic test",
        requiredPermission: "P0",
        scope: "mock.read",
        risk: "low",
        validate: (input) => {
            if (typeof input !== "string") throw new Error("invalid");
            return input;
        },
        execute,
        verify: (value) => value === "SYNTHETIC",
    };
    const consume = vi.fn(async () => false);
    const audit = {
        append: vi.fn(async (r: AuditRecord) => {
            records.push(AuditRecordSchema.parse(r));
        }),
    };
    return {
        records,
        execute,
        tool,
        consume,
        audit,
        gateway: new ToolGateway(new FoundationPolicy(), { consume }, audit),
    };
}
it("orders audit before execution and records only an input digest", async () => {
    const f = fixture();
    f.execute.mockImplementation(async (value) => {
        expect(f.records[0]?.result).toBe("requested");
        return value.toUpperCase();
    });
    expect(await f.gateway.invoke(f.tool, "synthetic", context, signal())).toBe(
        "SYNTHETIC",
    );
    expect(f.records.map((r) => r.result)).toEqual(["requested", "success"]);
    expect(JSON.stringify(f.records)).not.toContain("synthetic");
});
it("fails closed for missing scope, agents, cross-environment identities and critical actions", async () => {
    const f = fixture();
    for (const ctx of [
        { ...context, grantedScopes: [] },
        { ...context, actor: { ...context.actor, kind: "agent" as const } },
        { ...context, environment: "production" as const },
    ])
        await expect(
            f.gateway.invoke(f.tool, "synthetic", ctx, signal()),
        ).rejects.toThrow();
    await expect(
        f.gateway.invoke(
            { ...f.tool, requiredPermission: "P5", risk: "critical" },
            "synthetic",
            context,
            signal(),
        ),
    ).rejects.toThrow("TOOL_DENIED");
    expect(f.execute).not.toHaveBeenCalled();
});
it("requires approval bound to actor, request, tool and exact arguments", async () => {
    const f = fixture();
    const tool = { ...f.tool, requiredPermission: "P3" as const };
    await expect(
        f.gateway.invoke(tool, "synthetic", context, signal(), "proof"),
    ).rejects.toThrow("APPROVAL_REQUIRED");
    expect(f.consume).toHaveBeenCalledWith(
        "proof",
        expect.objectContaining({
            actorId: context.actor.id,
            requestId: context.requestId,
            toolId: tool.id,
            inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
    );
    expect(f.execute).not.toHaveBeenCalled();
});
it("passes proof consumption through once-only approval authority", async () => {
    const f = fixture();
    let used = false;
    const approvals: ApprovalService = {
        consume: async () => {
            if (used) return false;
            used = true;
            return true;
        },
    };
    const gateway = new ToolGateway(new FoundationPolicy(), approvals, f.audit);
    const tool = { ...f.tool, requiredPermission: "P3" as const };
    await gateway.invoke(tool, "synthetic", context, signal(), "proof");
    await expect(
        gateway.invoke(tool, "synthetic", context, signal(), "proof"),
    ).rejects.toThrow("APPROVAL_REQUIRED");
    expect(f.execute).toHaveBeenCalledTimes(1);
});
it("does not execute if the audit sink is unavailable", async () => {
    const f = fixture();
    f.audit.append.mockRejectedValue(new Error("audit unavailable"));
    await expect(
        f.gateway.invoke(f.tool, "synthetic", context, signal()),
    ).rejects.toThrow();
    expect(f.execute).not.toHaveBeenCalled();
});
it("records verification failure instead of reporting a successful action", async () => {
    const f = fixture();
    f.execute.mockResolvedValue("WRONG");
    await expect(
        f.gateway.invoke(f.tool, "synthetic", context, signal()),
    ).rejects.toThrow("TOOL_FAILED");
    expect(f.records.map((r) => r.result)).toEqual(["requested", "failed"]);
});
it("stops before execution on a cancelled request", async () => {
    const f = fixture();
    await expect(
        f.gateway.invoke(f.tool, "synthetic", context, AbortSignal.abort()),
    ).rejects.toThrow("TOOL_DENIED");
    expect(f.execute).not.toHaveBeenCalled();
});
