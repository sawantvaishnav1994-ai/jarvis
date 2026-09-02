import { test, expect, type Browser, type Page } from "@playwright/test";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { FileSecretManager } from "@jarvis/security";
import { browserGovernanceGo } from "./governance-flow.js";
test.skip(
    process.env.JARVIS_IDENTITY_E2E !== "1",
    "Only run against a disposable fresh CI installation; creates its synthetic owner.",
);
async function device(browser: Browser) {
    const context = await browser.newContext(),
        page = await context.newPage(),
        cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
            protocol: "ctap2",
            transport: "internal",
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
            automaticPresenceSimulation: true,
        },
    });
    await page.goto("http://localhost:3000/identity");
    return { context, page };
}
async function click(page: Page, label: string, result: string) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(result, {
        timeout: 15000,
    });
}
test("J0.2 GO: real browser passkeys, owner, second device, restricted agent, revocation and recovery", async ({
    browser,
    request,
}) => {
    const first = await device(browser),
        second = await device(browser),
        page = first.page;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const actor = {
        version: 1 as const,
        id: "jarvis-ci-identity",
        kind: "service" as const,
        environment: "development" as const,
    };
    const vault = new FileSecretManager(
        process.env.JARVIS_VAULT_FILE ?? ".jarvis/development/vault.json",
        process.env.JARVIS_MASTER_KEY_FILE ??
            resolve(
                homedir(),
                ".config/jarvis/typescript/development/master.key",
            ),
        "development",
        actor.id,
        new Set(["development/identity/bootstrap"]),
    );
    const lease = await vault.lease("development/identity/bootstrap", actor);
    try {
        await page
            .getByLabel("Installation claim code", { exact: true })
            .fill(lease.value.toString());
    } finally {
        lease.destroy();
    }
    await page
        .getByLabel("Device name", { exact: true })
        .fill("Primary CI browser");
    await click(page, "Create Root Owner", "Root Owner created.");
    const ownerId = await page.getByTestId("owner-id").textContent();
    const cookie = (
        await first.context.cookies("http://localhost:3000/api/identity")
    ).find((c) => c.name === "jarvis_session");
    expect(
        Boolean(
            cookie?.httpOnly && cookie.secure && cookie.sameSite === "Strict",
        ),
    ).toBe(true);
    expect(
        await page.evaluate(() => document.cookie.includes("jarvis_session")),
    ).toBe(false);
    await second.page
        .getByLabel("Device name", { exact: true })
        .fill("Second CI browser");
    await click(
        second.page,
        "Request device enrollment",
        "Enrollment requested: approve this device from an existing owner session.",
    );
    await click(second.page, "Sign in with passkey", "DEVICE_NOT_TRUSTED");
    await click(page, "Refresh owner session", "Owner session verified.");
    await click(page, "Approve Second CI browser", "Device approved.");
    await click(
        second.page,
        "Sign in with passkey",
        "Authenticated with passkey and device proof.",
    );
    await click(
        page,
        "Create restricted mock agent",
        "Restricted agent created; no delegated token yet.",
    );
    await click(
        page,
        "Delegate mock read",
        "One mock-read permission delegated for at most 60 seconds.",
    );
    await click(
        page,
        "Run permitted mock read",
        "Permitted mock action completed.",
    );
    await click(
        page,
        "Attempt forbidden mock write",
        "DELEGATION_SCOPE_DENIED",
    );
    await click(page, "Test critical-action denial", "A4_NOT_ESTABLISHED");
    await click(page, "Revoke Second CI browser", "Device revoked.");
    await click(second.page, "Sign in with passkey", "DEVICE_NOT_TRUSTED");
    await click(second.page, "Refresh owner session", "SESSION_INVALID");
    await browserGovernanceGo(page, ownerId!);
    await click(
        page,
        "Create recovery kit",
        "Recovery kit created. Store both parts separately; a new kit invalidates older ones.",
    );
    const recoveryPackage = await page
        .getByLabel("Encrypted recovery package", { exact: true })
        .inputValue();
    const recoveryKey = await page
        .getByLabel("Offline recovery key", { exact: true })
        .inputValue();
    await page.getByText("Recover owner authority", { exact: true }).click();
    await page
        .getByLabel("Recovery package", { exact: true })
        .fill(recoveryPackage);
    await page.getByLabel("Recovery key", { exact: true }).fill(recoveryKey);
    await page.getByLabel("Expected owner ID", { exact: true }).fill(ownerId!);
    await click(
        page,
        "Recover owner with new device key",
        "Owner recovered; previous device authority revoked.",
    );
    expect(await page.getByTestId("owner-id").textContent()).toBe(ownerId);
    await expect(
        page.getByText(/security.owner_recovery_completed/),
    ).toBeVisible();
    await click(page, "Run permitted mock read", "DELEGATION_INVALID");
    expect(errors).toEqual([]);
    const unsigned = await request.post(
        "http://127.0.0.1:4000/v1/identity/rpc",
        { data: { method: "identity.inspect", params: {} } },
    );
    expect(unsigned.status()).toBe(403);
    const crossOrigin = await request.post("/api/identity", {
        headers: { origin: "https://attacker.example" },
        data: { method: "action.begin", params: {} },
    });
    expect(crossOrigin.status()).toBe(403);
    await first.context.close();
    await second.context.close();
});
