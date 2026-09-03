import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        reporters: ["default", "json"],
        outputFile: ".jarvis/acceptance/integration.json",
        include: ["tests/integration/**/*.test.ts"],
        testTimeout: 20000,
        hookTimeout: 30000,
        fileParallelism: false,
    },
});
