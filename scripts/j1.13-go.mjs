import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await read(path));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");
const candidateRef = "validation/j1.13-iphone-pwa-access-20260905";
const normalize = (value) =>
    value.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ");

async function writeResult(result) {
    await mkdir(new URL(".jarvis/acceptance/", root), { recursive: true });
    await writeFile(
        new URL(".jarvis/acceptance/j1.13.json", root),
        `${JSON.stringify(result, null, 2)}\n`,
    );
}

try {
    if (process.env.J1_13_CI_SEQUENCE !== "complete")
        throw new Error("J1_13_REAL_STACK_SEQUENCE_NOT_ATTESTED");

    const [
        gates,
        roadmap,
        manifest,
        layout,
        config,
        remoteStart,
        identityRoute,
        conversationRoute,
        conversationClient,
        identityStorage,
        sessionStorageTest,
        remoteConfigTest,
        workflow,
    ] = await Promise.all([
        json("tests/acceptance/j1.13-gates.json"),
        read("docs/roadmap/j1.13.md"),
        read("apps/web/app/manifest.ts"),
        read("apps/web/app/layout.tsx"),
        read("packages/config/src/index.ts"),
        read("scripts/j1.13-remote-start.mjs"),
        read("apps/web/app/api/identity/route.ts"),
        read("apps/web/app/api/conversation/route.ts"),
        read("apps/web/app/conversation/conversation-console.tsx"),
        read("packages/storage/src/identity.ts"),
        read("tests/unit/j1-remote-identity-session-storage.test.ts"),
        read("tests/unit/j1-remote-runtime-config.test.ts"),
        read(".github/workflows/j1.13-ci.yml"),
    ]);

    const normalizedRoadmap = normalize(roadmap);
    const normalizedWorkflow = normalize(workflow);
    const qualificationRef = process.env.GITHUB_REF_NAME ?? "";
    const onCandidate = qualificationRef === candidateRef;
    const onMain = qualificationRef === "main";
    const qualificationRefValid = onCandidate || onMain;
    const exactMainRequalificationConfigured =
        workflow.includes(`- ${candidateRef}`) && workflow.includes("- main");
    const noProductionCredentialInjection =
        !/\$\{\{\s*secrets\./i.test(workflow) &&
        !/environment:\s*production/i.test(workflow);

    const checks = {
        A:
            gates.milestone === "J1.13" &&
            gates.baseline === "f75ed2d2d712fe32e64eb161a7ecab73dcb34db1" &&
            gates.gates.length === 20 &&
            JSON.stringify(gates.gates.map((gate) => gate.id)) ===
                JSON.stringify(letters),
        B:
            normalizedRoadmap.includes("no client side secrets") ||
            (roadmap.includes("MUST NOT contain local vault material") &&
                !conversationClient.includes("JARVIS_MASTER_KEY") &&
                !conversationClient.includes("JARVIS_VAULT")),
        C:
            config.includes("JARVIS_REMOTE_ORIGIN") &&
            config.includes("JARVIS_REMOTE_RP_ID") &&
            config.includes('origin.protocol !== "https:"') &&
            config.includes("origin.hostname !== remoteRpID") &&
            remoteConfigTest.includes("fails closed"),
        D:
            identityRoute.includes("jarvis_session") &&
            identityRoute.includes("httpOnly: true") &&
            identityRoute.includes("secure: true") &&
            conversationRoute.includes("jarvis_session") &&
            normalizedRoadmap.includes("passkey") &&
            normalizedRoadmap.includes("device proof"),
        E:
            identityStorage.includes("storageId") &&
            identityStorage.includes("session.tokenHash") &&
            sessionStorageTest.includes("stable session id") &&
            sessionStorageTest.includes("legacy token-hash primary key"),
        F:
            conversationClient.includes("conversationSessionId") &&
            conversationClient.includes("deviceProof") &&
            normalizedRoadmap.includes("conversation session") &&
            normalizedRoadmap.includes("security epoch"),
        G:
            manifest.includes('display: "standalone"') &&
            manifest.includes('purpose: "maskable"') &&
            layout.includes('viewportFit: "cover"') &&
            normalizedWorkflow.includes("responsive pwa surface"),
        H:
            identityRoute.includes('headers.get("origin")') &&
            identityRoute.includes("content-type") &&
            conversationRoute.includes('headers.get("origin")') &&
            normalizedWorkflow.includes("unauthorized") &&
            normalizedWorkflow.includes("origin"),
        I:
            conversationClient.includes("bindingDigest") &&
            normalizedWorkflow.includes("replay") &&
            normalizedWorkflow.includes("mutation"),
        J:
            normalizedWorkflow.includes("session expiry") &&
            normalizedWorkflow.includes("device removal") &&
            normalizedWorkflow.includes("security epoch") &&
            normalizedWorkflow.includes("emergency"),
        K:
            remoteStart.includes("CREATE EXTENSION IF NOT EXISTS vector") &&
            remoteStart.includes("6380") &&
            normalizedWorkflow.includes("postgresql") &&
            normalizedWorkflow.includes("redis bullmq"),
        L:
            normalizedWorkflow.includes("model orchestration") &&
            normalizedWorkflow.includes(
                "model tool dependency outage and recovery",
            ),
        M:
            normalizedWorkflow.includes("j1.7 tool aware conversation") &&
            normalizedWorkflow.includes(
                "j1.8 permission approval aware conversation",
            ) &&
            normalizedWorkflow.includes("approval replay race"),
        N:
            normalizedRoadmap.includes("never_store") &&
            normalizedRoadmap.includes("d5") &&
            normalizedRoadmap.includes("protected plaintext"),
        O:
            normalizedRoadmap.includes("audit") &&
            normalizedRoadmap.includes("event") &&
            normalizedWorkflow.includes("audit") &&
            normalizedWorkflow.includes("protected plaintext"),
        P:
            normalizedWorkflow.includes("backup recovery and restart drills") &&
            normalizedRoadmap.includes("session expiry") &&
            normalizedRoadmap.includes("restart") &&
            normalizedRoadmap.includes("recovery"),
        Q:
            normalizedWorkflow.includes(
                "postgresql redis model tool dependency outage and recovery",
            ) && normalizedRoadmap.includes("fail closed"),
        R:
            normalizedRoadmap.includes("real iphone") &&
            normalizedRoadmap.includes("http 200") &&
            normalizedRoadmap.includes("hello jarvis"),
        S:
            process.env.J1_13_CI_SEQUENCE === "complete" &&
            workflow.includes("J0.4") &&
            workflow.includes("J0.12") &&
            workflow.includes("J1.0") &&
            workflow.includes("J1.12"),
        T:
            qualificationRefValid &&
            normalizedRoadmap.includes("no production credentials") &&
            normalizedRoadmap.includes("no scope expansion") &&
            normalizedRoadmap.includes("non force") &&
            normalizedRoadmap.includes("exact main") &&
            exactMainRequalificationConfigured &&
            noProductionCredentialInjection,
    };

    const failed = Object.entries(checks)
        .filter(([, value]) => !value)
        .map(([id]) => id);
    const result = {
        milestone: "J1.13",
        result: failed.length ? "FAIL" : "A-T_PASS",
        realStackSequence: true,
        qualificationRef,
        phase: onMain ? "EXACT_MAIN" : onCandidate ? "CANDIDATE" : "UNKNOWN",
        checks,
        failed,
        recommendation: failed.length
            ? "J1.13 COMPLETE + FROZEN / GO NOT RECOMMENDED"
            : onMain
              ? "J1.13 COMPLETE + FROZEN / GO RECOMMENDED"
              : "J1.13 CANDIDATE QUALIFIED — EXACT-MAIN QUALIFICATION REQUIRED",
    };
    await writeResult(result);
    console.log(JSON.stringify(result));
    if (failed.length) process.exitCode = 1;
} catch (error) {
    const result = {
        milestone: "J1.13",
        result: "FAIL",
        realStackSequence: false,
        checks: {},
        failed: [error instanceof Error ? error.message : "UNKNOWN"],
        recommendation: "J1.13 COMPLETE + FROZEN / GO NOT RECOMMENDED",
    };
    await writeResult(result).catch(() => {});
    console.error(JSON.stringify(result));
    process.exitCode = 1;
}
