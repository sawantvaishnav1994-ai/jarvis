import {
    initializeDevelopmentVault,
    ensureIdentitySecrets,
    ensureStorageSecrets,
} from "@jarvis/security";
import { runtime, fail } from "./runtime.mjs";
try {
    const r = await runtime("jarvis-setup");
    console.log(
        JSON.stringify({
            secrets: await initializeDevelopmentVault(r.vaultPath, r.keyPath),
        }),
    );
    await ensureIdentitySecrets(r.vaultPath, r.keyPath);
    await ensureStorageSecrets(r.vaultPath, r.keyPath);
} catch {
    fail("SECRET_INITIALIZATION_FAILED");
}
