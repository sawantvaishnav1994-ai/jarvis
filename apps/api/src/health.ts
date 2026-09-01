import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { HealthSchema, operationalLogger, type Health } from "@jarvis/shared";
export function healthServer(
    service: "api" | "worker",
    probe: () => Promise<Record<string, boolean>>,
    limit = 120,
): Server {
    const log = operationalLogger(service);
    let windowStart = Date.now(),
        count = 0;
    const server = createServer(async (req, res) => {
        const traceId = randomBytes(16).toString("hex");
        const started = Date.now();
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        res.setHeader("x-content-type-options", "nosniff");
        res.setHeader("x-jarvis-trace-id", traceId);
        if (Date.now() - windowStart >= 60000) {
            windowStart = Date.now();
            count = 0;
        }
        if (++count > limit) {
            res.writeHead(429);
            res.end(JSON.stringify({ error: "RATE_LIMITED" }));
            return;
        }
        if (req.method !== "GET") {
            res.writeHead(405, { allow: "GET" });
            res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
            return;
        }
        const path = req.url?.split("?")[0];
        if (
            !["/health/live", "/health/ready", "/v1/status"].includes(
                path ?? "",
            )
        ) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: "NOT_FOUND" }));
            return;
        }
        let checks: Record<string, boolean> = { process: true };
        if (path !== "/health/live") {
            try {
                checks = await probe();
            } catch {
                checks = { dependencies: false };
            }
        }
        const status = Object.values(checks).every(Boolean)
            ? "ok"
            : "unavailable";
        const health: Health = HealthSchema.parse({
            service,
            status,
            version: "0.3.0",
            environment: "development",
            checks,
        });
        res.writeHead(status === "ok" ? 200 : 503);
        res.end(JSON.stringify(health));
        log("request.completed", {
            traceId,
            durationMs: Date.now() - started,
            status,
        });
    });
    server.headersTimeout = 5000;
    server.requestTimeout = 5000;
    return server;
}
