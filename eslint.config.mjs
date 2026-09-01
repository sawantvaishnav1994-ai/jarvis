import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
    {
        ignores: [
            "**/dist/**",
            "**/.next/**",
            "**/node_modules/**",
            "**/next-env.d.ts",
        ],
    },
    {
        ...js.configs.recommended,
        files: ["**/*.mjs"],
        languageOptions: {
            globals: {
                console: "readonly",
                process: "readonly",
                Buffer: "readonly",
                URL: "readonly",
                fetch: "readonly",
                AbortSignal: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
            },
        },
    },
    ...tseslint.configs.recommended.map((c) => ({
        ...c,
        files: ["**/*.ts", "**/*.tsx"],
    })),
    {
        files: ["**/*.ts", "**/*.tsx"],
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
        },
    },
);
