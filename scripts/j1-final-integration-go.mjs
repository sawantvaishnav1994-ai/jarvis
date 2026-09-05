import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await read(path));
const letters = "ABCDEFGHIJKLMNOPQRST".split("");
const candidateRef = "validation/j1.9-j1.12-core-conversation-final-20260905";
const normalize = (value) =>
  value
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ");

async function writeResult(result) {
  await mkdir(new URL(".jarvis/acceptance/", root), { recursive: true });
  await writeFile(
    new URL(".jarvis/acceptance/j1.12.json", root),
    `${JSON.stringify(result, null, 2)}\n`,
  );
}

try {
  if (process.env.J1_12_CI_SEQUENCE !== "complete")
    throw new Error("J1_12_REAL_STACK_SEQUENCE_NOT_ATTESTED");

  const [
    gates,
    roadmap,
    j11Handler,
    webProxy,
    webClient,
    j19,
    j110,
    j17,
    j18,
    history,
    memory,
    workflow,
    turnSecurity,
    streamingSecurity,
    auditIntegration,
    eventIntegration,
  ] = await Promise.all([
    json("tests/acceptance/j1.12-gates.json"),
    read("docs/roadmap/j1.12.md"),
    read("apps/api/src/conversation-http.ts"),
    read("apps/web/app/api/conversation/route.ts"),
    read("apps/web/app/conversation/conversation-console.tsx"),
    read("packages/core/src/operating-modes.ts"),
    read("packages/core/src/streaming-resilience.ts"),
    read("packages/core/src/tool-aware-conversation.ts"),
    read("packages/core/src/permission-approval-aware-conversation.ts"),
    read("packages/core/src/conversation-history.ts"),
    read("packages/core/src/memory-aware-conversation.ts"),
    read(".github/workflows/j1.12-ci.yml"),
    read("tests/security/j1-turn-pipeline-security.test.ts"),
    read("tests/unit/j1-streaming-resilience.test.ts"),
    read("tests/integration/j09-audit-postgres.test.ts"),
    read("tests/integration/j08-events.test.ts"),
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
      gates.milestone === "J1.12" &&
      gates.baseline === "cf203bb71df1d4cb19e819546f2684201e04cc16" &&
      gates.gates.length === 20 &&
      JSON.stringify(gates.gates.map((gate) => gate.id)) ===
        JSON.stringify(letters),
    B:
      roadmap.includes("J0 remains sole authority") &&
      roadmap.includes("authorization permits") &&
      !j11Handler.includes("new GovernanceEngine") &&
      !j11Handler.includes("ExecutionPermit"),
    C:
      j11Handler.includes('"identity.inspect"') &&
      j11Handler.includes("requestBindingDigest") &&
      webProxy.includes('cookies()).get("jarvis_session")') &&
      !webClient.includes("jarvis_session"),
    D:
      roadmap.includes("J1 conversation session") &&
      roadmap.includes("Foundation session") &&
      workflow.includes("J1.1 Conversation Session"),
    E:
      j19.includes("J19OperatingModeCoordinator") &&
      roadmap.includes("Operating modes can reduce eligibility") &&
      workflow.includes("J1.9 Operating Modes"),
    F:
      roadmap.includes("classification-aware") &&
      roadmap.includes("D5") &&
      workflow.includes("J1.2 Context Assembly"),
    G:
      memory.includes("ConversationMemoryRetrievalPort") &&
      memory.includes("submitCandidate") &&
      roadmap.includes("no silent promotion") &&
      workflow.includes("J1.6 Memory-Aware Conversation"),
    H:
      j11Handler.includes("J13ModelOrchestrator") &&
      roadmap.includes("provider") &&
      workflow.includes("J1.3 Model Orchestration"),
    I:
      j11Handler.includes("J14TurnPipeline") &&
      workflow.includes("J1.4 Response Turn Pipeline"),
    J:
      j110.includes("replayedProtectedSideEffects: false") &&
      roadmap.includes("never replays protected side effects") &&
      workflow.includes("J1.10 Streaming Cancellation Resilience"),
    K:
      j17.includes("this.gateway.invoke(request, signal)") &&
      roadmap.includes("J1.7 → J0.7") &&
      workflow.includes("J1.7 Tool-Aware Conversation"),
    L:
      j18.includes('assurance: "A3"') &&
      j18.includes("J18_SELF_APPROVAL_DENIED") &&
      j18.includes("assertStableBinding") &&
      workflow.includes("J1.8 Permission Approval-Aware Conversation"),
    M:
      history.includes("persistPipelineResult") &&
      roadmap.includes("NEVER_STORE") &&
      workflow.includes("J1.5 Conversation Persistence History"),
    N:
      normalizedRoadmap.includes(
        "audit/events correlate the chain without protected plaintext leakage",
      ) &&
      turnSecurity.includes(
        "does not expose prompt/context plaintext in audit records",
      ) &&
      auditIntegration.includes("verifyAuditChain") &&
      auditIntegration.includes('not.toContain("owner private sentence")') &&
      eventIntegration.includes("correlationId") &&
      eventIntegration.includes("payload_redacted_at"),
    O:
      webProxy.includes("signService") &&
      webClient.includes("Security epoch") &&
      webClient.includes("Approval") &&
      webClient.includes("Tool") &&
      workflow.includes("J1.11 Conversational Web UI"),
    P:
      roadmap.includes("Device removal") &&
      roadmap.includes("SAFE MODE") &&
      roadmap.includes("FREEZE") &&
      roadmap.includes("SHUTDOWN") &&
      normalizedWorkflow.includes("emergency"),
    Q:
      roadmap.includes("PostgreSQL") &&
      roadmap.includes("Redis") &&
      roadmap.includes("model/provider") &&
      roadmap.includes("tool") &&
      normalizedWorkflow.includes("outage") &&
      normalizedWorkflow.includes("recovery"),
    R:
      normalizedRoadmap.includes("duplicate") &&
      normalizedRoadmap.includes("race") &&
      normalizedRoadmap.includes("late result") &&
      normalizedWorkflow.includes("replay") &&
      normalizedWorkflow.includes("race") &&
      normalizedWorkflow.includes("recovery") &&
      turnSecurity.includes("discards a late result after authority revocation") &&
      streamingSecurity.includes("without replaying protected side effects"),
    S:
      process.env.J1_12_CI_SEQUENCE === "complete" &&
      workflow.includes("J0.4") &&
      workflow.includes("J0.12") &&
      workflow.includes("J1.0") &&
      workflow.includes("J1.11"),
    T:
      qualificationRefValid &&
      normalizedRoadmap.includes("no production credentials") &&
      normalizedRoadmap.includes("no scope expansion") &&
      normalizedRoadmap.includes("exact main green required before") &&
      normalizedRoadmap.includes("j1 core + conversation v1 go") &&
      exactMainRequalificationConfigured &&
      noProductionCredentialInjection,
  };

  const failed = Object.entries(checks)
    .filter(([, value]) => !value)
    .map(([id]) => id);
  const result = {
    milestone: "J1.12",
    result: failed.length ? "FAIL" : "A-T_PASS",
    realStackSequence: true,
    qualificationRef,
    phase: onMain ? "EXACT_MAIN" : onCandidate ? "CANDIDATE" : "UNKNOWN",
    checks,
    failed,
    recommendation: failed.length
      ? "J1 CORE + CONVERSATION V1 GO NOT RECOMMENDED"
      : onMain
        ? "J1 CORE + CONVERSATION V1 GO RECOMMENDED"
        : "J1.12 CANDIDATE QUALIFIED — EXACT-MAIN QUALIFICATION REQUIRED",
  };
  await writeResult(result);
  console.log(JSON.stringify(result));
  if (failed.length) process.exitCode = 1;
} catch (error) {
  const result = {
    milestone: "J1.12",
    result: "FAIL",
    realStackSequence: false,
    checks: {},
    failed: [error instanceof Error ? error.message : "UNKNOWN"],
    recommendation: "J1 CORE + CONVERSATION V1 GO NOT RECOMMENDED",
  };
  await writeResult(result).catch(() => {});
  console.error(JSON.stringify(result));
  process.exitCode = 1;
}
