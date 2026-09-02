import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { canonical, digest } from "@jarvis/identity";
import { dataPolicy } from "../fixtures/data.js";

/** Existing console -> passkey approval -> J0.3 -> actual API data adapter. */
export async function browserDataFlow(page: Page, ownerId: string) {
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
        denied?: string,
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
    await command("owner", "policy.create", {
        version: 1,
        id: "browser.storage",
        revision: 1,
        status: "draft",
        createdAt: 0,
        activatedAt: null,
        creatorId: ownerId,
        precedence: "owner",
        supersedes: null,
        rules: [
            {
                id: "exact-data",
                effect: "allow",
                actorIds: [actorId],
                capabilities: ["data.inventory", "data.write", "data.read"],
                scope: {
                    version: 1,
                    resource: "owner-data",
                    environments: ["development"],
                },
                maximumRisk: "R3",
                requireApproval: true,
                requireStepUp: true,
                allowEscalationRequest: true,
            },
        ],
    });
    await command("owner", "policy.activate", {
        id: "browser.storage",
        revision: 1,
    });
    await command("owner", "delegation.grant", {
        version: 1,
        actorId,
        capability: "data.inventory",
        resource: "owner-data",
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
        maximumToolCalls: 10,
        toolCalls: 0,
        maximumRisk: "R2",
        resources: ["owner-data"],
        environments: ["development"],
        startedAt: Date.now(),
        notBefore: 0,
        expiresAt: Date.now() + 900000,
        networkAllowed: false,
        maximumConcurrent: 1,
        approvalThreshold: "R3",
    });
    async function authorized(
        toolId: string,
        recordId: string,
        transient?: unknown,
    ) {
        const request = {
            version: 1,
            id: randomUUID(),
            toolId,
            resource: "owner-data",
            environment: "development",
            input: {
                recordId,
                classification: "D2",
                payloadHash:
                    transient === undefined
                        ? null
                        : digest(canonical(transient)),
            },
        };
        const pending = await command("agent", "request", request);
        await command("owner", "approval.decide", {
            version: 1,
            approvalId: pending.approval.id,
            requestHash: pending.requestHash,
            decision: "approve",
        });
        const issued = await command("agent", "authorize", {
            request,
            approvalId: pending.approval.id,
        });
        return {
            request,
            authorization: issued.authorization,
            ...(transient === undefined ? {} : { transient }),
        };
    }
    const record = {
        version: 1,
        id: randomUUID(),
        ownerId,
        actorId,
        domain: "conversation",
        revision: 1,
        previousRevision: null,
        projectId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        reason: "synthetic browser acceptance",
        policy: dataPolicy(),
        retention: {
            version: 1,
            id: randomUUID(),
            revision: 1,
            mode: "KEEP_FOREVER",
            expiresAt: null,
            durationMs: null,
            sessionId: null,
        },
        external: {
            version: 1,
            mode: "NEVER_EXTERNAL",
            providers: [],
            regions: [],
            fields: [],
            maximumCharacters: 0,
        },
        provenance: [
            {
                kind: "owner-input",
                sourceId: "browser-fixture",
                sourceVersion: 1,
                actorId: ownerId,
                capturedAt: Date.now(),
                confidence: 1,
            },
        ],
        sources: [],
        payload: {
            title: "Owner-controlled browser conversation",
            participants: [ownerId],
            archived: false,
        },
    };
    const write = await authorized("data.record.put", record.id, record);
    expect(
        (await command("agent", "execute", write)).result.value,
    ).toMatchObject({ stored: true, id: record.id });
    await command("agent", "execute", write, "AUTHORIZATION_REPLAY");
    const read = await authorized("data.record.read", record.id);
    expect((await command("agent", "execute", read)).result.value).toEqual(
        record,
    );
    const transient = {
        ...record,
        id: randomUUID(),
        policy: { ...record.policy, retention: { mode: "never-store" } },
        retention: { ...record.retention, mode: "NEVER_STORE" },
        payload: { ...record.payload, title: "Browser transient sentinel" },
    };
    expect(
        (
            await command(
                "agent",
                "execute",
                await authorized("data.record.put", transient.id, transient),
            )
        ).result.value,
    ).toMatchObject({ stored: false });
    await command(
        "agent",
        "execute",
        await authorized("data.record.read", transient.id),
        "TOOL_FAILED",
    );
}
