import { expect, it, vi } from "vitest";
import { GovernedToolGateway, type GovernedTool } from "@jarvis/tools";
import {
    DeterministicPolicy,
    policyDigest,
    type ApprovalBindingV2,
} from "@jarvis/security";
import { PolicyAuditRecordSchema, type PolicyAuditRecord } from "@jarvis/audit";
import {
    policyContext,
    policyControls,
    policyDocument,
    policyTool,
    policyNow,
} from "../fixtures/policy.js";
function fixture(approvalRequired = false) {
    const controls = policyControls(),
        records: PolicyAuditRecord[] = [],
        doc = policyDocument();
    doc.rules[0]!.requireApproval = approvalRequired;
    let now = policyNow;
    const execute = vi.fn(async (input: unknown) => input);
    const tool: GovernedTool = {
        descriptor: policyTool(),
        validate: (x) => x,
        resource: () => "repository-x",
        execute,
        verify: () => true,
    };
    const audit = {
        append: vi.fn(async (record: PolicyAuditRecord) => {
            records.push(PolicyAuditRecordSchema.parse(record));
        }),
    };
    const consume = vi.fn(
        async (_proof: string, _binding: ApprovalBindingV2) => false,
    );
    const policy = new DeterministicPolicy(doc);
    const gateway = new GovernedToolGateway(
        [tool],
        policy,
        { read: () => controls },
        { consume },
        audit,
        () => now,
    );
    return {
        gateway,
        controls,
        records,
        audit,
        execute,
        tool,
        consume,
        policy,
        advance: (ms: number) => {
            now += ms;
        },
    };
}
const signal = () => new AbortController().signal;
it("records versioned request and authorization before execution, then verified result without raw arguments", async () => {
    const f = fixture();
    f.execute.mockImplementation(async (input) => {
        expect(f.records.map((r) => r.result)).toEqual([
            "requested",
            "authorized",
        ]);
        return input;
    });
    expect(
        await f.gateway.invoke(
            f.tool.descriptor.id,
            { value: "synthetic-payload" },
            policyContext(),
            signal(),
        ),
    ).toEqual({ value: "synthetic-payload" });
    expect(f.records.map((r) => r.result)).toEqual([
        "requested",
        "authorized",
        "success",
    ]);
    expect(f.records[1]).toMatchObject({
        version: 2,
        reason: "explicit-allow",
        policyHash: f.policy.hash,
    });
    expect(JSON.stringify(f.records)).not.toContain("synthetic-payload");
});
it("copies input/context/registered metadata before awaiting any untrusted mutation", async () => {
    const f = fixture(),
        c = policyContext(),
        input = { nested: { value: "original" } };
    f.audit.append.mockImplementation(async (record) => {
        f.records.push(record);
        if (record.result === "requested") {
            input.nested.value = "changed";
            c.authority.scopes.length = 0;
            f.tool.descriptor.permission = "P5";
        }
    });
    f.execute.mockImplementation(async (value) => {
        expect(Object.isFrozen(value)).toBe(true);
        expect(value).toEqual({ nested: { value: "original" } });
        return value;
    });
    await f.gateway.invoke("mock.repository.read", input, c, signal());
    expect(f.records.at(-1)?.result).toBe("success");
});
it("rejects unregistered and duplicate tools and never executes missing-scope requests", async () => {
    const f = fixture();
    await expect(
        f.gateway.invoke("unknown", "input", policyContext(), signal()),
    ).rejects.toThrow("UNKNOWN_TOOL");
    expect(
        () =>
            new GovernedToolGateway(
                [f.tool, f.tool],
                f.policy,
                { read: () => f.controls },
                { consume: f.consume },
                f.audit,
            ),
    ).toThrow("DUPLICATE_TOOL");
    const c = policyContext();
    c.authority.scopes = [];
    await expect(
        f.gateway.invoke(f.tool.descriptor.id, "input", c, signal()),
    ).rejects.toThrow("TOOL_DENIED");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.records.at(-1)?.reason).toBe("scope-or-resource-denied");
});
it.each(["requested", "authorized"] as const)(
    "audit failure at %s blocks execution",
    async (phase) => {
        const f = fixture();
        f.audit.append.mockImplementation(async (r) => {
            if (r.result === phase) throw new Error("AUDIT_UNAVAILABLE");
        });
        await expect(
            f.gateway.invoke(
                f.tool.descriptor.id,
                "input",
                policyContext(),
                signal(),
            ),
        ).rejects.toThrow("AUDIT_UNAVAILABLE");
        expect(f.execute).not.toHaveBeenCalled();
    },
);
it("does not report success or automatically retry when post-effect audit fails", async () => {
    const f = fixture();
    f.audit.append.mockImplementation(async (r) => {
        if (r.result === "success") throw new Error("AUDIT_UNAVAILABLE");
    });
    await expect(
        f.gateway.invoke(
            f.tool.descriptor.id,
            "input",
            policyContext(),
            signal(),
        ),
    ).rejects.toThrow("AUDIT_UNAVAILABLE");
    expect(f.execute).toHaveBeenCalledTimes(1);
});
it.each(["requested", "authorized"] as const)(
    "rechecks control state after %s audit awaits",
    async (phase) => {
        const f = fixture();
        f.audit.append.mockImplementation(async (r) => {
            if (r.result === phase) {
                f.controls.frozen = true;
                f.controls.epoch++;
            }
        });
        await expect(
            f.gateway.invoke(
                f.tool.descriptor.id,
                "input",
                policyContext(),
                signal(),
            ),
        ).rejects.toThrow("TOOL_DENIED");
        expect(f.execute).not.toHaveBeenCalled();
    },
);
it("rejects authority expiry during audit and cancellation before execution", async () => {
    const f = fixture();
    f.audit.append.mockImplementation(async (r) => {
        if (r.result === "authorized") f.advance(60000);
    });
    await expect(
        f.gateway.invoke(
            f.tool.descriptor.id,
            "input",
            policyContext(),
            signal(),
        ),
    ).rejects.toThrow("TOOL_DENIED");
    expect(f.execute).not.toHaveBeenCalled();
    const g = fixture(),
        controller = new AbortController();
    controller.abort();
    await expect(
        g.gateway.invoke(
            g.tool.descriptor.id,
            "input",
            policyContext(),
            controller.signal,
        ),
    ).rejects.toThrow("TOOL_DENIED");
    expect(g.execute).not.toHaveBeenCalled();
});
it("rejects a result after cooperative stop without claiming the effect was undone", async () => {
    const f = fixture();
    f.execute.mockImplementation(async () => {
        f.controls.shutdown = true;
        return "result";
    });
    await expect(
        f.gateway.invoke(
            f.tool.descriptor.id,
            "input",
            policyContext(),
            signal(),
        ),
    ).rejects.toThrow("TOOL_FAILED");
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.records.at(-1)?.result).toBe("failed");
});
it("requires approval and passes all security-relevant fields to a once-only authority", async () => {
    const f = fixture(true),
        context = policyContext();
    let expected: ApprovalBindingV2 | undefined,
        consumed = false;
    f.consume.mockImplementation(async (_proof, binding) => {
        if (!expected) {
            expected = structuredClone(binding);
            return false;
        }
        if (consumed || policyDigest(binding) !== policyDigest(expected))
            return false;
        consumed = true;
        return true;
    });
    await expect(
        f.gateway.invoke(
            f.tool.descriptor.id,
            { value: 1 },
            context,
            signal(),
            "proof",
        ),
    ).rejects.toThrow("TOOL_DENIED");
    expect(expected).toMatchObject({
        version: 2,
        ownerId: context.authority.ownerId,
        actorId: context.actor.id,
        deviceId: context.authority.deviceId,
        sessionId: context.authority.sessionId,
        environment: "development",
        requestId: context.requestId,
        toolId: f.tool.descriptor.id,
        resource: "repository-x",
        policyHash: f.policy.hash,
        policyRevision: f.policy.revision,
        controlEpoch: 0,
    });
    for (const value of [{ value: 2 }])
        await expect(
            f.gateway.invoke(
                f.tool.descriptor.id,
                value,
                context,
                signal(),
                "proof",
            ),
        ).rejects.toThrow("TOOL_DENIED");
    const changed = structuredClone(context);
    changed.authority.sessionId = "other-session";
    await expect(
        f.gateway.invoke(
            f.tool.descriptor.id,
            { value: 1 },
            changed,
            signal(),
            "proof",
        ),
    ).rejects.toThrow("TOOL_DENIED");
    await f.gateway.invoke(
        f.tool.descriptor.id,
        { value: 1 },
        context,
        signal(),
        "proof",
    );
    await expect(
        f.gateway.invoke(
            f.tool.descriptor.id,
            { value: 1 },
            context,
            signal(),
            "proof",
        ),
    ).rejects.toThrow("TOOL_DENIED");
    expect(f.execute).toHaveBeenCalledTimes(1);
});
it("a consumed approval cannot bypass a newly activated interlock", async () => {
    const f = fixture(true);
    f.consume.mockImplementation(async () => {
        f.controls.epoch++;
        return true;
    });
    await expect(
        f.gateway.invoke(
            f.tool.descriptor.id,
            "input",
            policyContext(),
            signal(),
            "proof",
        ),
    ).rejects.toThrow("TOOL_DENIED");
    expect(f.execute).not.toHaveBeenCalled();
});
