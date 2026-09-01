import { setTimeout as delay } from "node:timers/promises";
const deadline = Date.now() + 90000;
let ready = false;
while (Date.now() < deadline) {
    try {
        const responses = await Promise.all(
            [4000, 4001, 3000].map((p) =>
                fetch(
                    `http://127.0.0.1:${p}/${p === 3000 ? "api/health" : "health/ready"}`,
                    { signal: AbortSignal.timeout(2000) },
                ),
            ),
        );
        if (responses.every((r) => r.ok)) {
            ready = true;
            break;
        }
    } catch {
        /* waiting */
    }
    await delay(1000);
}
if (!ready) {
    console.error("STACK_READINESS_FAILED");
    process.exitCode = 1;
}
