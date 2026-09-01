import { setTimeout as delay } from "node:timers/promises";
const deadline = Date.now() + 10000;
let stopped = false;
while (Date.now() < deadline) {
    const results = await Promise.all(
        [3000, 4000, 4001].map(async (port) => {
            try {
                await fetch(`http://127.0.0.1:${port}/health/live`, {
                    signal: AbortSignal.timeout(500),
                });
                return false;
            } catch {
                return true;
            }
        }),
    );
    if (results.every(Boolean)) {
        stopped = true;
        break;
    }
    await delay(100);
}
if (!stopped) {
    console.error("SERVICE_STOP_FAILED");
    process.exitCode = 1;
} else console.log("SERVICE_STOP_PASSED");
