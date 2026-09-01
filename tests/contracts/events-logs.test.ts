import { randomUUID } from "node:crypto";
import { it, expect } from "vitest";
import { EventSchema, FoundationJobSchema } from "@jarvis/events";
import { operationalLogger } from "@jarvis/shared";
import { owner } from "../fixtures/foundation.js";
it("rejects unknown event versions and mismatched actors", () => {
    const event = {
        version: 1,
        id: randomUUID(),
        type: "memory.created",
        source: "jarvis.core",
        timestamp: new Date().toISOString(),
        actor: owner,
        environment: "development",
        data: {},
        sensitivity: "local-only",
        correlationId: "request-test",
    };
    expect(EventSchema.parse(event)).toEqual(event);
    for (const altered of [
        { ...event, version: 2 },
        { ...event, environment: "production" },
        { ...event, type: "invalid" },
    ])
        expect(() => EventSchema.parse(altered)).toThrow();
    expect(() =>
        FoundationJobSchema.parse({
            version: 1,
            type: "tool.execute",
            environment: "development",
            correlationId: randomUUID(),
        }),
    ).toThrow();
});
it("logs only reviewed labels and metadata, without arbitrary payloads", () => {
    const lines: string[] = [];
    const log = operationalLogger("api", (line) => lines.push(line));
    log("request.completed", {
        status: "ok",
        ...{ password: "do-not-log", prompt: "do-not-log" },
    });
    expect(JSON.parse(lines[0]!)).toMatchObject({
        service: "api",
        event: "request.completed",
        status: "ok",
    });
    expect(lines[0]).not.toContain("do-not-log");
    expect(() => log("secret raw text")).toThrow();
});
