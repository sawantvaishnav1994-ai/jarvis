/* global window, document */
import { _electron as electron, expect } from "@playwright/test";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
const output = resolve(
    process.env.JARVIS_NATIVE_EVIDENCE_DIR ||
        ".jarvis/acceptance/presence-native",
);
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), "jarvis-presence-native-"));
const bootstrap = resolve(profile, "launch.cjs");
await writeFile(
    bootstrap,
    `const {app}=require('electron'); app.setPath('userData',${JSON.stringify(profile)}); import(${JSON.stringify(pathToFileURL(resolve("apps/desktop/presence/main.mjs")).href)});`,
);
let application;
const started = performance.now();
const evidence = {
    version: 1,
    platform: process.platform,
    commit: process.env.GITHUB_SHA || null,
    checks: [],
    limitations: [
        "Virtual runner: not target-laptop battery/GPU certification.",
        "State events below are explicit test fixtures, not a live voice session.",
        "Real microphone permission and physical multi-monitor tests remain pending.",
    ],
};
try {
    application = await electron.launch({
        args: [bootstrap],
        chromiumSandbox: true,
        timeout: 30000,
    });
    const page = await application.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => Boolean(window.jarvisPresence));
    await page.waitForFunction(
        () => Number(document.querySelector("canvas").dataset.frames) > 1,
    );
    await expect(page.locator("#core")).toBeVisible();
    await expect(page.locator("#panel")).toBeHidden();
    const native = await application.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        const preferences = win.webContents.getLastWebPreferences();
        return {
            bounds: win.getBounds(),
            topmost: win.isAlwaysOnTop(),
            background: win.getBackgroundColor(),
            sandbox: preferences.sandbox,
            contextIsolation: preferences.contextIsolation,
            nodeIntegration: preferences.nodeIntegration,
            windowCount: BrowserWindow.getAllWindows().length,
        };
    });
    expect(native.topmost).toBe(true);
    expect(native.sandbox).toBe(true);
    expect(native.contextIsolation).toBe(true);
    expect(native.nodeIntegration).toBe(false);
    expect(native.bounds.width).toBeLessThanOrEqual(140);
    expect(native.bounds.height).toBeLessThanOrEqual(140);
    expect(native.windowCount).toBe(1);
    expect(native.background).toMatch(/^#00/);
    evidence.native = native;
    evidence.startupObservedMs = performance.now() - started;
    evidence.checks.push("small native window and sandbox boundaries");
    await page.locator("#core").click();
    await expect(page.locator("#panel")).toBeVisible();
    await page.locator("#motion").check();
    await expect(page.locator("#motion")).toBeChecked();
    await page.locator("#contrast").check();
    await expect(page.locator("body")).toHaveClass(/contrast/);
    await page.locator("#contrast").uncheck();
    await page.locator("#motion").uncheck();
    await page.locator("#collapse").click();
    await expect(page.locator("#panel")).toBeHidden();
    evidence.checks.push("real click controls and accessibility toggles");
    for (const [index, state] of [
        "idle",
        "listening",
        "reasoning",
        "responding",
    ].entries()) {
        await application.evaluate(
            (_electron, event) => process.emit("message", event),
            {
                version: 1,
                type: `presence.${state}`,
                sequence: index + 1,
                runId: "ci-fixture",
                at: Date.now(),
                amplitude: state === "idle" ? 0 : 0.5,
            },
        );
        const text = {
            idle: "Idle",
            listening: "Listening",
            reasoning: "Thinking",
            responding: "Speaking",
        }[state];
        await expect(page.locator("#core")).toHaveAttribute(
            "aria-label",
            new RegExp(text),
        );
        await page.screenshot({
            path: resolve(output, `${state}.png`),
            omitBackground: true,
        });
    }
    evidence.checks.push("semantic fixtures reach real renderer");
    const capture = await application.evaluate(async ({ BrowserWindow }) => {
        const im =
            await BrowserWindow.getAllWindows()[0].webContents.capturePage();
        const bitmap = im.toBitmap();
        let visible = 0,
            transparent = 0;
        for (let i = 3; i < bitmap.length; i += 4) {
            if (bitmap[i] === 0) transparent++;
            else visible++;
        }
        return {
            visible,
            transparent,
            width: im.getSize().width,
            height: im.getSize().height,
        };
    });
    expect(capture.visible).toBeGreaterThan(10);
    expect(capture.transparent).toBeGreaterThan(10);
    evidence.capture = capture;
    evidence.checks.push("rendered pixels with transparent alpha");
    await page.evaluate(() => window.jarvisPresence.command("size", 120));
    expect(
        await application.evaluate(
            ({ BrowserWindow }) =>
                BrowserWindow.getAllWindows()[0].getBounds().width,
        ),
    ).toBe(120);
    await page.evaluate(() => window.jarvisPresence.command("hide"));
    expect(
        await application.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].isVisible(),
        ),
    ).toBe(false);
    await application.evaluate(({ app }) => app.emit("second-instance"));
    await expect
        .poll(
            () =>
                application.evaluate(({ BrowserWindow }) =>
                    BrowserWindow.getAllWindows()[0].isVisible(),
                ),
            { message: "Native window restores after hide" },
        )
        .toBe(true);
    await expect(page.locator("#core")).toBeVisible();
    evidence.checks.push("resize, hide and restore");
    await application.evaluate(({ dialog }) => {
        globalThis.resolveConsent = null;
        dialog.showMessageBox = () =>
            new Promise((resolve) => {
                globalThis.resolveConsent = resolve;
            });
    });
    await page.evaluate(() => {
        window.consentAttempt = window.jarvisPresence.command(
            "microphone",
            true,
        );
    });
    await expect
        .poll(() =>
            application.evaluate(() => Boolean(globalThis.resolveConsent)),
        )
        .toBe(true);
    await page.evaluate(() => window.jarvisPresence.command("hide"));
    await application.evaluate(() =>
        globalThis.resolveConsent({ response: 1 }),
    );
    expect(await page.evaluate(() => window.consentAttempt)).toBe(false);
    await application.evaluate(({ app }) => app.emit("second-instance"));
    await expect
        .poll(
            () =>
                application.evaluate(({ BrowserWindow }) =>
                    BrowserWindow.getAllWindows()[0].isVisible(),
                ),
            { message: "Native window restores after cancelled consent" },
        )
        .toBe(true);
    evidence.checks.push("late microphone consent cannot outlive hide");

    await page.evaluate(() => window.jarvisPresence.command("expand", true));
    const reportPromise = page.waitForEvent("console", {
        predicate: (message) =>
            message.type() === "info" &&
            message.text().startsWith("JARVIS presence performance"),
    });
    await page.locator("#metrics").click();
    const report = await reportPromise;
    evidence.performance = JSON.parse(
        report.text().slice("JARVIS presence performance ".length),
    );
    expect(errors).toEqual([]);
    evidence.status = "PASS";
} catch (error) {
    evidence.status = "FAIL";
    evidence.error = error instanceof Error ? error.stack : String(error);
    process.exitCode = 1;
} finally {
    if (application) await application.close();
    await rm(profile, { recursive: true, force: true });
    await writeFile(
        resolve(output, "evidence.json"),
        JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence, null, 2));
}
