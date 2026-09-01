import { readFile } from "node:fs/promises";
import { z } from "zod";
import { EnvironmentSchema, BoundaryError } from "@jarvis/shared";
const ref = z
    .string()
    .regex(/^(development|staging|production)\/[a-z0-9./-]+$/);
export const ConfigSchema = z
    .strictObject({
        version: z.literal(1),
        environment: EnvironmentSchema,
        api: z.strictObject({
            host: z.literal("127.0.0.1"),
            port: z.number().int().min(1024).max(65535),
        }),
        worker: z.strictObject({
            host: z.literal("127.0.0.1"),
            port: z.number().int().min(1024).max(65535),
            concurrency: z.number().int().min(1).max(4),
        }),
        web: z.strictObject({
            host: z.literal("127.0.0.1"),
            port: z.literal(3000),
        }),
        storage: z.strictObject({
            kind: z.literal("postgres"),
            postgres: z.strictObject({
                host: z.enum(["127.0.0.1", "localhost"]),
                port: z.number().int().min(1024).max(65535),
                database: z.string(),
                runtimeUser: z.string(),
                migratorUser: z.string(),
                passwordRef: ref,
                migratorPasswordRef: ref,
            }),
            encryptionKeyRef: ref,
            objectStore: z.literal("disabled"),
        }),
        events: z.strictObject({
            transport: z.literal("redis"),
            host: z.enum(["127.0.0.1", "localhost"]),
            port: z.number().int().min(1024).max(65535),
            passwordRef: ref,
        }),
        models: z.strictObject({
            providers: z.array(z.enum(["mock-a", "mock-b"])).min(1),
            allowCloud: z.literal(false),
        }),
        privacy: z.strictObject({
            default: z.literal("local-only"),
            retainRequests: z.literal(false),
        }),
        memory: z.strictObject({
            enabled: z.literal(false),
            temporaryTtlSeconds: z.number().int().min(1).max(86400),
        }),
        security: z.strictObject({
            mode: z.literal("safe"),
            allowExternalActions: z.literal(false),
            authentication: z.literal("not-enabled"),
            requireAudit: z.literal(true),
        }),
        tools: z.strictObject({ enabled: z.literal(false) }),
        agents: z.strictObject({
            enabled: z.literal(false),
            maxPersistentAgents: z.literal(0),
        }),
        logging: z.strictObject({
            level: z.enum(["info", "warn", "error"]),
            includeContent: z.literal(false),
        }),
        devices: z.strictObject({ enrollmentEnabled: z.literal(false) }),
        budgets: z.strictObject({ maxRequestCost: z.literal(0) }),
        rateLimits: z.strictObject({
            requestsPerMinute: z.number().int().min(1).max(600),
        }),
    })
    .superRefine((v, ctx) => {
        const prefix = v.environment + "/";
        for (const secret of [
            v.storage.postgres.passwordRef,
            v.storage.postgres.migratorPasswordRef,
            v.storage.encryptionKeyRef,
            v.events.passwordRef,
        ])
            if (!secret.startsWith(prefix))
                ctx.addIssue({
                    code: "custom",
                    message: "Cross-environment secret reference",
                });
        if (
            v.storage.postgres.database !== "jarvis_" + v.environment ||
            v.storage.postgres.runtimeUser !==
                "jarvis_" + v.environment + "_runtime" ||
            v.storage.postgres.migratorUser !==
                "jarvis_" + v.environment + "_migrator"
        )
            ctx.addIssue({
                code: "custom",
                message: "Cross-environment database identity",
            });
        if (
            new Set([
                v.api.port,
                v.worker.port,
                v.web.port,
                v.storage.postgres.port,
                v.events.port,
            ]).size !== 5
        )
            ctx.addIssue({ code: "custom", message: "Ports must be distinct" });
    });
export type JarvisConfig = z.infer<typeof ConfigSchema>;
export async function loadConfig(
    path = "config/development.json",
): Promise<JarvisConfig> {
    try {
        return ConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
    } catch {
        throw new BoundaryError("INVALID_CONFIGURATION");
    }
}
export function requireDevelopment(config: JarvisConfig): void {
    if (config.environment !== "development")
        throw new BoundaryError("ENVIRONMENT_NOT_ENABLED");
}
