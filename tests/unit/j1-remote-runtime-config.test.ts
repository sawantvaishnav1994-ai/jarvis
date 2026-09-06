import { afterEach, describe, expect, it } from "vitest";
import { ConfigSchema, runtimeIdentity } from "@jarvis/config";

const config = ConfigSchema.parse({
    version: 1,
    environment: "development",
    api: { host: "127.0.0.1", port: 4000 },
    worker: { host: "127.0.0.1", port: 4001, concurrency: 1 },
    web: { host: "127.0.0.1", port: 3000 },
    storage: {
        kind: "postgres",
        postgres: {
            host: "127.0.0.1",
            port: 5433,
            database: "jarvis_development",
            runtimeUser: "jarvis_development_runtime",
            migratorUser: "jarvis_development_migrator",
            passwordRef: "development/postgres/runtime",
            migratorPasswordRef: "development/postgres/migrator",
        },
        encryptionKeyRef: "development/storage/data-key",
        objectStore: "disabled",
    },
    events: {
        transport: "redis",
        host: "127.0.0.1",
        port: 6380,
        passwordRef: "development/redis/runtime",
    },
    models: { providers: ["mock-a"], allowCloud: false },
    privacy: { default: "local-only", retainRequests: false },
    memory: { enabled: false, temporaryTtlSeconds: 3600 },
    security: {
        mode: "safe",
        allowExternalActions: false,
        authentication: "passkey",
        requireAudit: true,
    },
    tools: { enabled: false },
    agents: { enabled: false, maxPersistentAgents: 0 },
    logging: { level: "info", includeContent: false },
    identity: {
        rpID: "localhost",
        origin: "http://localhost:3000",
        bootstrapRef: "development/identity/bootstrap",
        webTransportRef: "development/identity/web-transport",
    },
    devices: { enrollmentEnabled: true },
    budgets: { maxRequestCost: 0 },
    rateLimits: { requestsPerMinute: 60 },
});

const originalOrigin = process.env.JARVIS_REMOTE_ORIGIN;
const originalRpID = process.env.JARVIS_REMOTE_RP_ID;

afterEach(() => {
    if (originalOrigin === undefined) delete process.env.JARVIS_REMOTE_ORIGIN;
    else process.env.JARVIS_REMOTE_ORIGIN = originalOrigin;
    if (originalRpID === undefined) delete process.env.JARVIS_REMOTE_RP_ID;
    else process.env.JARVIS_REMOTE_RP_ID = originalRpID;
});

describe("J1.13 secure remote identity configuration", () => {
    it("preserves the frozen localhost identity when remote mode is absent", () => {
        delete process.env.JARVIS_REMOTE_ORIGIN;
        delete process.env.JARVIS_REMOTE_RP_ID;
        expect(runtimeIdentity(config)).toEqual(config.identity);
    });

    it("accepts only one exact HTTPS origin whose hostname equals the RP ID", () => {
        process.env.JARVIS_REMOTE_ORIGIN = "https://jarvis.example.com";
        process.env.JARVIS_REMOTE_RP_ID = "jarvis.example.com";
        expect(runtimeIdentity(config)).toEqual({
            ...config.identity,
            origin: "https://jarvis.example.com",
            rpID: "jarvis.example.com",
        });
    });

    it.each([
        ["http://jarvis.example.com", "jarvis.example.com"],
        ["https://jarvis.example.com/path", "jarvis.example.com"],
        ["https://jarvis.example.com:443", "jarvis.example.com"],
        ["https://jarvis.example.com", "other.example.com"],
        ["https://localhost", "localhost"],
        ["https://user@jarvis.example.com", "jarvis.example.com"],
    ])("fails closed for invalid remote origin %s / RP ID %s", (origin, rpID) => {
        process.env.JARVIS_REMOTE_ORIGIN = origin;
        process.env.JARVIS_REMOTE_RP_ID = rpID;
        expect(() => runtimeIdentity(config)).toThrow("INVALID_REMOTE_IDENTITY");
    });

    it("fails closed when only one remote identity variable is present", () => {
        process.env.JARVIS_REMOTE_ORIGIN = "https://jarvis.example.com";
        delete process.env.JARVIS_REMOTE_RP_ID;
        expect(() => runtimeIdentity(config)).toThrow("INVALID_REMOTE_IDENTITY");
    });
});
