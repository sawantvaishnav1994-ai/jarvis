import { defineConfig } from "@playwright/test";
export default defineConfig({
    testDir: "./tests/home-ui",
    fullyParallel: false,
    retries: 0,
    timeout: 30000,
    use: {
        baseURL: "http://127.0.0.1:3000",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    reporter: [["list"]],
    webServer: {
        command: "npm run start --workspace @jarvis/web",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: false,
        timeout: 60000,
    },
});
