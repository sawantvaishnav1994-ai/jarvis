import { test, expect } from "@playwright/test";
test("web shell reflects healthy API, database, queue and worker", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        /A permanent home\s*for your intelligence\./,
    );
    await expect(page.getByText("Available", { exact: true })).toHaveCount(4);
    await expect(page.getByText(/J0.2/)).toBeVisible();
    expect(errors).toEqual([]);
});
test("all service health contracts are available", async ({ request }) => {
    for (const url of [
        "http://127.0.0.1:4000/health/ready",
        "http://127.0.0.1:4001/health/ready",
        "/api/health",
    ]) {
        const response = await request.get(url);
        expect(response.status()).toBe(200);
        expect(await response.json()).toMatchObject({
            status: "ok",
            environment: "development",
            version: "0.3.0",
        });
    }
});
test("API offers no unauthenticated command surface", async ({ request }) => {
    expect(
        (
            await request.post("http://127.0.0.1:4000/v1/tools", {
                data: { tool: "shell" },
            })
        ).status(),
    ).toBe(405);
    expect(
        (await request.get("http://127.0.0.1:4000/v1/memory")).status(),
    ).toBe(404);
});
test("small-screen status remains readable without horizontal scrolling", async ({
    page,
}) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
