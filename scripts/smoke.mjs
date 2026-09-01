import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Queue, QueueEvents, queueName } from "@jarvis/events";
import { HealthSchema } from "@jarvis/shared";
import { runtime, readSecret, fail } from "./runtime.mjs";
const { config, actor, secrets } = await runtime("jarvis-smoke", [
    "development/redis/runtime",
]);
const connection = {
    host: config.events.host,
    port: config.events.port,
    password: await readSecret(secrets, actor, config.events.passwordRef),
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
};
const queue = new Queue(queueName(config.environment), { connection });
const events = new QueueEvents(queueName(config.environment), {
    connection: { ...connection, maxRetriesPerRequest: null },
});
queue.on("error", () => {});
events.on("error", () => {});
try {
    for (const url of [
        "http://127.0.0.1:4000/health/ready",
        "http://127.0.0.1:4001/health/ready",
        "http://127.0.0.1:3000/api/health",
    ]) {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(6000),
        });
        assert.equal(response.status, 200);
        assert.equal(HealthSchema.parse(await response.json()).status, "ok");
    }
    await events.waitUntilReady();
    const correlationId = randomUUID();
    const job = await queue.add(
        "foundation.ping",
        {
            version: 1,
            type: "foundation.ping",
            environment: "development",
            correlationId,
        },
        { removeOnComplete: 10, removeOnFail: 10, attempts: 1 },
    );
    const result = await job.waitUntilFinished(events, 15000);
    assert.deepEqual(result, { ok: true, correlationId });
    console.log(
        "JARVIS_SMOKE_PASSED — three health endpoints and real queue worker round trip",
    );
} catch {
    fail("SMOKE_FAILED");
} finally {
    await queue.close();
    await events.close();
}
