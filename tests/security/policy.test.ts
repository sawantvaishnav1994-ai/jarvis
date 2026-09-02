import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
    DeterministicPolicy,
    immutableJson,
    policyDigest,
    type ToolDescriptor,
    type GovernedContext,
    type ControlState,
} from "@jarvis/security";
import {
    policyContext,
    policyControls,
    policyDocument,
    policyTool,
    policyNow,
} from "../fixtures/policy.js";
const decide = (
    tool = policyTool(),
    ctx = policyContext(),
    controls = policyControls(),
    now = policyNow,
) =>
    new DeterministicPolicy(policyDocument()).evaluate(
        tool,
        "repository-x",
        ctx,
        controls,
        now,
    );
it("loads the strict development policy and defaults to deny for unmatched identities/resources", async () => {
    const document = JSON.parse(
        await readFile("config/policy.development.json", "utf8"),
    );
    const p = new DeterministicPolicy(document);
    expect(
        p.evaluate(
            policyTool(),
            "repository-x",
            policyContext(),
            policyControls(),
            policyNow,
        ).allowed,
    ).toBe(true);
    expect(
        p.evaluate(
            policyTool(),
            "repository-y",
            policyContext(),
            policyControls(),
            policyNow,
        ).allowed,
    ).toBe(false);
    const c = policyContext();
    c.actor.kind = "human";
    expect(
        p.evaluate(policyTool(), "repository-x", c, policyControls(), policyNow)
            .reason,
    ).toBe("default-deny");
    expect(
        () => new DeterministicPolicy({ ...document, bypass: true }),
    ).toThrow();
    expect(
        () => new DeterministicPolicy({ ...document, version: 99 }),
    ).toThrow();
    expect(
        () =>
            new DeterministicPolicy({
                ...document,
                rules: [...document.rules, ...document.rules],
            }),
    ).toThrow();
});
it("denies by default; explicit denial wins in either rule order and exact actor restrictions apply", () => {
    const d = policyDocument(),
        allow = d.rules[0]!;
    for (const rules of [
        [],
        [{ ...allow, actorIds: ["another-agent"] }],
        [allow, { ...allow, id: "deny", effect: "deny" as const }],
        [{ ...allow, id: "deny", effect: "deny" as const }, allow],
    ]) {
        expect(
            new DeterministicPolicy({ ...d, rules }).evaluate(
                policyTool(),
                "repository-x",
                policyContext(),
                policyControls(),
                policyNow,
            ).allowed,
        ).toBe(false);
    }
});
it("freezes a copied policy and hashes canonical JSON independently of property order", () => {
    const doc = policyDocument(),
        p = new DeterministicPolicy(doc);
    doc.rules.length = 0;
    expect(
        p.evaluate(
            policyTool(),
            "repository-x",
            policyContext(),
            policyControls(),
            policyNow,
        ).allowed,
    ).toBe(true);
    expect(policyDigest({ b: 1, a: { y: 2, x: 3 } })).toBe(
        policyDigest({ a: { x: 3, y: 2 }, b: 1 }),
    );
    expect(
        new DeterministicPolicy({ ...policyDocument(), revision: "test-2" })
            .hash,
    ).not.toBe(p.hash);
    expect(() => immutableJson({ x: undefined })).toThrow();
    expect(() => immutableJson("x".repeat(100001))).toThrow();
});
it.each(["P0", "P1", "P2", "P3", "P4", "P5"] as const)(
    "safe mode allows only classified P0: %s",
    (permission) => {
        expect(decide({ ...policyTool(), permission }).allowed).toBe(
            permission === "P0",
        );
    },
);
it.each([
    { effect: "write" },
    { effect: "prepare" },
    { data: "private" },
    { data: "secret" },
    { physical: "low" },
] as Partial<ToolDescriptor>[])(
    "rejects underclassified tool metadata %j",
    (change) => {
        expect(
            decide({ ...policyTool(), ...change }, policyContext(), {
                ...policyControls(),
                mode: "autonomous",
            }).reason,
        ).toBe("underclassified-tool");
    },
);
it.each([
    { destructive: true },
    { securityChange: true },
    { financial: true },
    { physical: "high" },
    { permission: "P5" },
] as Partial<ToolDescriptor>[])(
    "never automatically executes critical effects %j",
    (change) => {
        expect(decide({ ...policyTool(), ...change }).reason).toBe(
            "critical-owner-ceremony-unavailable",
        );
    },
);
it.each([
    { assurance: "A0" },
    { assurance: "A4" },
    { verifiedAt: policyNow + 1 },
    { expiresAt: policyNow },
    { deviceTrust: "unknown" },
    { deviceTrust: "temporary" },
    { deviceTrust: "revoked" },
    { deviceTrust: "hardware-root" },
    { scopes: [] },
    { resources: [] },
] as Partial<GovernedContext["authority"]>[])(
    "rejects insufficient/invalid authority %j",
    (change) => {
        const c = policyContext();
        Object.assign(c.authority, change);
        expect(decide(policyTool(), c).allowed).toBe(false);
    },
);
it("rejects owner impersonation, cross-owner and cross-environment claims", () => {
    const c = policyContext();
    c.actor.kind = "owner";
    expect(() => decide(policyTool(), c)).toThrow();
    c.actor.kind = "agent";
    c.authority.ownerId = "another-owner";
    expect(() => decide(policyTool(), c)).toThrow();
    const other = policyContext();
    other.environment = "production";
    other.actor.environment = "production";
    expect(decide(policyTool(), other).allowed).toBe(false);
});
it.each([
    { frozen: true },
    { shutdown: true },
    { paused: true },
    { mode: "emergency" },
    { mode: "focus", focusResource: "another-project" },
] as Partial<ControlState>[])("honors runtime interlocks %j", (change) => {
    expect(
        decide(policyTool(), policyContext(), {
            ...policyControls(),
            ...change,
        }).allowed,
    ).toBe(false);
});
it("does not turn operating modes into authority and keeps network disabled", () => {
    for (const mode of [
        "assistant",
        "copilot",
        "autonomous",
        "focus",
        "private",
        "guest",
        "safe",
    ] as const) {
        expect(
            decide({ ...policyTool(), external: true }, policyContext(), {
                ...policyControls(),
                mode,
            }).allowed,
        ).toBe(false);
    }
    const tool = {
        ...policyTool(),
        permission: "P3" as const,
        effect: "write" as const,
    };
    expect(
        decide(tool, policyContext(), {
            ...policyControls(),
            mode: "assistant",
        }).allowed,
    ).toBe(false);
    expect(
        decide(tool, policyContext(), { ...policyControls(), mode: "copilot" })
            .requiresApproval,
    ).toBe(true);
    expect(
        decide(tool, policyContext(), {
            ...policyControls(),
            mode: "autonomous",
        }).requiresApproval,
    ).toBe(false);
    const c = policyContext();
    c.authority.scopes = [];
    expect(
        decide(tool, c, { ...policyControls(), mode: "autonomous" }).allowed,
    ).toBe(false);
});
it("sensitive operations need fresh A3 on a privileged device and explicit approval", () => {
    const tool = {
        ...policyTool(),
        permission: "P4" as const,
        data: "private" as const,
    };
    const c = policyContext(),
        controls = { ...policyControls(), mode: "autonomous" as const };
    expect(decide(tool, c, controls).reason).toBe("step-up-required");
    c.authority.assurance = "A3";
    c.authority.deviceTrust = "privileged";
    expect(decide(tool, c, controls)).toMatchObject({
        allowed: true,
        requiresApproval: true,
        risk: "sensitive",
    });
    c.authority.verifiedAt -= 60001;
    expect(decide(tool, c, controls).reason).toBe("step-up-required");
});
it("all matching allow restrictions combine; a weaker rule cannot remove step-up or approval", () => {
    const doc = policyDocument();
    doc.rules.push({
        ...doc.rules[0]!,
        id: "stricter",
        minimumAssurance: "A3",
        requireApproval: true,
    });
    const p = new DeterministicPolicy(doc),
        c = policyContext();
    expect(
        p.evaluate(policyTool(), "repository-x", c, policyControls(), policyNow)
            .allowed,
    ).toBe(false);
    c.authority.assurance = "A3";
    c.authority.deviceTrust = "privileged";
    expect(
        p.evaluate(policyTool(), "repository-x", c, policyControls(), policyNow)
            .requiresApproval,
    ).toBe(true);
});
