import { defineConfig } from "@playwright/test";
export default defineConfig({
    testDir: "./tests/identity-e2e",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    // Includes J0.4 owner-approved write/read/NEVER_STORE while retaining RPC pacing.
    timeout: 600000,
    // A signed owner operation includes several paced RPCs plus WebAuthn.
    // Keep the exact assertions; allow the ceremony to finish under CI load.
    expect: { timeout: 15000 },
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
