import { runtime, readSecret, run, fail } from "./runtime.mjs";
const action = process.argv[2];
try {
    if (!["up", "down"].includes(action)) throw new Error("Invalid action");
    const r = await runtime("jarvis-infrastructure", [
        "development/database/migrator",
        "development/redis/runtime",
    ]);
    const password = await readSecret(
        r.secrets,
        r.actor,
        r.config.storage.postgres.migratorPasswordRef,
    );
    const redis = await readSecret(
        r.secrets,
        r.actor,
        r.config.events.passwordRef,
    );
    await run(
        "docker",
        [
            "compose",
            "-f",
            "infrastructure/docker/compose.dev.yml",
            ...(action === "up"
                ? ["up", "-d", "--wait", "--wait-timeout", "90"]
                : ["down"]),
        ],
        {
            env: {
                ...process.env,
                JARVIS_POSTGRES_PASSWORD: password,
                JARVIS_REDIS_PASSWORD: redis,
            },
        },
    );
} catch {
    fail("LOCAL_INFRASTRUCTURE_UNAVAILABLE");
}
