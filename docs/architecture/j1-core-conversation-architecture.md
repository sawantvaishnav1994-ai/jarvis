# J1 Core + Conversation Architecture v1

## Architectural rule

JARVIS Core owns conversation state, context assembly, orchestration, policy-aware continuation, persistence, audit correlation and user-facing behavior. AI providers remain replaceable execution backends behind the Foundation model-provider port.

## Primary modules

### Conversation Core
Owns conversation IDs, participant ownership, turn ordering, lifecycle state, idempotency keys and correlation IDs. It binds every mutable operation to the current Foundation identity/session/security epoch.

### Context Assembler
Builds a deterministic context envelope from allowed conversation history, system instructions, project context, memory retrievals and tool results. Every source carries provenance, owner/project scope, classification, freshness and disclosure eligibility.

### Memory Boundary
Uses the J0.5 memory contract. Retrieval is scoped and filtered. Conversation content is not automatically promoted to durable long-term memory. Candidate memory writes remain governed by memory policy, retention and NEVER_STORE rules.

### Model Orchestrator
Uses the J0.6 provider-neutral port. It selects capabilities, applies privacy preflight, enforces external-provider eligibility, handles bounded timeout/failure and never treats model output as authorization.

### Turn State Machine
Required states include accepted, assembling_context, awaiting_model, streaming, awaiting_approval, executing_tool, resuming, completed, failed and cancelled. State transitions are explicit, auditable and resumable only when Foundation authorization remains valid.

### Tool Continuation
Any model tool request becomes a proposal. J0.7 validates schema and routes through policy/risk/approval/permit. Tool execution results are correlated into the originating turn. No direct model-to-tool path exists.

### Persistence Boundary
Conversation and message records use J0.4 classified encrypted storage. Retention, deletion, export and derived-data obligations remain Foundation-governed. NEVER_STORE material is never durably written by J1.

### Event and Audit Boundary
Turn lifecycle changes, model calls, approval waits, tool results, cancellation and failures emit correlation-safe operational events and audit records through J0.8/J0.9 without protected plaintext leakage.

### Web Conversation Surface
The web client is an untrusted presentation boundary. It receives only authorized stream events, cannot mint authority, and must use Foundation-authenticated APIs for approvals or actions.

## Canonical request path

actor → device/session/epoch verification → conversation ownership → operating mode → turn creation → context candidate collection → memory retrieval → classification/privacy minimization → model route → model output → response stream OR tool proposal → policy/risk → approval if needed → one-shot permit → Universal Tool Gateway → result event → turn resume → final response → permitted persistence → audit/event correlation.

## Failure behavior

Database unavailability prevents protected state mutation and may force not-ready/degraded behavior. Redis/BullMQ unavailability cannot create alternate authorization paths. Provider failure may select another eligible provider only if privacy/capability rules still pass; otherwise the turn fails safely. Revocation/security-epoch changes invalidate stale resumptions. FREEZE, SAFE MODE and SHUTDOWN override ongoing work according to Foundation v1 semantics.

## No new authority boundaries in J1

Conversation IDs, model responses, stream tokens, tool suggestions, UI state, cached history and queue messages are never authority tokens. Only Foundation identity/session/approval/permit mechanisms authorize protected operations.
