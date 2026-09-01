import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { ConfigSchema, requireDevelopment } from "@jarvis/config";
const config = JSON.parse(await readFile("config/development.json", "utf8"));
describe("validated environment boundaries", () => {
    it("accepts the development template and refuses unknown configuration", () => {
        expect(ConfigSchema.parse(config).environment).toBe("development");
        expect(() =>
            ConfigSchema.parse({ ...config, unexpected: true }),
        ).toThrow();
    });
    it("refuses external actions, cloud models and content logging", () => {
        for (const [section, key] of [
            ["security", "allowExternalActions"],
            ["models", "allowCloud"],
            ["logging", "includeContent"],
        ])
            expect(() =>
                ConfigSchema.parse({
                    ...config,
                    [section!]: { ...config[section!], [key!]: true },
                }),
            ).toThrow();
    });
    it("rejects a production secret reference in development", () => {
        expect(() =>
            ConfigSchema.parse({
                ...config,
                events: {
                    ...config.events,
                    passwordRef: "production/redis/runtime",
                },
            }),
        ).toThrow();
    });
    it("reserves staging and production without allowing unauthenticated startup", async () => {
        for (const env of ["staging", "production"]) {
            const c = ConfigSchema.parse(
                JSON.parse(await readFile(`config/${env}.json`, "utf8")),
            );
            expect(() => requireDevelopment(c)).toThrow(
                "ENVIRONMENT_NOT_ENABLED",
            );
        }
    });
    it("rejects shared ports and cross-environment database names", () => {
        expect(() =>
            ConfigSchema.parse({
                ...config,
                api: { ...config.api, port: 3000 },
            }),
        ).toThrow();
        expect(() =>
            ConfigSchema.parse({
                ...config,
                storage: {
                    ...config.storage,
                    postgres: {
                        ...config.storage.postgres,
                        database: "jarvis_production",
                    },
                },
            }),
        ).toThrow();
    });
});
