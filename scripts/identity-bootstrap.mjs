import { runtime, readSecret, fail } from "./runtime.mjs";
try {
    const { actor, secrets } = await runtime("jarvis-owner-bootstrap", [
        "development/identity/bootstrap",
    ]);
    if (!process.stdout.isTTY)
        throw new Error("Interactive owner terminal required");
    const value = await readSecret(
        secrets,
        actor,
        "development/identity/bootstrap",
    );
    console.log("Local installation claim code. Do not share or commit it:");
    console.log(value);
    console.log(
        "Open http://localhost:3000/identity and create your owner passkey. This code cannot replace an existing owner.",
    );
} catch {
    fail("INTERACTIVE_BOOTSTRAP_REQUIRED");
}
