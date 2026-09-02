import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
    PolicyV3Schema,
    type ActionRequestV3,
    type AuthorizationV3,
} from "@jarvis/security";
export async function browserGovernanceGo(page: Page, ownerId: string) {
    await page
        .getByRole("button", { name: "Create J0.3 Developer", exact: true })
        .click();
    await expect(page.getByRole("status")).toHaveText(
        "J0.3 Developer created without permissions.",
    );
    const actorId = (await page.getByTestId("developer-id").textContent())!;
    async function command(
        kind: "owner" | "agent",
        command: string,
        data: unknown,
        denied?: string | RegExp,
    ) {
        await page
            .getByLabel(
                kind === "owner"
                    ? "Owner security command (JSON)"
                    : "Governed agent command (JSON)",
            )
            .fill(JSON.stringify({ command, data }));
        await page
            .getByRole("button", {
                name:
                    kind === "owner"
                        ? "Run owner security command"
                        : "Run governed agent command",
                exact: true,
            })
            .click();
        await expect(page.getByRole("status")).toHaveText(
            denied ??
                (kind === "owner"
                    ? "Security command completed."
                    : "Governed agent command completed."),
        );
        return denied
            ? {}
            : JSON.parse(
                  (await page.getByTestId("security-result").textContent())!,
              );
    }
    const request = (toolId = "mock.repository.read"): ActionRequestV3 => ({
        version: 1,
        id: randomUUID(),
        toolId,
        resource: "jarvis",
        environment:
            toolId === "mock.production.deploy" ? "production" : "development",
        input: {
            commit: "a".repeat(40),
            branch:
                toolId === "mock.production.deploy" ? "main" : "development",
            files: ["docs/readme.md"],
            simulation: "pass",
            tests: "pass",
            scan: "pass",
        },
    });
    const base = {
        id: "dev",
        effect: "allow",
        actorIds: [actorId],
        maximumRisk: "R2",
        requireApproval: false,
        requireStepUp: false,
        requireSimulation: true,
        requireTests: true,
        requireScan: true,
    };
    const policy = PolicyV3Schema.parse({
        version: 1,
        id: "browser.owner",
        revision: 1,
        status: "draft",
        createdAt: 0,
        activatedAt: null,
        creatorId: ownerId,
        precedence: "owner",
        supersedes: null,
        rules: [
            {
                ...base,
                capabilities: [
                    "github.repo.read",
                    "github.repo.write",
                    "tests.execute",
                ],
                scope: {
                    version: 1,
                    resource: "jarvis",
                    environments: ["development"],
                },
            },
            {
                ...base,
                id: "production",
                capabilities: ["github.production.deploy"],
                maximumRisk: "R4",
                requireApproval: true,
                requireStepUp: true,
                allowEscalationRequest: true,
                scope: {
                    version: 1,
                    resource: "jarvis",
                    environments: ["production"],
                },
            },
        ],
    });
    await command("owner", "policy.create", policy);
    await command("owner", "policy.activate", { id: policy.id, revision: 1 });
    for (const capability of [
        "github.repo.read",
        "github.repo.write",
        "tests.execute",
    ])
        await command("owner", "delegation.grant", {
            version: 1,
            actorId,
            capability,
            resource: "jarvis",
            environment: "development",
            ttlSeconds: 900,
            maximumUses: 10,
            maximumRisk: "R2",
            toolId: null,
        });
    await command("owner", "budget.set", {
        version: 1,
        actorId,
        maximumRuntimeMs: 900000,
        maximumSpendMinor: 0,
        spentMinor: 0,
        maximumToolCalls: 20,
        toolCalls: 0,
        maximumRisk: "R2",
        resources: ["jarvis"],
        environments: ["development"],
        startedAt: Date.now(),
        notBefore: 0,
        expiresAt: Date.now() + 900000,
        networkAllowed: false,
        maximumConcurrent: 1,
        approvalThreshold: "R3",
    });
    for (const tool of [
        "mock.repository.read",
        "mock.repository.write",
        "mock.tests.execute",
    ]) {
        const r = request(tool),
            issued = (await command("agent", "request", r)) as {
                authorization: AuthorizationV3;
            };
        await command("agent", "execute", {
            request: r,
            authorization: issued.authorization,
        });
    }
    const denied = request("mock.production.deploy");
    const pending = (await command("agent", "request", denied)) as {
        approval: { id: string };
    };
    const card = page.getByTestId(`approval-${pending.approval.id}`);
    await expect(card).toContainText("A3");
    await expect(card).toContainText("jarvis");
    await card.getByText("View exact action details").click();
    await expect(card).toContainText("a".repeat(40));
    await card.getByRole("button", { name: "Deny exact action" }).click();
    await expect(page.getByRole("status")).toHaveText("Action denied.");
    await command(
        "agent",
        "authorize",
        { request: denied, approvalId: pending.approval.id },
        "EXACT_APPROVAL_REQUIRED",
    );
    await command(
        "agent",
        "execute",
        { request: denied },
        "IDENTITY_INPUT_INVALID",
    );
    const r = request("mock.production.deploy"),
        p = (await command("agent", "request", r)) as {
            approval: { id: string };
        };
    await page
        .getByTestId(`approval-${p.approval.id}`)
        .getByRole("button", { name: "Approve exact action with passkey" })
        .click();
    await expect(page.getByRole("status")).toHaveText("Exact action approved.");
    const issued = (await command("agent", "authorize", {
        request: r,
        approvalId: p.approval.id,
    })) as { authorization: AuthorizationV3 };
    expect(issued.authorization.assurance).toBe("A3");
    await command("agent", "execute", {
        request: r,
        authorization: issued.authorization,
    });
    await command(
        "agent",
        "execute",
        { request: r, authorization: issued.authorization },
        "AUTHORIZATION_REPLAY",
    );
    await command(
        "agent",
        "request",
        { ...request(), resource: "other" },
        /AUTHENTICATION_FAILED|RESOURCE_SCOPE_DENIED/,
    );
    const self = (await command(
        "agent",
        "request",
        request("mock.production.deploy"),
    )) as { approval: { id: string }; requestHash: string };
    await command(
        "agent",
        "approval.decide",
        {
            version: 1,
            approvalId: self.approval.id,
            requestHash: self.requestHash,
            decision: "approve",
        },
        "OWNER_REQUIRED_NO_SELF_APPROVAL",
    );
    await page
        .getByRole("button", {
            name: "Activate security lockdown",
            exact: true,
        })
        .click();
    await expect(page.getByRole("status")).toHaveText(
        "Security lockdown activated.",
    );
    await command("agent", "request", request(), "SECURITY_LOCKDOWN");
    await command(
        "agent",
        "controls.set",
        { flag: "SECURITY_LOCKDOWN", active: false },
        "OWNER_REQUIRED_NO_SELF_APPROVAL",
    );
    await page
        .getByRole("button", { name: "Release security lockdown", exact: true })
        .click();
    await expect(page.getByRole("status")).toHaveText(
        "Security lockdown released.",
    );
    const high = structuredClone(policy);
    high.id = "browser.block";
    high.rules = [high.rules[0]!];
    high.rules[0]!.effect = "deny";
    const low = structuredClone(policy);
    low.id = "browser.workflow";
    low.precedence = "workflow";
    low.rules = [low.rules[0]!];
    for (const p of [high, low]) {
        await command("owner", "policy.create", p);
        await command("owner", "policy.activate", { id: p.id, revision: 1 });
    }
    await command("agent", "request", request(), /browser.block@1/);
    await command(
        "owner",
        "policy.create",
        { ...policy, rules: [] },
        "IDENTITY_INPUT_INVALID",
    );
    await command(
        "owner",
        "policy.activate",
        { id: "absent", revision: 1 },
        "POLICY_UNAVAILABLE",
    );
    await command("agent", "request", request(), /browser.block@1/);
    await page
        .getByRole("button", { name: "Refresh owner session", exact: true })
        .click();
    await expect(page.getByRole("status")).toHaveText(
        "Owner session verified.",
    );
    await expect(
        page.getByText(/emergency.state_released/).first(),
    ).toBeVisible();
}
