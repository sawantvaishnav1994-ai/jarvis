import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        reporters: ["default", "json"],
        outputFile: ".jarvis/acceptance/unit.json",
        include: [
            "tests/unit/**/*.test.ts",
            "tests/contracts/**/*.test.ts",
            "tests/security/**/*.test.ts",
        ],
        testTimeout: 10000,
        hookTimeout: 10000,
        restoreMocks: true,
    },
});
