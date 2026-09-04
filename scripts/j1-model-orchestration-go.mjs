import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await read(path));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");
try {
    if (process.env.J1_3_CI_SEQUENCE !== "complete")
        throw new Error("J1_3_REAL_STACK_SEQUENCE_NOT_ATTESTED");
    const [
        gates,
        runtime,
        roadmap,
        architecture,
        contracts,
        security,
        modelsIndex,
        modelContracts,
    ] = await Promise.all([
        json("tests/acceptance/j1.3-gates.json"),
        read("packages/core/src/model-orchestration.ts"),
        read("docs/roadmap/j1.3.md"),
        read("docs/architecture/j1-model-orchestration-architecture.md"),
        read("docs/contracts/j1-model-orchestration-contracts.md"),
        read("docs/security/j1-model-orchestration-security.md"),
        read("packages/models/src/index.ts"),
        read("packages/models/src/j06-contracts.ts"),
    ]);
    const checks = {
        A:
            gates.milestone === "J1.3" &&
            gates.baseline === "2e2302a9aa8553e4971db21842c858098183a233" &&
            gates.gates.length === 20 &&
            JSON.stringify(gates.gates.map((gate) => gate.id)) ===
                JSON.stringify(letters),
        B:
            architecture.includes("replaceable brains") &&
            architecture.includes("provider-neutral") &&
            runtime.includes("ModelRouter"),
        C:
            roadmap.includes("provider/model registry") &&
            runtime.includes("validRuntimePolicy") &&
            modelContracts.includes("ModelRoutingStrategySchema"),
        D:
            architecture.includes("eligible model") &&
            architecture.includes("capability") &&
            runtime.includes("requiredCapabilities"),
        E:
            architecture.includes("deterministic") &&
            runtime.includes("router.select") &&
            modelContracts.includes("cheapest-eligible") &&
            modelContracts.includes("pinned"),
        F:
            runtime.includes("CLASS_RANK") &&
            runtime.includes("D5") &&
            runtime.includes("external-ai") &&
            security.includes("Privacy and disclosure"),
        G:
            runtime.includes("MODEL_BUDGET_EXCEEDED") &&
            runtime.includes("operationAttemptLimit") &&
            runtime.includes("operationMaxTokens") &&
            runtime.includes("operationMaxCost") &&
            contracts.includes("unknown"),
        H:
            runtime.includes("operationTimeoutMs") &&
            runtime.includes("MODEL_TIMEOUT") &&
            security.includes("Operation deadline"),
        I:
            contracts.includes("attemptsBound") &&
            runtime.includes("operationAttemptLimit") &&
            architecture.includes("Retry count is bounded"),
        J:
            architecture.includes("fallback") &&
            security.includes(
                "Provider locality cannot be broadened by fallback",
            ) &&
            security.includes("Before each new attempt"),
        K:
            runtime.includes("circuit-open") &&
            runtime.includes("J13ProviderHealth") &&
            runtime.includes("afterAttempt"),
        L:
            runtime.includes("MODEL_CANCELLED") &&
            runtime.includes("authorityVerifier.verify") &&
            runtime.includes("beforeAttempt") &&
            security.includes("FREEZE/SHUTDOWN"),
        M:
            runtime.includes("normalizeFailure") &&
            runtime.includes("MODEL_PROVIDER_INVALID_RESPONSE"),
        N:
            modelsIndex.includes("reference-adapter") &&
            architecture.includes("ReferenceModelAdapter"),
        O:
            runtime.includes("operationKey") &&
            runtime.includes("operationDigest") &&
            runtime.includes("correlationId") &&
            runtime.includes("operations"),
        P:
            runtime.includes("J13AuditRecord") &&
            security.includes("prompt bodies") &&
            security.includes("credentials") &&
            security.includes("NEVER_STORE"),
        Q:
            roadmap.includes("J1.1") &&
            roadmap.includes("J1.2") &&
            architecture.includes("ConversationSessionEngine") &&
            architecture.includes("ContextAssembler"),
        R: process.env.J1_3_CI_SEQUENCE === "complete",
        S:
            process.env.J1_3_CI_SEQUENCE === "complete" &&
            runtime.length > 15_000,
        T:
            roadmap.includes("J1.4 response generation") &&
            roadmap.includes("not part of J1.3"),
    };
    const failed = Object.entries(checks)
        .filter(([, value]) => !value)
        .map(([id]) => id);
    const result = {
        milestone: "J1.3",
        result: failed.length ? "FAIL" : "A-T_PASS",
        realStackSequence: true,
        checks,
        failed,
        recommendation: failed.length
            ? "J1.3 DEVELOPMENT GO NOT RECOMMENDED"
            : "J1.3 DEVELOPMENT GO RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.3.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result));
    if (failed.length) process.exitCode = 1;
} catch (error) {
    const result = {
        milestone: "J1.3",
        result: "FAIL",
        realStackSequence: false,
        checks: {},
        failed: [error instanceof Error ? error.message : "UNKNOWN"],
        recommendation: "J1.3 DEVELOPMENT GO NOT RECOMMENDED",
    };
    await writeFile(
        new URL(".jarvis/acceptance/j1.3.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    ).catch(() => {});
    console.error(JSON.stringify(result));
    process.exitCode = 1;
}
