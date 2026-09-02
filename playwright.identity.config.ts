import { defineConfig } from "@playwright/test";
export default defineConfig({
    testDir: "./tests/identity-e2e",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 360000,
    // This flow handles disposable secrets. Never record traces, videos or screenshots.
    use: {
        baseURL: "http://localhost:3000",
        actionTimeout: 15000,
        navigationTimeout: 15000,
        browserName: "chromium",
        trace: "off",
        screenshot: "off",
        video: "off",
    },
    reporter: [["list"]],
});
