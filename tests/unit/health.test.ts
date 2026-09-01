import { it, expect } from "vitest";
import type { AddressInfo } from "node:net";
import { healthServer } from "../../apps/api/src/health.js";
import { HealthSchema } from "@jarvis/shared";
it("reports real readiness, distinguishes liveness, and exposes no action routes", async () => {
    let healthy = false;
    const server = healthServer(
        "api",
        async () => ({ database: healthy, queue: healthy }),
        20,
    );
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
        let response = await fetch(url + "/health/ready");
        expect(response.status).toBe(503);
        expect(HealthSchema.parse(await response.json()).status).toBe(
            "unavailable",
        );
        expect((await fetch(url + "/health/live")).status).toBe(200);
        healthy = true;
        response = await fetch(url + "/health/ready");
        expect(response.status).toBe(200);
        expect(response.headers.get("x-jarvis-trace-id")).toMatch(
            /^[a-f0-9]{32}$/,
        );
        expect((await fetch(url + "/tools")).status).toBe(404);
        expect(
            (await fetch(url + "/v1/status", { method: "POST" })).status,
        ).toBe(405);
    } finally {
        server.closeAllConnections();
        await new Promise<void>((ok) => server.close(() => ok()));
    }
});
it("turns a failed dependency probe into unavailable, without leaking errors", async () => {
    const server = healthServer("api", async () => {
        throw new Error("private database credentials");
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    try {
        const response = await fetch(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}/health/ready`,
        );
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("credentials");
    } finally {
        server.closeAllConnections();
        await new Promise<void>((ok) => server.close(() => ok()));
    }
});
