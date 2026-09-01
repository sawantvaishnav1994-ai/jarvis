import { z } from "zod";
import { trace } from "@opentelemetry/api";
export const EnvironmentSchema = z.enum([
    "development",
    "staging",
    "production",
]);
export type Environment = z.infer<typeof EnvironmentSchema>;
export const IdentifierSchema = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
export const PrivacySchema = z.enum([
    "local-only",
    "private-cloud",
    "ai-allow",
]);
export const RetentionSchema = z.enum(["persist", "temporary", "never-store"]);
export const ContractVersionSchema = z.literal(1);
export const JsonValueSchema: z.ZodType<unknown> = z.json();
export const TraceSchema = z.strictObject({
    traceId: z.string().regex(/^[0-9a-f]{32}$/),
    spanId: z.string().regex(/^[0-9a-f]{16}$/),
});
export type TraceContext = z.infer<typeof TraceSchema>;
export const HealthSchema = z.strictObject({
    service: z.enum(["api", "worker", "web"]),
    status: z.enum(["ok", "unavailable"]),
    version: z.literal("0.3.0"),
    environment: EnvironmentSchema,
    checks: z.record(z.string(), z.boolean()),
});
export type Health = z.infer<typeof HealthSchema>;
export class BoundaryError extends Error {
    constructor(readonly code: string) {
        super(code);
        this.name = "BoundaryError";
    }
}
export const tracer = trace.getTracer("jarvis-foundation", "0.3.0");
export type LogFields = {
    traceId?: string;
    spanId?: string;
    durationMs?: number;
    status?: string;
    code?: string;
};
const LogServiceSchema = z.enum([
    "api",
    "worker",
    "web",
    "setup",
    "supervisor",
]);
const LogEventSchema = z.enum([
    "service.started",
    "request.completed",
    "configuration.invalid",
    "job.completed",
    "job.failed",
    "dependency.unavailable",
]);
export function operationalLogger(
    service: string,
    sink: (line: string) => void = (line) => console.log(line),
) {
    return (event: string, fields: LogFields = {}) => {
        const safe: Record<string, string | number> = {
            time: new Date().toISOString(),
            service: LogServiceSchema.parse(service),
            event: LogEventSchema.parse(event),
        };
        for (const k of [
            "traceId",
            "spanId",
            "durationMs",
            "status",
            "code",
        ] as const) {
            const v = fields[k];
            if (
                v !== undefined &&
                (typeof v === "number"
                    ? Number.isFinite(v)
                    : /^[a-zA-Z0-9._:-]{1,128}$/.test(v))
            )
                safe[k] = v;
        }
        sink(JSON.stringify(safe));
    };
}
