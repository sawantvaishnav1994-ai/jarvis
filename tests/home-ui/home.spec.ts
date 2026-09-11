import { test, expect } from "@playwright/test";
const fixtureResult = {
    conversationId: "00000000-0000-4000-8000-000000000001",
    conversationSessionId: "00000000-0000-4000-8000-000000000002",
    turnId: "fixture-turn",
    response: "Synthetic fixture response for UI verification.",
    state: "COMPLETED",
    events: [
        { sequence: 1, state: "COMPLETED", kind: "terminal", content: null },
    ],
    mode: "assistant",
    securityEpoch: 1,
    privacy: {
        classification: "D2",
        processing: "LOCAL",
        externalAI: false,
        stored: false,
    },
    source: { provider: "synthetic-ui", provenance: "ui-test-fixture" },
    approval: null,
    tool: null,
};
test("Home renders its neural field and keyboard navigation on desktop and mobile", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
    ]) {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await expect(
            page.getByRole("heading", { name: "What’s on your mind?" }),
        ).toBeVisible();
        await page.waitForFunction(
            () =>
                Number(
                    document
                        .querySelector("canvas")
                        ?.getAttribute("data-frames"),
                ) > 1,
        );
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
        await page.screenshot({
            path: test.info().outputPath(`home-${viewport.width}.png`),
            fullPage: true,
        });
    }
    await page.getByRole("button", { name: "Open command menu" }).click();
    await page.getByLabel("Search destinations").fill("Settings");
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "Settings" })
        .click();
    await expect(
        page.getByRole("heading", { name: "Your space. Your control." }),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: "Reduced motion" }).check();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    expect(errors).toEqual([]);
});
test("explicit synthetic contract renders response, provenance, activity and clear confirmation", async ({
    page,
}) => {
    const received: Record<string, unknown>[] = [];
    await page.route("**/api/conversation", async (route) => {
        const body = route.request().postDataJSON();
        received.push(body);
        await route.fulfill({
            json: {
                result:
                    body.phase === "begin"
                        ? {
                              challengeId: "fixture-challenge",
                              devicePayload: "fixture-binding",
                              bindingDigest: "a".repeat(64),
                          }
                        : fixtureResult,
            },
        });
    });
    await page.goto("/");
    await page.getByLabel("Message JARVIS").fill("Fixture question");
    await page.getByRole("button", { name: "Send", exact: false }).click();
    await expect(
        page.getByText(fixtureResult.response, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/This is a synthetic response/)).toBeVisible();
    expect(received).toHaveLength(2);
    expect(received[1]).toHaveProperty("proof.signature");
    expect(received[1]).not.toHaveProperty("token");
    expect(received[1]).not.toHaveProperty("ownerId");
    await page.getByText("Source & activity", { exact: true }).click();
    await expect(
        page.getByText("ui-test-fixture", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Activities", exact: true }).click();
    await page.getByText("Request 1", { exact: true }).click();
    await expect(
        page.getByText(fixtureResult.response, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Clear page", exact: true }).click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "Keep conversation" })
        .click();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(
        page.getByText(fixtureResult.response, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Clear page", exact: true }).click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "Clear page", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "What’s on your mind?" }),
    ).toBeVisible();
    await expect(
        page.getByText(fixtureResult.response, { exact: true }),
    ).toHaveCount(0);
});
test("authentication errors are visible and do not invent an answer", async ({
    page,
}) => {
    await page.route("**/api/conversation", (route) =>
        route.fulfill({ status: 403, json: { error: "SESSION_INVALID" } }),
    );
    await page.goto("/");
    await page.getByLabel("Message JARVIS").fill("Denied request");
    await page.getByRole("button", { name: "Send", exact: false }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "Sign in on this device",
    );
    await expect(
        page.getByRole("button", { name: "Send", exact: false }),
    ).toBeDisabled();
    await expect(
        page.getByText("SESSION_INVALID", { exact: true }),
    ).toBeVisible();
});

test("read-aloud is explicit, local-voice only and stops on navigation", async ({
    page,
}) => {
    await page.addInitScript(() => {
        const state = {
            calls: [] as { text: string; local: boolean }[],
            cancelled: 0,
        };
        Object.defineProperty(window, "__speechFixture", { value: state });
        class FixtureUtterance {
            text: string;
            voice: { localService: boolean } | null = null;
            lang = "";
            onstart: (() => void) | null = null;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;
            constructor(text: string) {
                this.text = text;
            }
        }
        Object.defineProperty(window, "SpeechSynthesisUtterance", {
            value: FixtureUtterance,
            configurable: true,
        });
        const voices = [
            {
                voiceURI: "remote",
                name: "Remote fixture",
                lang: "en",
                localService: false,
            },
            {
                voiceURI: "local",
                name: "Device fixture",
                lang: "en",
                localService: true,
            },
        ];
        Object.defineProperty(window, "speechSynthesis", {
            value: {
                getVoices: () => voices,
                addEventListener() {},
                removeEventListener() {},
                speak: (utterance: FixtureUtterance) => {
                    state.calls.push({
                        text: utterance.text,
                        local: utterance.voice?.localService === true,
                    });
                    utterance.onstart?.();
                },
                cancel: () => {
                    state.cancelled++;
                },
            },
            configurable: true,
        });
    });
    await page.route("**/api/conversation", (route) =>
        route.fulfill({
            json: {
                result:
                    route.request().postDataJSON().phase === "begin"
                        ? {
                              challengeId: "fixture",
                              devicePayload: "fixture",
                              bindingDigest: "a".repeat(64),
                          }
                        : fixtureResult,
            },
        }),
    );
    await page.goto("/");
    await page.getByLabel("Message JARVIS").fill("Fixture");
    await page.getByRole("button", { name: "Send", exact: false }).click();
    const fixture = () =>
        page.evaluate(
            () =>
                (
                    window as unknown as {
                        __speechFixture: {
                            calls: { text: string; local: boolean }[];
                            cancelled: number;
                        };
                    }
                ).__speechFixture,
        );
    await expect(
        page.getByRole("button", { name: "Read aloud", exact: true }),
    ).toBeEnabled();
    expect((await fixture()).calls).toHaveLength(0);
    await page.getByRole("button", { name: "Read aloud", exact: true }).click();
    await expect(
        page.getByText("Speaking on this device", { exact: true }),
    ).toBeVisible();
    expect((await fixture()).calls).toEqual([
        { text: fixtureResult.response, local: true },
    ]);
    await page
        .getByRole("button", { name: "Stop reading", exact: true })
        .click();
    expect((await fixture()).cancelled).toBe(1);
    await page.getByRole("button", { name: "Read aloud", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    expect((await fixture()).cancelled).toBe(2);
    await expect(
        page.getByRole("combobox", { name: "Read-aloud voice" }),
    ).toHaveValue("local");
    await expect(
        page
            .getByRole("combobox", { name: "Read-aloud voice" })
            .locator("option"),
    ).toHaveCount(1);
});
