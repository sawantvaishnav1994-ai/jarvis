# JARVIS Master Completion Ledger

Audit started: 2026-09-11. Inspected checkout: `ace0715d00a6d02494a112661a2b82dc6f55f0b6`. Active candidate: `validation/j1.product-readiness-20260909`. Main is preserved.

## Scope and evidence rules

Exactly 168 V1 requirements and 24 V2 additions. Wording and acceptance criteria are preserved from `docs/product/requirements.json`; both supplied DOCX SHA-256 values were rechecked and match that register. This ledger is the completion authority. The earlier register remains a frozen source map, not an independent status tracker. No source-only or mock-only evidence earns VERIFIED_COMPLETE.

Allowed statuses: NOT_STARTED, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, VERIFIED_COMPLETE, BLOCKED_EXTERNAL. Final completion state uses the same vocabulary. IN_PROGRESS includes partial foundation implementations with unmet product acceptance. NOT_STARTED means the required product implementation is missing even when related contracts exist. No broad requirement is externally blocked merely because one future hardware check will need equipment.

## Repository audit findings

Inventory: 549 tracked files, including 50 app files, 141 package files, 118 test files, 44 scripts, 40 preserved Python reference files, 10 workflows and 14 SQL migrations. Reviewed composition roots, package exported contracts, requirement wording, test inventory and source marker matches. This is a conservative initial source audit; per-requirement runtime acceptance remains open and is explicitly recorded below. Existing historical gate passes are retained, not promoted into whole-product acceptance.

- Active API composes identity, governed private storage and a conversation pipeline; conversation persistence/history/memory/tool-aware coordinators are not connected to that HTTP pipeline.
- Conversation sends only current input, returns completed event JSON and stored:false. It defaults to a clearly labelled synthetic model, with optional local Ollama. Live-session verification is incorrectly conditional on Ollama selection; selected for immediate foundation repair.
- Persistence coordinator writes records before checking conversation-session authority; commit does not revalidate live session. Transition and cancellation paths need complete session-binding checks before mutations.
- Agent package exposes interfaces and disables execution. Device-control package exposes interfaces only. No native mobile apps or world-state service found.
- Worker accepts foundation.ping only. Newer durable event/scheduler/outbox classes exist separately.
- Legacy and current model/context/event/tool abstractions coexist. Preserve validated foundation compatibility while choosing existing current implementations at composition roots; do not create another parallel runtime.
- Marker search found synthetic API tool responses and synthetic-effect tool receipts. These are development paths, not real connector completion. HTML input placeholder attributes are legitimate UI text, not unfinished handlers. No generic TODO count is used as a completion score.
- Historical STATUS/system architecture documents contain outdated milestone claims. Source and exact-SHA test evidence take precedence; historical files remain preserved.
- Production qualification is missing: actual model/voice quality, hardware ceremonies, installers/signing, complete persistence/restart loop, isolation, deployment and independent recovery. Existing tests must be rerun for changed candidate code.

## Dependency order and current work

Use this section within the ledger; no separate roadmap. First repair live identity/session boundaries and persistence preconditions (FR-012/013/019/021). Then compose governed, consent-bound durable conversations and restart/history tests (FR-001/019), authoritative context/model routing, memory/knowledge, tools/agents/approvals and the complete runtime loop. Continue with voice/Presence, durable events, devices/offline, remaining web surfaces, mobile, hardening and whole-product release acceptance. A phase is not accepted based on file existence.

Current evidence: source audit only for this candidate. Fresh test outcomes will be appended after execution. Historical Home/Windows/J1 passes on 54652256394ec84f60398130bb521cbcb515b24e are limited to their tested development scenarios.

## Requirement records

### FR-001

- Requirement description: Support text conversations with streaming responses, attachments, structured actions, citations/trace summaries, and task status.
- Acceptance: Conversation survives page reload and retains stable IDs.
- Owning subsystem: Interaction
- Implementation location: apps/web/app/home/home.tsx; apps/web/app/home/session.ts; apps/desktop/presence/state.mjs; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/home-ui/home.spec.ts; tests/unit/personal-home-session.test.ts; scripts/verify-presence-native.mjs. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Browser tests use intercepted conversation/speech fixtures; Windows semantic states are injected fixtures. No complete live multimodal runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: HTTP returns stored:false, JSON completed events; no message storage/reload history or attachment flow. Durable history, actual streaming, attachments, authenticated cross-device runtime and missing destinations.
- Final completion state: IN_PROGRESS

### FR-002

- Requirement description: Show when JARVIS is listening, thinking, retrieving memory, using knowledge, calling a tool, waiting for approval, executing, or encountering an error.
- Acceptance: Each runtime state is emitted by backend and represented consistently in UI.
- Owning subsystem: Interaction
- Implementation location: apps/web/app/home/home.tsx; apps/web/app/home/session.ts; apps/desktop/presence/state.mjs; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/home-ui/home.spec.ts; tests/unit/personal-home-session.test.ts; scripts/verify-presence-native.mjs. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Browser tests use intercepted conversation/speech fixtures; Windows semantic states are injected fixtures. No complete live multimodal runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Visual state vocabulary exists; full backend semantic event stream is not connected to Presence. Durable history, actual streaming, attachments, authenticated cross-device runtime and missing destinations.
- Final completion state: IN_PROGRESS

### FR-003

- Requirement description: Separate user-visible answer from internal execution records and sensitive chain-of-thought.
- Acceptance: UI shows concise rationale/status without exposing protected internal reasoning.
- Owning subsystem: Interaction
- Implementation location: apps/web/app/home/home.tsx; apps/web/app/home/session.ts; apps/desktop/presence/state.mjs; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/home-ui/home.spec.ts; tests/unit/personal-home-session.test.ts; scripts/verify-presence-native.mjs. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Browser tests use intercepted conversation/speech fixtures; Windows semantic states are injected fixtures. No complete live multimodal runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Response/event separation exists; verify every model/tool path and UI disclosure against full acceptance. Durable history, actual streaming, attachments, authenticated cross-device runtime and missing destinations.
- Final completion state: IN_PROGRESS

### FR-004

- Requirement description: Support voice turn-taking with interruption/barge-in and explicit microphone state.
- Acceptance: User can interrupt spoken output and continue the same task.
- Owning subsystem: Interaction
- Implementation location: apps/web/app/home/home.tsx; apps/web/app/home/session.ts; apps/desktop/presence/state.mjs; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/home-ui/home.spec.ts; tests/unit/personal-home-session.test.ts; scripts/verify-presence-native.mjs. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Browser tests use intercepted conversation/speech fixtures; Windows semantic states are injected fixtures. No complete live multimodal runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Read-aloud stop exists; no STT or same-task barge-in loop. Durable history, actual streaming, attachments, authenticated cross-device runtime and missing destinations.
- Final completion state: IN_PROGRESS

### FR-005

- Requirement description: Support multi-device handoff of active conversations and tasks.
- Acceptance: Task opened on one authorized device can continue on another without duplicate execution.
- Owning subsystem: Interaction
- Implementation location: apps/web/app/home/home.tsx; apps/web/app/home/session.ts; apps/desktop/presence/state.mjs; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/home-ui/home.spec.ts; tests/unit/personal-home-session.test.ts; scripts/verify-presence-native.mjs. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Browser tests use intercepted conversation/speech fixtures; Windows semantic states are injected fixtures. No complete live multimodal runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Conversation session is bound to one identity session/device; explicit safe handoff is absent. Durable history, actual streaming, attachments, authenticated cross-device runtime and missing destinations.
- Final completion state: IN_PROGRESS

### FR-006

- Requirement description: Provide a global command surface for actions, approvals, search, memory, knowledge, activities, and settings.
- Acceptance: Primary actions are reachable without navigating through unrelated modules.
- Owning subsystem: Interaction
- Implementation location: apps/web/app/home/home.tsx; apps/web/app/home/session.ts; apps/desktop/presence/state.mjs; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/home-ui/home.spec.ts; tests/unit/personal-home-session.test.ts; scripts/verify-presence-native.mjs. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Browser tests use intercepted conversation/speech fixtures; Windows semantic states are injected fixtures. No complete live multimodal runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Command dialog includes Home/Activities/Dashboard/Settings; memory/knowledge/approvals/search remain absent. Durable history, actual streaming, attachments, authenticated cross-device runtime and missing destinations.
- Final completion state: IN_PROGRESS

### FR-007

- Requirement description: Expose the source of important context: current conversation, memory, knowledge, device/event, or tool result.
- Acceptance: User can inspect provenance for consequential answers/actions.
- Owning subsystem: Interaction
- Implementation location: apps/web/app/home/home.tsx; apps/web/app/home/session.ts; apps/desktop/presence/state.mjs; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/home-ui/home.spec.ts; tests/unit/personal-home-session.test.ts; scripts/verify-presence-native.mjs. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Browser tests use intercepted conversation/speech fixtures; Windows semantic states are injected fixtures. No complete live multimodal runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable history, actual streaming, attachments, authenticated cross-device runtime and missing destinations.
- Final completion state: IN_PROGRESS

### FR-008

- Requirement description: Support wearable notifications and concise voice interactions with constrained context.
- Acceptance: Wearable uses the same identity/task state while respecting surface-specific privacy.
- Owning subsystem: Interaction
- Implementation location: apps/web/app/home/home.tsx; apps/web/app/home/session.ts; apps/desktop/presence/state.mjs; apps/api/src/conversation-http.ts
- Current status: NOT_STARTED
- Tests: tests/home-ui/home.spec.ts; tests/unit/personal-home-session.test.ts; scripts/verify-presence-native.mjs. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Browser tests use intercepted conversation/speech fixtures; Windows semantic states are injected fixtures. No complete live multimodal runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable history, actual streaming, attachments, authenticated cross-device runtime and missing destinations.
- Final completion state: NOT_STARTED

### FR-009

- Requirement description: Support future AR/spatial rendering of devices, objects, task state, and AI cues.
- Acceptance: AR client consumes documented world-state/event APIs without bypassing policy engine.
- Owning subsystem: Interaction
- Implementation location: apps/web/app/home/home.tsx; apps/web/app/home/session.ts; apps/desktop/presence/state.mjs; apps/api/src/conversation-http.ts
- Current status: NOT_STARTED
- Tests: tests/home-ui/home.spec.ts; tests/unit/personal-home-session.test.ts; scripts/verify-presence-native.mjs. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Browser tests use intercepted conversation/speech fixtures; Windows semantic states are injected fixtures. No complete live multimodal runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable history, actual streaming, attachments, authenticated cross-device runtime and missing destinations.
- Final completion state: NOT_STARTED

### FR-010

- Requirement description: Create one Root Owner identity during secure bootstrap.
- Acceptance: Root owner is cryptographically bound to the installation/account and recoverable through a documented recovery process.
- Owning subsystem: Identity and Trust
- Implementation location: packages/identity/src/engine.ts; packages/identity/src/contracts.ts; packages/storage/src/identity.ts; apps/api/src/identity-http.ts
- Current status: IN_PROGRESS
- Tests: tests/security/identity.test.ts; tests/security/live-session.test.ts; tests/integration/identity-postgres.test.ts; tests/identity-e2e/identity.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Existing real database and browser qualification harness; physical owner/key ceremony and current complete-product coverage not established.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Close live authority gaps in conversation paths; qualify every protected subsystem and real-device recovery.
- Final completion state: IN_PROGRESS

### FR-011

- Requirement description: Require strong authentication for sensitive access and step-up authentication for high-impact actions.
- Acceptance: High-risk policy tests fail without recent step-up authentication.
- Owning subsystem: Identity and Trust
- Implementation location: packages/identity/src/engine.ts; packages/identity/src/contracts.ts; packages/storage/src/identity.ts; apps/api/src/identity-http.ts
- Current status: IN_PROGRESS
- Tests: tests/security/identity.test.ts; tests/security/live-session.test.ts; tests/integration/identity-postgres.test.ts; tests/identity-e2e/identity.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Existing real database and browser qualification harness; physical owner/key ceremony and current complete-product coverage not established.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Close live authority gaps in conversation paths; qualify every protected subsystem and real-device recovery.
- Final completion state: IN_PROGRESS

### FR-012

- Requirement description: Register devices with unique keys, trust state, last-seen metadata, and revocation.
- Acceptance: Revoked device cannot refresh sessions or invoke protected tools.
- Owning subsystem: Identity and Trust
- Implementation location: packages/identity/src/engine.ts; packages/identity/src/contracts.ts; packages/storage/src/identity.ts; apps/api/src/identity-http.ts
- Current status: IN_PROGRESS
- Tests: tests/security/identity.test.ts; tests/security/live-session.test.ts; tests/integration/identity-postgres.test.ts; tests/identity-e2e/identity.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Existing real database and browser qualification harness; physical owner/key ceremony and current complete-product coverage not established.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Close live authority gaps in conversation paths; qualify every protected subsystem and real-device recovery.
- Final completion state: IN_PROGRESS

### FR-013

- Requirement description: Support short-lived sessions with rotation, revocation, and device binding.
- Acceptance: Stolen/expired token tests cannot access protected APIs.
- Owning subsystem: Identity and Trust
- Implementation location: packages/identity/src/engine.ts; packages/identity/src/contracts.ts; packages/storage/src/identity.ts; apps/api/src/identity-http.ts
- Current status: IN_PROGRESS
- Tests: tests/security/identity.test.ts; tests/security/live-session.test.ts; tests/integration/identity-postgres.test.ts; tests/identity-e2e/identity.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Existing real database and browser qualification harness; physical owner/key ceremony and current complete-product coverage not established.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Close live authority gaps in conversation paths; qualify every protected subsystem and real-device recovery.
- Final completion state: IN_PROGRESS

### FR-014

- Requirement description: Separate human identity, agent identity, service identity, and device identity.
- Acceptance: Audit records always identify the principal type and unique ID.
- Owning subsystem: Identity and Trust
- Implementation location: packages/identity/src/engine.ts; packages/identity/src/contracts.ts; packages/storage/src/identity.ts; apps/api/src/identity-http.ts
- Current status: IN_PROGRESS
- Tests: tests/security/identity.test.ts; tests/security/live-session.test.ts; tests/integration/identity-postgres.test.ts; tests/identity-e2e/identity.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Existing real database and browser qualification harness; physical owner/key ceremony and current complete-product coverage not established.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Close live authority gaps in conversation paths; qualify every protected subsystem and real-device recovery.
- Final completion state: IN_PROGRESS

### FR-015

- Requirement description: Support trusted secondary users with explicit permission sets.
- Acceptance: Secondary users cannot see owner-private memory by default.
- Owning subsystem: Identity and Trust
- Implementation location: packages/identity/src/engine.ts; packages/identity/src/contracts.ts; packages/storage/src/identity.ts; apps/api/src/identity-http.ts
- Current status: IN_PROGRESS
- Tests: tests/security/identity.test.ts; tests/security/live-session.test.ts; tests/integration/identity-postgres.test.ts; tests/identity-e2e/identity.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Existing real database and browser qualification harness; physical owner/key ceremony and current complete-product coverage not established.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Close live authority gaps in conversation paths; qualify every protected subsystem and real-device recovery.
- Final completion state: IN_PROGRESS

### FR-016

- Requirement description: Support presence signals such as voice/face/device context only as additional trust factors, not sole authorization for critical actions.
- Acceptance: Policy rejects critical action when cryptographic/step-up factor is missing.
- Owning subsystem: Identity and Trust
- Implementation location: packages/identity/src/engine.ts; packages/identity/src/contracts.ts; packages/storage/src/identity.ts; apps/api/src/identity-http.ts
- Current status: IN_PROGRESS
- Tests: tests/security/identity.test.ts; tests/security/live-session.test.ts; tests/integration/identity-postgres.test.ts; tests/identity-e2e/identity.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Existing real database and browser qualification harness; physical owner/key ceremony and current complete-product coverage not established.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Close live authority gaps in conversation paths; qualify every protected subsystem and real-device recovery.
- Final completion state: IN_PROGRESS

### FR-017

- Requirement description: Provide emergency recovery codes/keys with secure rotation and revocation.
- Acceptance: Recovery procedure is tested and logged.
- Owning subsystem: Identity and Trust
- Implementation location: packages/identity/src/engine.ts; packages/identity/src/contracts.ts; packages/storage/src/identity.ts; apps/api/src/identity-http.ts
- Current status: IN_PROGRESS
- Tests: tests/security/identity.test.ts; tests/security/live-session.test.ts; tests/integration/identity-postgres.test.ts; tests/identity-e2e/identity.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Existing real database and browser qualification harness; physical owner/key ceremony and current complete-product coverage not established.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Close live authority gaps in conversation paths; qualify every protected subsystem and real-device recovery.
- Final completion state: IN_PROGRESS

### FR-018

- Requirement description: Support context-aware trust scoring based on device, network, recent auth, location class, and anomaly signals.
- Acceptance: Score can tighten but never silently loosen explicit policy boundaries.
- Owning subsystem: Identity and Trust
- Implementation location: packages/identity/src/engine.ts; packages/identity/src/contracts.ts; packages/storage/src/identity.ts; apps/api/src/identity-http.ts
- Current status: IN_PROGRESS
- Tests: tests/security/identity.test.ts; tests/security/live-session.test.ts; tests/integration/identity-postgres.test.ts; tests/identity-e2e/identity.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Existing real database and browser qualification harness; physical owner/key ceremony and current complete-product coverage not established.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Close live authority gaps in conversation paths; qualify every protected subsystem and real-device recovery.
- Final completion state: IN_PROGRESS

### FR-019

- Requirement description: Assign stable IDs to conversations, messages, tasks, attachments, and references.
- Acceptance: Every model/tool run can be traced to initiating user/event context.
- Owning subsystem: Conversation and Context
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: HTTP generates conversation/turn IDs but does not create durable message records or audit links. Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: IN_PROGRESS

### FR-020

- Requirement description: Build a context package from explicit user input plus policy-approved memory/knowledge/task/world-state retrieval.
- Acceptance: Context assembly is logged as references without storing hidden reasoning.
- Owning subsystem: Conversation and Context
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Multiple context assembler generations coexist; current API supplies only current input. Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: IN_PROGRESS

### FR-021

- Requirement description: Prevent cross-user and cross-project context leakage.
- Acceptance: Isolation tests confirm scoped retrieval.
- Owning subsystem: Conversation and Context
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Scoped domain/database tests exist; all product retrieval APIs must enforce scope before exposure. Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: IN_PROGRESS

### FR-022

- Requirement description: Summarize long conversations into structured checkpoints while preserving source links.
- Acceptance: Context remains within model limits and user can inspect prior checkpoints.
- Owning subsystem: Conversation and Context
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: NOT_STARTED

### FR-023

- Requirement description: Support task threads that outlive a single chat response.
- Acceptance: Task state persists independently of UI session.
- Owning subsystem: Conversation and Context
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: No durable task thread exposed; conversation session metadata alone does not satisfy task persistence. Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: IN_PROGRESS

### FR-024

- Requirement description: Allow the user to pin, exclude, correct, or forget contextual items.
- Acceptance: Corrections affect future retrieval and are versioned.
- Owning subsystem: Conversation and Context
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Memory correction primitives exist, but no contextual pin/exclude/forget product flow. Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: IN_PROGRESS

### FR-025

- Requirement description: Represent uncertainty and missing context explicitly.
- Acceptance: System requests approval/clarification only when required rather than inventing data.
- Owning subsystem: Conversation and Context
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: IN_PROGRESS

### FR-026

- Requirement description: Support shared project contexts with policy-controlled collaborators.
- Acceptance: Shared context is distinct from personal private memory.
- Owning subsystem: Conversation and Context
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: NOT_STARTED

### FR-027

- Requirement description: Support multimodal references to screen regions, images, files, devices, and digital-twin entities.
- Acceptance: Reference IDs are stable and resolve to authorized objects.
- Owning subsystem: Conversation and Context
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: NOT_STARTED

### FR-028

- Requirement description: Maintain a model registry describing provider, model, modality, context limit, capabilities, location, cost class, latency class, and policy restrictions.
- Acceptance: Router uses registry metadata rather than hard-coded provider assumptions.
- Owning subsystem: Models and Intelligence
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Descriptor/router exist; complete model registry metadata/control UI and production adapter coverage pending. Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: IN_PROGRESS

### FR-029

- Requirement description: Expose a provider-neutral request/response contract for chat/reasoning, embeddings, vision, speech, and structured output.
- Acceptance: At least two interchangeable adapters pass the same contract tests.
- Owning subsystem: Models and Intelligence
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Legacy ModelProvider and J06ModelAdapter coexist; full multimodal adapters not implemented. Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: IN_PROGRESS

### FR-030

- Requirement description: Support model failover and controlled degradation when a provider is unavailable.
- Acceptance: Failure test switches to approved fallback without duplicating unsafe actions.
- Owning subsystem: Models and Intelligence
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: IN_PROGRESS

### FR-031

- Requirement description: Apply data-classification rules before sending context to remote models.
- Acceptance: Restricted data is blocked/redacted or routed local according to policy.
- Owning subsystem: Models and Intelligence
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: IN_PROGRESS

### FR-032

- Requirement description: Route by task type, quality requirement, latency, cost, privacy, modality, and tool/structured-output capability.
- Acceptance: Routing decisions are observable and explainable at a high level.
- Owning subsystem: Models and Intelligence
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: IN_PROGRESS

### FR-033

- Requirement description: Support local inference for selected models and offline fallback.
- Acceptance: Core local assistant functions remain available during cloud outage.
- Owning subsystem: Models and Intelligence
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Opt-in loopback Ollama adapter exists; real installed inference and offline assistant scenario unverified. Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: IN_PROGRESS

### FR-034

- Requirement description: Use specialized models for vision, speech, reranking, embeddings, code, or fast classification when beneficial.
- Acceptance: Benchmarks justify each specialization.
- Owning subsystem: Models and Intelligence
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: NOT_STARTED
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: NOT_STARTED

### FR-035

- Requirement description: Enforce per-task token, time, tool-call, and cost budgets.
- Acceptance: Run stops or asks for approval on budget exhaustion.
- Owning subsystem: Models and Intelligence
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: IN_PROGRESS

### FR-036

- Requirement description: Support evaluator/critic passes for high-consequence outputs without allowing critics to bypass policy.
- Acceptance: Evaluation improves measured quality and is separately logged.
- Owning subsystem: Models and Intelligence
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: NOT_STARTED
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: NOT_STARTED

### FR-037

- Requirement description: Support policy-controlled ensembles or multi-model debate for selected tasks.
- Acceptance: Use only when quality gain exceeds defined latency/cost threshold.
- Owning subsystem: Models and Intelligence
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: NOT_STARTED
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: NOT_STARTED

### FR-038

- Requirement description: Maintain model quality and safety benchmarks by task class.
- Acceptance: Model upgrades require regression results before promotion.
- Owning subsystem: Models and Intelligence
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: NOT_STARTED
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: NOT_STARTED

### FR-039

- Requirement description: Store memories as typed objects rather than raw unstructured chat copies.
- Acceptance: Memory object includes type, subject, content, source, timestamps, confidence, sensitivity, retention, version.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: IN_PROGRESS

### FR-040

- Requirement description: Support working, episodic, semantic/personal, preference, procedural, relationship, project, and event memory categories.
- Acceptance: Retrieval can filter by type and scope.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: IN_PROGRESS

### FR-041

- Requirement description: Keep original source links/provenance for generated memory.
- Acceptance: User can trace a memory to the source event/message/file when available.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: IN_PROGRESS

### FR-042

- Requirement description: Support explicit remember, correct, supersede, forget, export, and retention expiration operations.
- Acceptance: Lifecycle actions are versioned and audited.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: IN_PROGRESS

### FR-043

- Requirement description: Prevent low-confidence inference from becoming high-confidence personal fact silently.
- Acceptance: Inferred memory is marked and promoted only by evidence/confirmation rules.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: IN_PROGRESS

### FR-044

- Requirement description: Use embeddings and graph relationships for semantic/relational retrieval.
- Acceptance: Hybrid retrieval outperforms vector-only baseline on evaluation set.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Hybrid ranking/vector SQL exist; required comparative quality benchmark absent. Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: IN_PROGRESS

### FR-045

- Requirement description: Store memory edges among people, projects, decisions, places, devices, goals, and events.
- Acceptance: Graph queries can return related context with provenance.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: IN_PROGRESS

### FR-046

- Requirement description: Apply sensitivity labels and memory-level access policies.
- Acceptance: Private/sensitive memories do not appear in unauthorized sessions.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: IN_PROGRESS

### FR-047

- Requirement description: Rank retrieval by relevance, recency, confidence, importance, scope, and task fit.
- Acceptance: Evaluation confirms improved precision and reduced irrelevant recall.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Ranking code exists; required precision/irrelevant-recall evaluation absent. Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: IN_PROGRESS

### FR-048

- Requirement description: Detect contradictions and preserve version history rather than destructively overwriting facts.
- Acceptance: Conflict is represented explicitly and latest verified version is preferred.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: IN_PROGRESS

### FR-049

- Requirement description: Support memory consolidation jobs that summarize repeated low-level events into higher-level stable memories.
- Acceptance: Consolidation retains references to source events and is reversible.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: NOT_STARTED
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: NOT_STARTED

### FR-050

- Requirement description: Provide a user-visible Memory Graph, Memory Tree, and Memory Detail view.
- Acceptance: User can navigate, inspect, correct, and control retention from UI.
- Owning subsystem: Memory
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: NOT_STARTED
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: NOT_STARTED

### FR-051

- Requirement description: Ingest files and text with stable document IDs, source metadata, checksums, versions, and access scopes.
- Acceptance: Re-ingestion detects unchanged versus updated content.
- Owning subsystem: Knowledge
- Implementation location: packages/knowledge/src/evidence-engine.ts; packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Evidence graph domain is implemented; no document ingestion/indexing service composed into API.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Document storage/parser/chunker/embedder/index pipeline, authorized retrieval, source management UI and retrieval benchmarks.
- Final completion state: NOT_STARTED

### FR-052

- Requirement description: Chunk/index content for hybrid lexical + vector retrieval with metadata filters.
- Acceptance: Retrieval benchmark meets target precision/recall.
- Owning subsystem: Knowledge
- Implementation location: packages/knowledge/src/evidence-engine.ts; packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Evidence graph domain is implemented; no document ingestion/indexing service composed into API.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Document storage/parser/chunker/embedder/index pipeline, authorized retrieval, source management UI and retrieval benchmarks.
- Final completion state: NOT_STARTED

### FR-053

- Requirement description: Return source references/citations for knowledge-derived claims.
- Acceptance: Answer can map claims to source chunk/document.
- Owning subsystem: Knowledge
- Implementation location: packages/knowledge/src/evidence-engine.ts; packages/knowledge/src/j05-contracts.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Evidence graph domain is implemented; no document ingestion/indexing service composed into API.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Document storage/parser/chunker/embedder/index pipeline, authorized retrieval, source management UI and retrieval benchmarks.
- Final completion state: IN_PROGRESS

### FR-054

- Requirement description: Enforce document-level permissions before retrieval.
- Acceptance: Unauthorized chunk never enters context.
- Owning subsystem: Knowledge
- Implementation location: packages/knowledge/src/evidence-engine.ts; packages/knowledge/src/j05-contracts.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Evidence graph domain is implemented; no document ingestion/indexing service composed into API.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Document storage/parser/chunker/embedder/index pipeline, authorized retrieval, source management UI and retrieval benchmarks.
- Final completion state: IN_PROGRESS

### FR-055

- Requirement description: Support webpages, repositories, notes, manuals, structured records, and selected connected services.
- Acceptance: Each connector uses the same normalized document contract.
- Owning subsystem: Knowledge
- Implementation location: packages/knowledge/src/evidence-engine.ts; packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Evidence graph domain is implemented; no document ingestion/indexing service composed into API.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Document storage/parser/chunker/embedder/index pipeline, authorized retrieval, source management UI and retrieval benchmarks.
- Final completion state: NOT_STARTED

### FR-056

- Requirement description: Track freshness, expiry, and re-index status.
- Acceptance: Stale source can be flagged or refreshed based on policy.
- Owning subsystem: Knowledge
- Implementation location: packages/knowledge/src/evidence-engine.ts; packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Evidence graph domain is implemented; no document ingestion/indexing service composed into API.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Document storage/parser/chunker/embedder/index pipeline, authorized retrieval, source management UI and retrieval benchmarks.
- Final completion state: NOT_STARTED

### FR-057

- Requirement description: Support reranking and query rewriting.
- Acceptance: Offline evaluation demonstrates measurable retrieval quality gain.
- Owning subsystem: Knowledge
- Implementation location: packages/knowledge/src/evidence-engine.ts; packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Evidence graph domain is implemented; no document ingestion/indexing service composed into API.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Document storage/parser/chunker/embedder/index pipeline, authorized retrieval, source management UI and retrieval benchmarks.
- Final completion state: NOT_STARTED

### FR-058

- Requirement description: Support entity extraction and knowledge graph links where useful.
- Acceptance: Entities retain document provenance.
- Owning subsystem: Knowledge
- Implementation location: packages/knowledge/src/evidence-engine.ts; packages/knowledge/src/j05-contracts.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Evidence graph domain is implemented; no document ingestion/indexing service composed into API.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: KnowledgeEvidenceEngine preserves provenance; document entity extraction pipeline absent. Document storage/parser/chunker/embedder/index pipeline, authorized retrieval, source management UI and retrieval benchmarks.
- Final completion state: IN_PROGRESS

### FR-059

- Requirement description: Support domain-specific indexes and retrieval policies.
- Acceptance: Engineering, personal docs, code, and other domains can be independently tuned.
- Owning subsystem: Knowledge
- Implementation location: packages/knowledge/src/evidence-engine.ts; packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Evidence graph domain is implemented; no document ingestion/indexing service composed into API.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Document storage/parser/chunker/embedder/index pipeline, authorized retrieval, source management UI and retrieval benchmarks.
- Final completion state: NOT_STARTED

### FR-060

- Requirement description: Provide knowledge browsing, source management, and ingestion status UI.
- Acceptance: User can see what is indexed and remove/rebuild sources.
- Owning subsystem: Knowledge
- Implementation location: packages/knowledge/src/evidence-engine.ts; packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Evidence graph domain is implemented; no document ingestion/indexing service composed into API.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Document storage/parser/chunker/embedder/index pipeline, authorized retrieval, source management UI and retrieval benchmarks.
- Final completion state: NOT_STARTED

### FR-061

- Requirement description: Represent tasks with objective, owner, scope, status, priority, inputs, outputs, policy, budget, and deadlines if provided.
- Acceptance: Task remains traceable from creation through completion/cancel.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### FR-062

- Requirement description: Create explicit plans for multi-step execution with checkpoints.
- Acceptance: User/system can inspect current step and next step.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### FR-063

- Requirement description: Execute steps idempotently where possible and avoid duplicate irreversible actions on retry.
- Acceptance: Retry tests do not duplicate protected operations.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### FR-064

- Requirement description: Persist task/agent state independently from model context.
- Acceptance: Process restart can resume from checkpoint.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### FR-065

- Requirement description: Stop on permission denial, invalid identity, policy conflict, or emergency stop.
- Acceptance: Fault-injection tests confirm hard stop.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: IN_PROGRESS

### FR-066

- Requirement description: Support specialized agents with fixed role, tools, memory scope, policies, and budgets.
- Acceptance: Agent manifest can be reviewed before activation.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### FR-067

- Requirement description: Support delegation from orchestrator to agents without authority amplification.
- Acceptance: Child agent permissions are subset of delegator/task scope.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: IN_PROGRESS

### FR-068

- Requirement description: Use verifier/evaluator steps for tasks where correctness can be checked.
- Acceptance: Verification result gates task completion.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### FR-069

- Requirement description: Support pause, resume, cancel, retry, rollback, and manual takeover.
- Acceptance: All controls work during active execution.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### FR-070

- Requirement description: Track intermediate artifacts and evidence.
- Acceptance: Final task result links to outputs and verification evidence.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### FR-071

- Requirement description: Support parallelizable sub-tasks with concurrency limits.
- Acceptance: Scheduler respects resource/cost/tool contention limits.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### FR-072

- Requirement description: Support learned task templates only after human review and versioning.
- Acceptance: Template change cannot silently expand permissions.
- Owning subsystem: Agents and Tasks
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### FR-073

- Requirement description: Register every tool with name, version, input/output schema, risk class, required permissions, timeout, idempotency, and audit policy.
- Acceptance: Tool cannot execute if manifest or policy metadata is missing.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Registry validates metadata; real tool registration and durable execution composition pending. Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### FR-074

- Requirement description: Validate structured inputs before invocation.
- Acceptance: Malformed/model-injected parameters are rejected.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### FR-075

- Requirement description: Run tools under least-privilege credentials and isolated service identities.
- Acceptance: Credential scope tests show tool cannot access unrelated resources.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### FR-076

- Requirement description: Classify actions as read, reversible write, irreversible/high-impact, financial/legal, security-critical, or physical.
- Acceptance: Policy maps each class to approval requirements.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### FR-077

- Requirement description: Capture invocation, parameters (with secret redaction), principal, approvals, timestamps, result, and error.
- Acceptance: Audit reconstructs every consequential call.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### FR-078

- Requirement description: Protect against prompt injection from tool outputs and retrieved external content.
- Acceptance: Untrusted content cannot issue privileged tool calls.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### FR-079

- Requirement description: Support transactional/rollback behavior where integration allows it.
- Acceptance: Failed multi-step operation reverts or surfaces explicit partial state.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### FR-080

- Requirement description: Support tool health, rate limits, quotas, and circuit breakers.
- Acceptance: Repeated failure opens circuit and prevents cascading retries.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### FR-081

- Requirement description: Support human preview for high-impact generated payloads.
- Acceptance: User sees exact target/action before approval.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### FR-082

- Requirement description: Support connection lifecycle: connect, inspect scopes, rotate credentials, revoke, disconnect.
- Acceptance: Revocation immediately blocks new calls.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### FR-083

- Requirement description: Support sandboxed code/computer-use environments.
- Acceptance: Execution is isolated from production secrets and host by default.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: NOT_STARTED

### FR-084

- Requirement description: Support tool composition into versioned workflows.
- Acceptance: Workflow cannot bypass per-tool policy.
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### FR-085

- Requirement description: Define a normalized event envelope with ID, source, type, timestamp, subject, payload, sensitivity, and correlation ID.
- Acceptance: All event producers/consumers pass schema validation.
- Owning subsystem: Events and Proactivity
- Implementation location: packages/events/src/j08-runtime.ts; packages/events/src/j08-ingress.ts; packages/storage/src/event-store.ts; packages/storage/src/event-subscriptions.ts; apps/worker/src/main.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j08-hardening.test.ts; tests/integration/j08-events.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Durable adapter tests exist; active worker accepts only foundation.ping.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Versioned domain envelopes exist; active worker still uses older foundation envelope. Compose scheduler/outbox/subscriptions/ingress into worker with governed execution and operational UI.
- Final completion state: IN_PROGRESS

### FR-086

- Requirement description: Separate event detection from action authorization.
- Acceptance: Receiving an event alone never grants execution authority.
- Owning subsystem: Events and Proactivity
- Implementation location: packages/events/src/j08-runtime.ts; packages/events/src/j08-ingress.ts; packages/storage/src/event-store.ts; packages/storage/src/event-subscriptions.ts; apps/worker/src/main.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j08-hardening.test.ts; tests/integration/j08-events.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Durable adapter tests exist; active worker accepts only foundation.ping.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Compose scheduler/outbox/subscriptions/ingress into worker with governed execution and operational UI.
- Final completion state: IN_PROGRESS

### FR-087

- Requirement description: Support schedules, webhooks, service events, task events, and device/sensor events.
- Acceptance: Each source can be enabled/disabled and scoped.
- Owning subsystem: Events and Proactivity
- Implementation location: packages/events/src/j08-runtime.ts; packages/events/src/j08-ingress.ts; packages/storage/src/event-store.ts; packages/storage/src/event-subscriptions.ts; apps/worker/src/main.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j08-hardening.test.ts; tests/integration/j08-events.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Durable adapter tests exist; active worker accepts only foundation.ping.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Compose scheduler/outbox/subscriptions/ingress into worker with governed execution and operational UI.
- Final completion state: IN_PROGRESS

### FR-088

- Requirement description: Support condition watchers with cooldown, deduplication, threshold/hysteresis, and notification policies.
- Acceptance: Repeated noisy events do not create alert storms.
- Owning subsystem: Events and Proactivity
- Implementation location: packages/events/src/j08-runtime.ts; packages/events/src/j08-ingress.ts; packages/storage/src/event-store.ts; packages/storage/src/event-subscriptions.ts; apps/worker/src/main.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j08-hardening.test.ts; tests/integration/j08-events.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Durable adapter tests exist; active worker accepts only foundation.ping.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Compose scheduler/outbox/subscriptions/ingress into worker with governed execution and operational UI.
- Final completion state: IN_PROGRESS

### FR-089

- Requirement description: Persist durable event/task state for important automations.
- Acceptance: Restart does not lose scheduled or acknowledged state.
- Owning subsystem: Events and Proactivity
- Implementation location: packages/events/src/j08-runtime.ts; packages/events/src/j08-ingress.ts; packages/storage/src/event-store.ts; packages/storage/src/event-subscriptions.ts; apps/worker/src/main.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j08-hardening.test.ts; tests/integration/j08-events.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Durable adapter tests exist; active worker accepts only foundation.ping.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Postgres event/outbox repositories exist; active worker lacks production scheduler and recovery wiring. Compose scheduler/outbox/subscriptions/ingress into worker with governed execution and operational UI.
- Final completion state: IN_PROGRESS

### FR-090

- Requirement description: Support quiet hours, channel preferences, urgency, escalation, and acknowledgement.
- Acceptance: Notification behavior follows user-configured policy.
- Owning subsystem: Events and Proactivity
- Implementation location: packages/events/src/j08-runtime.ts; packages/events/src/j08-ingress.ts; packages/storage/src/event-store.ts; packages/storage/src/event-subscriptions.ts; apps/worker/src/main.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j08-hardening.test.ts; tests/integration/j08-events.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Durable adapter tests exist; active worker accepts only foundation.ping.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Compose scheduler/outbox/subscriptions/ingress into worker with governed execution and operational UI.
- Final completion state: NOT_STARTED

### FR-091

- Requirement description: Support proactive suggestions without execution.
- Acceptance: System can surface opportunities separately from authorized automations.
- Owning subsystem: Events and Proactivity
- Implementation location: packages/events/src/j08-runtime.ts; packages/events/src/j08-ingress.ts; packages/storage/src/event-store.ts; packages/storage/src/event-subscriptions.ts; apps/worker/src/main.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j08-hardening.test.ts; tests/integration/j08-events.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Durable adapter tests exist; active worker accepts only foundation.ping.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Compose scheduler/outbox/subscriptions/ingress into worker with governed execution and operational UI.
- Final completion state: NOT_STARTED

### FR-092

- Requirement description: Correlate multiple events into higher-level situations.
- Acceptance: Rules/models can generate a situation event with traceable evidence.
- Owning subsystem: Events and Proactivity
- Implementation location: packages/events/src/j08-runtime.ts; packages/events/src/j08-ingress.ts; packages/storage/src/event-store.ts; packages/storage/src/event-subscriptions.ts; apps/worker/src/main.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j08-hardening.test.ts; tests/integration/j08-events.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Durable adapter tests exist; active worker accepts only foundation.ping.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Compose scheduler/outbox/subscriptions/ingress into worker with governed execution and operational UI.
- Final completion state: NOT_STARTED

### FR-093

- Requirement description: Support simulation/dry-run of automation rules before activation.
- Acceptance: User can inspect sample triggers and proposed actions.
- Owning subsystem: Events and Proactivity
- Implementation location: packages/events/src/j08-runtime.ts; packages/events/src/j08-ingress.ts; packages/storage/src/event-store.ts; packages/storage/src/event-subscriptions.ts; apps/worker/src/main.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j08-hardening.test.ts; tests/integration/j08-events.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Durable adapter tests exist; active worker accepts only foundation.ping.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Compose scheduler/outbox/subscriptions/ingress into worker with governed execution and operational UI.
- Final completion state: NOT_STARTED

### FR-094

- Requirement description: Support speech-to-text and text-to-speech through provider-neutral adapters.
- Acceptance: At least one local/offline fallback path exists for basic commands.
- Owning subsystem: Voice and Vision
- Implementation location: apps/desktop/presence/microphone.mjs; apps/web/app/home/speech.ts; apps/web/app/home/read-aloud.tsx
- Current status: NOT_STARTED
- Tests: apps/desktop/presence/microphone.test.mjs; tests/unit/local-read-aloud.test.ts; tests/home-ui/home.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Microphone resource lifecycle and synthetic speech controls tested; no STT/vision/provider voice runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Voice provider contracts, VAD/STT/TTS engines, capture consent, real-device loop and latency/privacy measurement.
- Final completion state: NOT_STARTED

### FR-095

- Requirement description: Expose explicit microphone/camera state and permissions.
- Acceptance: No hidden capture; UI/OS-level indicator is present.
- Owning subsystem: Voice and Vision
- Implementation location: apps/desktop/presence/microphone.mjs; apps/web/app/home/speech.ts; apps/web/app/home/read-aloud.tsx
- Current status: IN_PROGRESS
- Tests: apps/desktop/presence/microphone.test.mjs; tests/unit/local-read-aloud.test.ts; tests/home-ui/home.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Microphone resource lifecycle and synthetic speech controls tested; no STT/vision/provider voice runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Explicit desktop microphone and web speech controls; camera consent/capture implementation absent. Voice provider contracts, VAD/STT/TTS engines, capture consent, real-device loop and latency/privacy measurement.
- Final completion state: IN_PROGRESS

### FR-096

- Requirement description: Support wake-word or push-to-talk modes with configurable privacy behavior.
- Acceptance: Wake-word processing can run locally where supported.
- Owning subsystem: Voice and Vision
- Implementation location: apps/desktop/presence/microphone.mjs; apps/web/app/home/speech.ts; apps/web/app/home/read-aloud.tsx
- Current status: IN_PROGRESS
- Tests: apps/desktop/presence/microphone.test.mjs; tests/unit/local-read-aloud.test.ts; tests/home-ui/home.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Microphone resource lifecycle and synthetic speech controls tested; no STT/vision/provider voice runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Voice provider contracts, VAD/STT/TTS engines, capture consent, real-device loop and latency/privacy measurement.
- Final completion state: IN_PROGRESS

### FR-097

- Requirement description: Support speaker recognition as a contextual factor, not sole high-risk authentication.
- Acceptance: Spoofed voice cannot approve protected actions alone.
- Owning subsystem: Voice and Vision
- Implementation location: apps/desktop/presence/microphone.mjs; apps/web/app/home/speech.ts; apps/web/app/home/read-aloud.tsx
- Current status: NOT_STARTED
- Tests: apps/desktop/presence/microphone.test.mjs; tests/unit/local-read-aloud.test.ts; tests/home-ui/home.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Microphone resource lifecycle and synthetic speech controls tested; no STT/vision/provider voice runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Voice provider contracts, VAD/STT/TTS engines, capture consent, real-device loop and latency/privacy measurement.
- Final completion state: NOT_STARTED

### FR-098

- Requirement description: Support image/screen understanding with object/text/scene references.
- Acceptance: User can refer to visible items and model receives authorized image context.
- Owning subsystem: Voice and Vision
- Implementation location: apps/desktop/presence/microphone.mjs; apps/web/app/home/speech.ts; apps/web/app/home/read-aloud.tsx
- Current status: NOT_STARTED
- Tests: apps/desktop/presence/microphone.test.mjs; tests/unit/local-read-aloud.test.ts; tests/home-ui/home.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Microphone resource lifecycle and synthetic speech controls tested; no STT/vision/provider voice runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Voice provider contracts, VAD/STT/TTS engines, capture consent, real-device loop and latency/privacy measurement.
- Final completion state: NOT_STARTED

### FR-099

- Requirement description: Support visual OCR and structured extraction with provenance.
- Acceptance: Extracted fields preserve image/file reference.
- Owning subsystem: Voice and Vision
- Implementation location: apps/desktop/presence/microphone.mjs; apps/web/app/home/speech.ts; apps/web/app/home/read-aloud.tsx
- Current status: NOT_STARTED
- Tests: apps/desktop/presence/microphone.test.mjs; tests/unit/local-read-aloud.test.ts; tests/home-ui/home.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Microphone resource lifecycle and synthetic speech controls tested; no STT/vision/provider voice runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Voice provider contracts, VAD/STT/TTS engines, capture consent, real-device loop and latency/privacy measurement.
- Final completion state: NOT_STARTED

### FR-100

- Requirement description: Support multi-camera/device sensor fusion for defined environments.
- Acceptance: World-state confidence increases/decreases based on source agreement.
- Owning subsystem: Voice and Vision
- Implementation location: apps/desktop/presence/microphone.mjs; apps/web/app/home/speech.ts; apps/web/app/home/read-aloud.tsx
- Current status: NOT_STARTED
- Tests: apps/desktop/presence/microphone.test.mjs; tests/unit/local-read-aloud.test.ts; tests/home-ui/home.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Microphone resource lifecycle and synthetic speech controls tested; no STT/vision/provider voice runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Voice provider contracts, VAD/STT/TTS engines, capture consent, real-device loop and latency/privacy measurement.
- Final completion state: NOT_STARTED

### FR-101

- Requirement description: Support optional face recognition only under explicit consent and legal/privacy rules.
- Acceptance: Feature can be completely disabled and deletes templates on request.
- Owning subsystem: Voice and Vision
- Implementation location: apps/desktop/presence/microphone.mjs; apps/web/app/home/speech.ts; apps/web/app/home/read-aloud.tsx
- Current status: NOT_STARTED
- Tests: apps/desktop/presence/microphone.test.mjs; tests/unit/local-read-aloud.test.ts; tests/home-ui/home.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Microphone resource lifecycle and synthetic speech controls tested; no STT/vision/provider voice runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Voice provider contracts, VAD/STT/TTS engines, capture consent, real-device loop and latency/privacy measurement.
- Final completion state: NOT_STARTED

### FR-102

- Requirement description: Support interruption, barge-in, and low-latency response for voice mode.
- Acceptance: Voice interaction meets latency target under nominal conditions.
- Owning subsystem: Voice and Vision
- Implementation location: apps/desktop/presence/microphone.mjs; apps/web/app/home/speech.ts; apps/web/app/home/read-aloud.tsx
- Current status: NOT_STARTED
- Tests: apps/desktop/presence/microphone.test.mjs; tests/unit/local-read-aloud.test.ts; tests/home-ui/home.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Microphone resource lifecycle and synthetic speech controls tested; no STT/vision/provider voice runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Voice provider contracts, VAD/STT/TTS engines, capture consent, real-device loop and latency/privacy measurement.
- Final completion state: NOT_STARTED

### FR-103

- Requirement description: Support depth/LiDAR/pose inputs for future spatial/robotic use.
- Acceptance: Sensor adapters publish normalized observations to world-state service.
- Owning subsystem: Voice and Vision
- Implementation location: apps/desktop/presence/microphone.mjs; apps/web/app/home/speech.ts; apps/web/app/home/read-aloud.tsx
- Current status: NOT_STARTED
- Tests: apps/desktop/presence/microphone.test.mjs; tests/unit/local-read-aloud.test.ts; tests/home-ui/home.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Microphone resource lifecycle and synthetic speech controls tested; no STT/vision/provider voice runtime.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Voice provider contracts, VAD/STT/TTS engines, capture consent, real-device loop and latency/privacy measurement.
- Final completion state: NOT_STARTED

### FR-104

- Requirement description: Represent each device with unique identity, owner, capabilities, trust state, firmware/software metadata, and command/event schemas.
- Acceptance: Unknown device cannot receive privileged commands.
- Owning subsystem: Devices
- Implementation location: packages/devices/src/index.ts; packages/identity/src/engine.ts
- Current status: NOT_STARTED
- Tests: tests/security/identity.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Identity device trust exists; device-control registry is an interface, with no actual actuator driver or deterministic safety controller.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Canonical device registry, authenticated transport, safe drivers/interlocks, telemetry and command verification.
- Final completion state: NOT_STARTED

### FR-105

- Requirement description: Use authenticated, encrypted communication for device control where supported.
- Acceptance: MITM/replay tests fail.
- Owning subsystem: Devices
- Implementation location: packages/devices/src/index.ts; packages/identity/src/engine.ts
- Current status: NOT_STARTED
- Tests: tests/security/identity.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Identity device trust exists; device-control registry is an interface, with no actual actuator driver or deterministic safety controller.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Canonical device registry, authenticated transport, safe drivers/interlocks, telemetry and command verification.
- Final completion state: NOT_STARTED

### FR-106

- Requirement description: Define safe default state and command timeout behavior for actuators.
- Acceptance: Lost connection does not leave device in unsafe active state.
- Owning subsystem: Devices
- Implementation location: packages/devices/src/index.ts; packages/identity/src/engine.ts
- Current status: NOT_STARTED
- Tests: tests/security/identity.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Identity device trust exists; device-control registry is an interface, with no actual actuator driver or deterministic safety controller.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Canonical device registry, authenticated transport, safe drivers/interlocks, telemetry and command verification.
- Final completion state: NOT_STARTED

### FR-107

- Requirement description: Support local device gateways for protocols such as Matter/MQTT/REST or vendor APIs.
- Acceptance: Cloud outage does not necessarily prevent local-safe control.
- Owning subsystem: Devices
- Implementation location: packages/devices/src/index.ts; packages/identity/src/engine.ts
- Current status: NOT_STARTED
- Tests: tests/security/identity.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Identity device trust exists; device-control registry is an interface, with no actual actuator driver or deterministic safety controller.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Canonical device registry, authenticated transport, safe drivers/interlocks, telemetry and command verification.
- Final completion state: NOT_STARTED

### FR-108

- Requirement description: Expose device state, last update, health, and pending command state.
- Acceptance: UI distinguishes observed state from desired state.
- Owning subsystem: Devices
- Implementation location: packages/devices/src/index.ts; packages/identity/src/engine.ts
- Current status: NOT_STARTED
- Tests: tests/security/identity.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Identity device trust exists; device-control registry is an interface, with no actual actuator driver or deterministic safety controller.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Canonical device registry, authenticated transport, safe drivers/interlocks, telemetry and command verification.
- Final completion state: NOT_STARTED

### FR-109

- Requirement description: Classify device commands by risk and require appropriate approval.
- Acceptance: Locks, access control, vehicles, heating, and actuators have stricter policy than lights.
- Owning subsystem: Devices
- Implementation location: packages/devices/src/index.ts; packages/identity/src/engine.ts
- Current status: NOT_STARTED
- Tests: tests/security/identity.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Identity device trust exists; device-control registry is an interface, with no actual actuator driver or deterministic safety controller.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Canonical device registry, authenticated transport, safe drivers/interlocks, telemetry and command verification.
- Final completion state: NOT_STARTED

### FR-110

- Requirement description: Support room/zone grouping and routines.
- Acceptance: Groups cannot expand device permissions beyond member scopes.
- Owning subsystem: Devices
- Implementation location: packages/devices/src/index.ts; packages/identity/src/engine.ts
- Current status: NOT_STARTED
- Tests: tests/security/identity.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Identity device trust exists; device-control registry is an interface, with no actual actuator driver or deterministic safety controller.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Canonical device registry, authenticated transport, safe drivers/interlocks, telemetry and command verification.
- Final completion state: NOT_STARTED

### FR-111

- Requirement description: Support sensor streams with retention/downsampling rules.
- Acceptance: High-frequency telemetry does not overwhelm core database.
- Owning subsystem: Devices
- Implementation location: packages/devices/src/index.ts; packages/identity/src/engine.ts
- Current status: NOT_STARTED
- Tests: tests/security/identity.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Identity device trust exists; device-control registry is an interface, with no actual actuator driver or deterministic safety controller.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Canonical device registry, authenticated transport, safe drivers/interlocks, telemetry and command verification.
- Final completion state: NOT_STARTED

### FR-112

- Requirement description: Support anomaly detection for device health and state.
- Acceptance: Alerts include evidence and do not auto-escalate privileges.
- Owning subsystem: Devices
- Implementation location: packages/devices/src/index.ts; packages/identity/src/engine.ts
- Current status: NOT_STARTED
- Tests: tests/security/identity.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Identity device trust exists; device-control registry is an interface, with no actual actuator driver or deterministic safety controller.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Canonical device registry, authenticated transport, safe drivers/interlocks, telemetry and command verification.
- Final completion state: NOT_STARTED

### FR-113

- Requirement description: Support narrow robotic devices only through dedicated safety controller and interlocks.
- Acceptance: LLM is not in direct motor-control loop.
- Owning subsystem: Devices
- Implementation location: packages/devices/src/index.ts; packages/identity/src/engine.ts
- Current status: NOT_STARTED
- Tests: tests/security/identity.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Identity device trust exists; device-control registry is an interface, with no actual actuator driver or deterministic safety controller.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Canonical device registry, authenticated transport, safe drivers/interlocks, telemetry and command verification.
- Final completion state: NOT_STARTED

### FR-114

- Requirement description: Represent entities with type, identity, attributes, relationships, location/containment, state, source, and confidence.
- Acceptance: World-state query can explain where each fact came from.
- Owning subsystem: Digital Twin
- Implementation location: packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Related knowledge graph schema is not a canonical world-state implementation.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: World-state service, temporal observations/conflict semantics, authorized query API and spatial UI.
- Final completion state: NOT_STARTED

### FR-115

- Requirement description: Separate observed state, inferred state, desired state, and commanded state.
- Acceptance: UI/API can distinguish all four.
- Owning subsystem: Digital Twin
- Implementation location: packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Related knowledge graph schema is not a canonical world-state implementation.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: World-state service, temporal observations/conflict semantics, authorized query API and spatial UI.
- Final completion state: NOT_STARTED

### FR-116

- Requirement description: Merge observations from devices, user statements, tools, and sensors using source/confidence rules.
- Acceptance: Conflicts are preserved and resolved according to policy.
- Owning subsystem: Digital Twin
- Implementation location: packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Related knowledge graph schema is not a canonical world-state implementation.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: World-state service, temporal observations/conflict semantics, authorized query API and spatial UI.
- Final completion state: NOT_STARTED

### FR-117

- Requirement description: Support spatial hierarchy: site -> building -> floor -> room -> zone -> device/object.
- Acceptance: Entities inherit only explicitly defined policies.
- Owning subsystem: Digital Twin
- Implementation location: packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Related knowledge graph schema is not a canonical world-state implementation.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: World-state service, temporal observations/conflict semantics, authorized query API and spatial UI.
- Final completion state: NOT_STARTED

### FR-118

- Requirement description: Support temporal state/history for important entities.
- Acceptance: User can inspect state changes over time.
- Owning subsystem: Digital Twin
- Implementation location: packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Related knowledge graph schema is not a canonical world-state implementation.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: World-state service, temporal observations/conflict semantics, authorized query API and spatial UI.
- Final completion state: NOT_STARTED

### FR-119

- Requirement description: Support geospatial/spatial references where useful.
- Acceptance: Coordinates are optional and sensitivity controlled.
- Owning subsystem: Digital Twin
- Implementation location: packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Related knowledge graph schema is not a canonical world-state implementation.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: World-state service, temporal observations/conflict semantics, authorized query API and spatial UI.
- Final completion state: NOT_STARTED

### FR-120

- Requirement description: Expose a query API to agents/tools without granting them raw unrestricted telemetry.
- Acceptance: Policy-filtered views are enforced.
- Owning subsystem: Digital Twin
- Implementation location: packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Related knowledge graph schema is not a canonical world-state implementation.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: World-state service, temporal observations/conflict semantics, authorized query API and spatial UI.
- Final completion state: NOT_STARTED

### FR-121

- Requirement description: Support 2D/3D visualization and future AR anchoring.
- Acceptance: Visualization consumes same canonical entity/state model.
- Owning subsystem: Digital Twin
- Implementation location: packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Related knowledge graph schema is not a canonical world-state implementation.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: World-state service, temporal observations/conflict semantics, authorized query API and spatial UI.
- Final completion state: NOT_STARTED

### FR-122

- Requirement description: Support simulation tools as typed tools with versioned inputs/outputs and reproducibility metadata.
- Acceptance: Run can be reproduced from saved configuration and artifact hashes.
- Owning subsystem: Simulation and Robotics
- Implementation location: packages/tools/src/j07-contracts.ts; packages/devices/src/index.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j07-hardening.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Generic tool/device contracts only; no simulation experiment runtime or robotics control stack.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Reproducible experiment service, simulation adapters, deterministic independent safety stack and hardware qualification.
- Final completion state: NOT_STARTED

### FR-123

- Requirement description: Track experiments, hypotheses, parameters, results, comparisons, and conclusions.
- Acceptance: Experiment history links to source artifacts and models/tools used.
- Owning subsystem: Simulation and Robotics
- Implementation location: packages/tools/src/j07-contracts.ts; packages/devices/src/index.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j07-hardening.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Generic tool/device contracts only; no simulation experiment runtime or robotics control stack.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Reproducible experiment service, simulation adapters, deterministic independent safety stack and hardware qualification.
- Final completion state: NOT_STARTED

### FR-124

- Requirement description: Support optimization loops with explicit search space, objective, constraints, and budget.
- Acceptance: Loop stops at budget/constraint limits.
- Owning subsystem: Simulation and Robotics
- Implementation location: packages/tools/src/j07-contracts.ts; packages/devices/src/index.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j07-hardening.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Generic tool/device contracts only; no simulation experiment runtime or robotics control stack.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Reproducible experiment service, simulation adapters, deterministic independent safety stack and hardware qualification.
- Final completion state: NOT_STARTED

### FR-125

- Requirement description: Support CAD/CAE/physics tool adapters where licensed/available.
- Acceptance: Generated design recommendation is clearly distinct from validated engineering result.
- Owning subsystem: Simulation and Robotics
- Implementation location: packages/tools/src/j07-contracts.ts; packages/devices/src/index.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j07-hardening.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Generic tool/device contracts only; no simulation experiment runtime or robotics control stack.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Reproducible experiment service, simulation adapters, deterministic independent safety stack and hardware qualification.
- Final completion state: NOT_STARTED

### FR-126

- Requirement description: For robotics, separate high-level task planning from deterministic motion/control stack.
- Acceptance: Generative model cannot directly command raw motor currents/torques.
- Owning subsystem: Simulation and Robotics
- Implementation location: packages/tools/src/j07-contracts.ts; packages/devices/src/index.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j07-hardening.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Generic tool/device contracts only; no simulation experiment runtime or robotics control stack.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Reproducible experiment service, simulation adapters, deterministic independent safety stack and hardware qualification.
- Final completion state: NOT_STARTED

### FR-127

- Requirement description: Require simulation, workspace constraints, collision checks, e-stop, and human override for physical motion.
- Acceptance: Safety controller can stop motion independent of AI runtime.
- Owning subsystem: Simulation and Robotics
- Implementation location: packages/tools/src/j07-contracts.ts; packages/devices/src/index.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j07-hardening.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Generic tool/device contracts only; no simulation experiment runtime or robotics control stack.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Reproducible experiment service, simulation adapters, deterministic independent safety stack and hardware qualification.
- Final completion state: NOT_STARTED

### FR-128

- Requirement description: Record robot mission, commands, sensor state, safety events, and operator interventions.
- Acceptance: Incident can be reconstructed from logs.
- Owning subsystem: Simulation and Robotics
- Implementation location: packages/tools/src/j07-contracts.ts; packages/devices/src/index.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j07-hardening.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Generic tool/device contracts only; no simulation experiment runtime or robotics control stack.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Reproducible experiment service, simulation adapters, deterministic independent safety stack and hardware qualification.
- Final completion state: NOT_STARTED

### FR-129

- Requirement description: Encrypt data in transit and sensitive data at rest.
- Acceptance: Security review verifies TLS and storage encryption coverage.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### FR-130

- Requirement description: Use envelope encryption / KMS or equivalent for high-value keys and secrets.
- Acceptance: Application database does not contain plaintext master secrets.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### FR-131

- Requirement description: Maintain a secrets vault or secure secret-provider abstraction.
- Acceptance: Tool credentials are referenced by secret ID, not embedded in prompts/logs.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### FR-132

- Requirement description: Use least-privilege service accounts and network segmentation.
- Acceptance: Compromised worker cannot automatically access all production resources.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### FR-133

- Requirement description: Protect against prompt injection, indirect prompt injection, tool-result poisoning, and retrieval poisoning.
- Acceptance: Security test corpus blocks privilege-changing instructions from untrusted content.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### FR-134

- Requirement description: Apply dependency, container, source, and secret scanning in CI.
- Acceptance: Critical findings block release according to policy.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Existing CI gates lack complete dependency/container/source/secret scanning release policy. Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### FR-135

- Requirement description: Implement rate limiting, abuse controls, replay protection, and request integrity for privileged APIs.
- Acceptance: Attack simulations are detected or rejected.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### FR-136

- Requirement description: Maintain secure backups and tested restore procedures.
- Acceptance: Restore drill passes without relying on compromised production keys.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### FR-137

- Requirement description: Support security event monitoring and anomaly alerts.
- Acceptance: Auth/tool/device anomalies produce auditable alerts.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### FR-138

- Requirement description: Maintain a documented threat model and update it for each major capability.
- Acceptance: Release gate includes threat-model delta review.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### FR-139

- Requirement description: Support key rotation and credential revocation without full system rebuild.
- Acceptance: Rotation drill succeeds.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### FR-140

- Requirement description: Support hardware-backed keys/secure enclave/TPM where available.
- Acceptance: Root/device secrets can use platform hardware protection.
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: NOT_STARTED
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: NOT_STARTED

### FR-141

- Requirement description: Use explicit policy evaluation before every consequential tool/device action.
- Acceptance: No direct model-to-tool bypass path exists.
- Owning subsystem: Permissions and Approvals
- Implementation location: packages/security/src/governance.ts; packages/security/src/governance-policy.ts; packages/core/src/permission-approval-aware-conversation.ts; apps/web/app/identity/identity-console.tsx
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/governed-gateway.test.ts; tests/identity-e2e/governance-flow.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Exact approvals are tested in foundation flow; Home conversation returns approval:null/tool:null.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Wire runtime action proposals and exact approval UI through existing gateway; qualify concrete actions.
- Final completion state: IN_PROGRESS

### FR-142

- Requirement description: Policy inputs include principal, device/session trust, action/tool, target resource, data sensitivity, risk class, task scope, and recent approval.
- Acceptance: Test matrix covers combinations.
- Owning subsystem: Permissions and Approvals
- Implementation location: packages/security/src/governance.ts; packages/security/src/governance-policy.ts; packages/core/src/permission-approval-aware-conversation.ts; apps/web/app/identity/identity-console.tsx
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/governed-gateway.test.ts; tests/identity-e2e/governance-flow.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Exact approvals are tested in foundation flow; Home conversation returns approval:null/tool:null.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Wire runtime action proposals and exact approval UI through existing gateway; qualify concrete actions.
- Final completion state: IN_PROGRESS

### FR-143

- Requirement description: Support allow, deny, require approval, require step-up authentication, and allow-with-constraints decisions.
- Acceptance: Tool layer enforces returned decision.
- Owning subsystem: Permissions and Approvals
- Implementation location: packages/security/src/governance.ts; packages/security/src/governance-policy.ts; packages/core/src/permission-approval-aware-conversation.ts; apps/web/app/identity/identity-console.tsx
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/governed-gateway.test.ts; tests/identity-e2e/governance-flow.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Exact approvals are tested in foundation flow; Home conversation returns approval:null/tool:null.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Wire runtime action proposals and exact approval UI through existing gateway; qualify concrete actions.
- Final completion state: IN_PROGRESS

### FR-144

- Requirement description: Approval requests show exact action, target, scope, material parameters, and expected effect.
- Acceptance: User can make informed approval decision.
- Owning subsystem: Permissions and Approvals
- Implementation location: packages/security/src/governance.ts; packages/security/src/governance-policy.ts; packages/core/src/permission-approval-aware-conversation.ts; apps/web/app/identity/identity-console.tsx
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/governed-gateway.test.ts; tests/identity-e2e/governance-flow.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Exact approvals are tested in foundation flow; Home conversation returns approval:null/tool:null.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Wire runtime action proposals and exact approval UI through existing gateway; qualify concrete actions.
- Final completion state: IN_PROGRESS

### FR-145

- Requirement description: Approval tokens are scoped, time-limited, single-use or bounded-use, and non-transferable.
- Acceptance: Replay/cross-task approval tests fail.
- Owning subsystem: Permissions and Approvals
- Implementation location: packages/security/src/governance.ts; packages/security/src/governance-policy.ts; packages/core/src/permission-approval-aware-conversation.ts; apps/web/app/identity/identity-console.tsx
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/governed-gateway.test.ts; tests/identity-e2e/governance-flow.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Exact approvals are tested in foundation flow; Home conversation returns approval:null/tool:null.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Wire runtime action proposals and exact approval UI through existing gateway; qualify concrete actions.
- Final completion state: IN_PROGRESS

### FR-146

- Requirement description: Support persistent user policies such as always allow low-risk read access to a specific project.
- Acceptance: Policy UI shows scope and revocation.
- Owning subsystem: Permissions and Approvals
- Implementation location: packages/security/src/governance.ts; packages/security/src/governance-policy.ts; packages/core/src/permission-approval-aware-conversation.ts; apps/web/app/identity/identity-console.tsx
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/governed-gateway.test.ts; tests/identity-e2e/governance-flow.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Exact approvals are tested in foundation flow; Home conversation returns approval:null/tool:null.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Wire runtime action proposals and exact approval UI through existing gateway; qualify concrete actions.
- Final completion state: IN_PROGRESS

### FR-147

- Requirement description: Support budgets/limits: spend, rows changed, files affected, recipients, environments, device ranges, time windows.
- Acceptance: Actions outside constraint are denied or re-approved.
- Owning subsystem: Permissions and Approvals
- Implementation location: packages/security/src/governance.ts; packages/security/src/governance-policy.ts; packages/core/src/permission-approval-aware-conversation.ts; apps/web/app/identity/identity-console.tsx
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/governed-gateway.test.ts; tests/identity-e2e/governance-flow.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Exact approvals are tested in foundation flow; Home conversation returns approval:null/tool:null.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Wire runtime action proposals and exact approval UI through existing gateway; qualify concrete actions.
- Final completion state: IN_PROGRESS

### FR-148

- Requirement description: Support policy simulation before activation.
- Acceptance: User can see example allowed/denied actions.
- Owning subsystem: Permissions and Approvals
- Implementation location: packages/security/src/governance.ts; packages/security/src/governance-policy.ts; packages/core/src/permission-approval-aware-conversation.ts; apps/web/app/identity/identity-console.tsx
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/governed-gateway.test.ts; tests/identity-e2e/governance-flow.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Exact approvals are tested in foundation flow; Home conversation returns approval:null/tool:null.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Wire runtime action proposals and exact approval UI through existing gateway; qualify concrete actions.
- Final completion state: IN_PROGRESS

### FR-149

- Requirement description: Log policy decision reason and policy version.
- Acceptance: Audit can reproduce decision inputs/version.
- Owning subsystem: Permissions and Approvals
- Implementation location: packages/security/src/governance.ts; packages/security/src/governance-policy.ts; packages/core/src/permission-approval-aware-conversation.ts; apps/web/app/identity/identity-console.tsx
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/governed-gateway.test.ts; tests/identity-e2e/governance-flow.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Exact approvals are tested in foundation flow; Home conversation returns approval:null/tool:null.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Wire runtime action proposals and exact approval UI through existing gateway; qualify concrete actions.
- Final completion state: IN_PROGRESS

### FR-150

- Requirement description: Support risk-adaptive step-up based on anomaly/context.
- Acceptance: Adaptive rule can tighten but not weaken hard minimums.
- Owning subsystem: Permissions and Approvals
- Implementation location: packages/security/src/governance.ts; packages/security/src/governance-policy.ts; packages/core/src/permission-approval-aware-conversation.ts; apps/web/app/identity/identity-console.tsx
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/governed-gateway.test.ts; tests/identity-e2e/governance-flow.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Exact approvals are tested in foundation flow; Home conversation returns approval:null/tool:null.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Wire runtime action proposals and exact approval UI through existing gateway; qualify concrete actions.
- Final completion state: IN_PROGRESS

### FR-151

- Requirement description: Classify data by sensitivity and allowed processing locations/providers.
- Acceptance: Policy blocks disallowed egress.
- Owning subsystem: Privacy and Data Control
- Implementation location: packages/shared/src/data.ts; packages/security/src/data-policy.ts; packages/storage/src/retention.ts; packages/storage/src/exports.ts; packages/storage/src/object-deletion.ts
- Current status: IN_PROGRESS
- Tests: tests/security/retention.test.ts; tests/security/storage-boundaries.test.ts; tests/integration/private-data-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Classified foundation storage has lifecycle tests; new product datasets/capture sources are not all integrated.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Apply consent, retention, export and derived deletion to every added product dataset and source.
- Final completion state: IN_PROGRESS

### FR-152

- Requirement description: Provide explicit retention policies for conversations, memory, knowledge, sensor data, tool logs, and audit.
- Acceptance: Retention jobs are tested and produce deletion evidence where applicable.
- Owning subsystem: Privacy and Data Control
- Implementation location: packages/shared/src/data.ts; packages/security/src/data-policy.ts; packages/storage/src/retention.ts; packages/storage/src/exports.ts; packages/storage/src/object-deletion.ts
- Current status: IN_PROGRESS
- Tests: tests/security/retention.test.ts; tests/security/storage-boundaries.test.ts; tests/integration/private-data-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Classified foundation storage has lifecycle tests; new product datasets/capture sources are not all integrated.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Apply consent, retention, export and derived deletion to every added product dataset and source.
- Final completion state: IN_PROGRESS

### FR-153

- Requirement description: Support export of user data in documented portable formats.
- Acceptance: Export includes schema/version and can be validated.
- Owning subsystem: Privacy and Data Control
- Implementation location: packages/shared/src/data.ts; packages/security/src/data-policy.ts; packages/storage/src/retention.ts; packages/storage/src/exports.ts; packages/storage/src/object-deletion.ts
- Current status: IN_PROGRESS
- Tests: tests/security/retention.test.ts; tests/security/storage-boundaries.test.ts; tests/integration/private-data-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Classified foundation storage has lifecycle tests; new product datasets/capture sources are not all integrated.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Apply consent, retention, export and derived deletion to every added product dataset and source.
- Final completion state: IN_PROGRESS

### FR-154

- Requirement description: Support deletion/forgetting workflows consistent with security/audit/legal constraints.
- Acceptance: Deleted personal content is removed from active retrieval and downstream indexes.
- Owning subsystem: Privacy and Data Control
- Implementation location: packages/shared/src/data.ts; packages/security/src/data-policy.ts; packages/storage/src/retention.ts; packages/storage/src/exports.ts; packages/storage/src/object-deletion.ts
- Current status: IN_PROGRESS
- Tests: tests/security/retention.test.ts; tests/security/storage-boundaries.test.ts; tests/integration/private-data-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Classified foundation storage has lifecycle tests; new product datasets/capture sources are not all integrated.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Apply consent, retention, export and derived deletion to every added product dataset and source.
- Final completion state: IN_PROGRESS

### FR-155

- Requirement description: Maintain consent records for microphones, cameras, face/voice templates, connected accounts, and shared contexts.
- Acceptance: Feature stops when consent is revoked.
- Owning subsystem: Privacy and Data Control
- Implementation location: packages/shared/src/data.ts; packages/security/src/data-policy.ts; packages/storage/src/retention.ts; packages/storage/src/exports.ts; packages/storage/src/object-deletion.ts
- Current status: IN_PROGRESS
- Tests: tests/security/retention.test.ts; tests/security/storage-boundaries.test.ts; tests/integration/private-data-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Classified foundation storage has lifecycle tests; new product datasets/capture sources are not all integrated.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Apply consent, retention, export and derived deletion to every added product dataset and source.
- Final completion state: IN_PROGRESS

### FR-156

- Requirement description: Separate raw sensor/media retention from derived metadata.
- Acceptance: User can retain state summaries while deleting raw media when configured.
- Owning subsystem: Privacy and Data Control
- Implementation location: packages/shared/src/data.ts; packages/security/src/data-policy.ts; packages/storage/src/retention.ts; packages/storage/src/exports.ts; packages/storage/src/object-deletion.ts
- Current status: IN_PROGRESS
- Tests: tests/security/retention.test.ts; tests/security/storage-boundaries.test.ts; tests/integration/private-data-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Classified foundation storage has lifecycle tests; new product datasets/capture sources are not all integrated.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Apply consent, retention, export and derived deletion to every added product dataset and source.
- Final completion state: IN_PROGRESS

### FR-157

- Requirement description: Provide provider disclosure for remote model/tool processing.
- Acceptance: UI can show which external providers may receive data.
- Owning subsystem: Privacy and Data Control
- Implementation location: packages/shared/src/data.ts; packages/security/src/data-policy.ts; packages/storage/src/retention.ts; packages/storage/src/exports.ts; packages/storage/src/object-deletion.ts
- Current status: IN_PROGRESS
- Tests: tests/security/retention.test.ts; tests/security/storage-boundaries.test.ts; tests/integration/private-data-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Classified foundation storage has lifecycle tests; new product datasets/capture sources are not all integrated.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Apply consent, retention, export and derived deletion to every added product dataset and source.
- Final completion state: IN_PROGRESS

### FR-158

- Requirement description: Minimize data sent to models/tools by retrieving only necessary context.
- Acceptance: Context audit demonstrates scope minimization.
- Owning subsystem: Privacy and Data Control
- Implementation location: packages/shared/src/data.ts; packages/security/src/data-policy.ts; packages/storage/src/retention.ts; packages/storage/src/exports.ts; packages/storage/src/object-deletion.ts
- Current status: IN_PROGRESS
- Tests: tests/security/retention.test.ts; tests/security/storage-boundaries.test.ts; tests/integration/private-data-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Classified foundation storage has lifecycle tests; new product datasets/capture sources are not all integrated.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Apply consent, retention, export and derived deletion to every added product dataset and source.
- Final completion state: IN_PROGRESS

### FR-159

- Requirement description: Support privacy zones and device/location-specific capture policies.
- Acceptance: Configured zones disable or constrain sensors/actions.
- Owning subsystem: Privacy and Data Control
- Implementation location: packages/shared/src/data.ts; packages/security/src/data-policy.ts; packages/storage/src/retention.ts; packages/storage/src/exports.ts; packages/storage/src/object-deletion.ts
- Current status: NOT_STARTED
- Tests: tests/security/retention.test.ts; tests/security/storage-boundaries.test.ts; tests/integration/private-data-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Classified foundation storage has lifecycle tests; new product datasets/capture sources are not all integrated.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Apply consent, retention, export and derived deletion to every added product dataset and source.
- Final completion state: NOT_STARTED

### FR-160

- Requirement description: Record immutable/append-only audit events for auth, policy, approvals, tool calls, device commands, memory changes, administrative changes, and emergency actions.
- Acceptance: Tamper test detects modification or missing sequence.
- Owning subsystem: Audit and Operations
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Database append-only controls and hashes exist; consequential product paths not all connected. Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

### FR-161

- Requirement description: Store correlation IDs linking user/event -> model run -> plan -> policy -> tool/device -> result.
- Acceptance: Incident trace can reconstruct sequence.
- Owning subsystem: Audit and Operations
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

### FR-162

- Requirement description: Provide an emergency stop that can halt agents, automations, tool execution, and device commands independent of model reasoning.
- Acceptance: E-stop drill immediately blocks new actions.
- Owning subsystem: Audit and Operations
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

### FR-163

- Requirement description: Provide safe-mode startup after severe incident.
- Acceptance: System can start with external tools/automations disabled for recovery.
- Owning subsystem: Audit and Operations
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

### FR-164

- Requirement description: Support revocation of all sessions/integrations/devices from root owner control.
- Acceptance: Global revocation drill succeeds.
- Owning subsystem: Audit and Operations
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

### FR-165

- Requirement description: Provide human-readable activity history with filters by agent/tool/device/project/risk.
- Acceptance: Owner can inspect consequential actions without raw log access.
- Owning subsystem: Audit and Operations
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Home Activities are current-page returned turn events; durable filtered operational history absent. Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

### FR-166

- Requirement description: Provide audit export for incident review.
- Acceptance: Export is integrity verifiable.
- Owning subsystem: Audit and Operations
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

### FR-167

- Requirement description: Maintain backup/restore actions in audit.
- Acceptance: Restore origin and operator are traceable.
- Owning subsystem: Audit and Operations
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

### FR-168

- Requirement description: Support cryptographic chaining/signing or external immutable storage for high-assurance deployments.
- Acceptance: Independent verifier can validate audit integrity.
- Owning subsystem: Audit and Operations
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Hash-chain verification exists; independent verifier deployment and high-assurance qualification absent. Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

### V2-001

- Requirement description: Reproducible context snapshots
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Intelligence
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: IN_PROGRESS

### V2-002

- Requirement description: Explicit runtime state machine
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Core Runtime
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: IN_PROGRESS

### V2-003

- Requirement description: Versioned event envelope with causation/correlation
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Events
- Implementation location: packages/events/src/j08-runtime.ts; packages/events/src/j08-ingress.ts; packages/storage/src/event-store.ts; packages/storage/src/event-subscriptions.ts; apps/worker/src/main.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j08-hardening.test.ts; tests/integration/j08-events.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Durable adapter tests exist; active worker accepts only foundation.ping.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Compose scheduler/outbox/subscriptions/ingress into worker with governed execution and operational UI.
- Final completion state: IN_PROGRESS

### V2-004

- Requirement description: Idempotency contract for side effects
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Tools
- Implementation location: packages/tools/src/j07-registry.ts; packages/tools/src/j07-gateway.ts; packages/tools/src/j07-lifecycle.ts; apps/api/src/tool-runtime.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j07-hardening.test.ts; tests/security/governed-gateway.test.ts; tests/security/gateway.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Executable API tool registry is explicitly synthetic; no production connector or host sandbox qualified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Durable lifecycle store, concrete scoped adapters, real verification/rollback, credential lifecycle and isolation.
- Final completion state: IN_PROGRESS

### V2-005

- Requirement description: Checkpoint-before-consequential-side-effect rule
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Agents
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### V2-006

- Requirement description: Model fallback cannot broaden privacy/permissions
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Models/Security
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: IN_PROGRESS

### V2-007

- Requirement description: External content treated as untrusted data
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Security
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### V2-008

- Requirement description: Knowledge-to-memory promotion is policy controlled
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Memory/Knowledge
- Implementation location: packages/memory/src/records-v2.ts; packages/memory/src/admission.ts; packages/memory/src/retrieval.ts; packages/storage/src/memory-lifecycle.ts; packages/core/src/memory-aware-conversation.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/memory-admission.test.ts; tests/security/j1-memory-aware-conversation-security.test.ts; tests/integration/j05-memory-postgres.test.ts; tests/integration/j05-vector-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Domain and database tests exist; actual conversation HTTP context contains only current input.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Authenticated memory product API/UI, runtime retrieval and mutation, real embeddings and retrieval-quality evaluation.
- Final completion state: IN_PROGRESS

### V2-009

- Requirement description: Provenance-aware derived-data revocation
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Data/Knowledge
- Implementation location: packages/shared/src/data.ts; packages/security/src/data-policy.ts; packages/storage/src/retention.ts; packages/storage/src/exports.ts; packages/storage/src/object-deletion.ts
- Current status: IN_PROGRESS
- Tests: tests/security/retention.test.ts; tests/security/storage-boundaries.test.ts; tests/integration/private-data-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Classified foundation storage has lifecycle tests; new product datasets/capture sources are not all integrated.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Apply consent, retention, export and derived deletion to every added product dataset and source.
- Final completion state: IN_PROGRESS

### V2-010

- Requirement description: Explicit autonomy budgets: time/steps/tokens/cost/actions
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Agents
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### V2-011

- Requirement description: Self-trigger/duplicate proactive-loop prevention
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Events
- Implementation location: packages/events/src/j08-runtime.ts; packages/events/src/j08-ingress.ts; packages/storage/src/event-store.ts; packages/storage/src/event-subscriptions.ts; apps/worker/src/main.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j08-hardening.test.ts; tests/integration/j08-events.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Durable adapter tests exist; active worker accepts only foundation.ping.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Compose scheduler/outbox/subscriptions/ingress into worker with governed execution and operational UI.
- Final completion state: IN_PROGRESS

### V2-012

- Requirement description: Physical commands require deterministic safety interlocks
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Devices
- Implementation location: packages/devices/src/index.ts; packages/identity/src/engine.ts
- Current status: NOT_STARTED
- Tests: tests/security/identity.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Identity device trust exists; device-control registry is an interface, with no actual actuator driver or deterministic safety controller.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Canonical device registry, authenticated transport, safe drivers/interlocks, telemetry and command verification.
- Final completion state: NOT_STARTED

### V2-013

- Requirement description: Language model output cannot directly drive actuators
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Robotics/Security
- Implementation location: packages/tools/src/j07-contracts.ts; packages/devices/src/index.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j07-hardening.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Generic tool/device contracts only; no simulation experiment runtime or robotics control stack.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Reproducible experiment service, simulation adapters, deterministic independent safety stack and hardware qualification.
- Final completion state: NOT_STARTED

### V2-014

- Requirement description: Typed error taxonomy across services
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Core Runtime
- Implementation location: packages/core/src/conversation-session.ts; packages/core/src/context-assembly.ts; packages/core/src/conversation-history.ts; packages/core/src/final-conversation-persistence.ts; apps/api/src/conversation-http.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j1-final-conversation-persistence.test.ts; tests/security/context-matrix.test.ts; tests/integration/j1-conversation-history-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Database history tests exist; HTTP composition does not instantiate durable persistence coordinator or load history into context.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Governed persistence adapter, consent, authenticated history retrieval, restart and cross-session integration.
- Final completion state: IN_PROGRESS

### V2-015

- Requirement description: Trace propagation across models/tools/workers
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Observability
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

### V2-016

- Requirement description: Disaster-recovery restore drill as release evidence
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Operations
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

### V2-017

- Requirement description: Schema/data migrations are versioned and rollback-aware
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Data
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: IN_PROGRESS

### V2-018

- Requirement description: SBOM/dependency/secret scanning release controls
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Supply Chain
- Implementation location: packages/security/src/governance.ts; packages/security/src/envelope.ts; packages/security/src/secrets.ts; packages/storage/src/j10-recovery.ts
- Current status: NOT_STARTED
- Tests: tests/security/governance.test.ts; tests/security/envelope.test.ts; tests/security/secrets.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Substantial negative-path foundation tests; production threat containment and whole-product security remain unverified.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Integrate security into each added runtime; qualified transport, host isolation, supply-chain gates and independent recovery.
- Final completion state: NOT_STARTED

### V2-019

- Requirement description: Per-source retention and raw multimodal retention controls
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Privacy
- Implementation location: packages/shared/src/data.ts; packages/security/src/data-policy.ts; packages/storage/src/retention.ts; packages/storage/src/exports.ts; packages/storage/src/object-deletion.ts
- Current status: IN_PROGRESS
- Tests: tests/security/retention.test.ts; tests/security/storage-boundaries.test.ts; tests/integration/private-data-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Classified foundation storage has lifecycle tests; new product datasets/capture sources are not all integrated.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Apply consent, retention, export and derived deletion to every added product dataset and source.
- Final completion state: IN_PROGRESS

### V2-020

- Requirement description: Device state freshness/confidence semantics
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Digital Twin
- Implementation location: packages/knowledge/src/j05-contracts.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j05-knowledge.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Related knowledge graph schema is not a canonical world-state implementation.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: World-state service, temporal observations/conflict semantics, authorized query API and spatial UI.
- Final completion state: NOT_STARTED

### V2-021

- Requirement description: Independent verification for high-risk actions
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Agents/Security
- Implementation location: packages/agents/src/index.ts; packages/core/src/tool-aware-turn.ts
- Current status: NOT_STARTED
- Tests: tests/unit/j1-tool-aware-turn.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: AgentDefinition and AgentSupervisor are interfaces; AGENT_EXECUTION_ENABLED=false. Tool-aware turn tests do not establish a durable agent scheduler.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Persistent task/step repository, planner/executor/verifier, bounded scheduling and real governed tool integration.
- Final completion state: NOT_STARTED

### V2-022

- Requirement description: Permission inheritance cannot widen through delegation
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Agents/Security
- Implementation location: packages/identity/src/engine.ts; packages/identity/src/contracts.ts; packages/storage/src/identity.ts; apps/api/src/identity-http.ts
- Current status: IN_PROGRESS
- Tests: tests/security/identity.test.ts; tests/security/live-session.test.ts; tests/integration/identity-postgres.test.ts; tests/identity-e2e/identity.spec.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Existing real database and browser qualification harness; physical owner/key ceremony and current complete-product coverage not established.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Close live authority gaps in conversation paths; qualify every protected subsystem and real-device recovery.
- Final completion state: IN_PROGRESS

### V2-023

- Requirement description: Model/provider data-handling metadata in registry
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: Models/Privacy
- Implementation location: packages/models/src/router.ts; packages/models/src/j06-contracts.ts; packages/models/src/ollama-adapter.ts; packages/core/src/model-orchestration.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/local-ollama.test.ts; tests/unit/local-conversation-http.test.ts; tests/security/j1-model-orchestration-security.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: HTTP test uses local protocol fixture; no installed real model inference, quality benchmark or real cloud provider qualification.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Real providers and modality adapters, durable model registry/budgets, outage/offline runtime and benchmark acceptance.
- Final completion state: IN_PROGRESS

### V2-024

- Requirement description: Operational runbooks required before production
- Acceptance: Milestone-specific acceptance procedure and evidence still required
- Owning subsystem: SRE
- Implementation location: packages/audit/src/j09-integrity.ts; packages/audit/src/j09-observability.ts; packages/storage/src/audit-observability.ts; packages/storage/src/j10-recovery.ts
- Current status: IN_PROGRESS
- Tests: tests/unit/j09-hardening.test.ts; tests/integration/j09-audit-postgres.test.ts; tests/integration/j10-recovery-postgres.test.ts. Existing coverage locations; not a claim of full requirement acceptance.
- Integration verification: Append-only database/hash-chain and recovery domain tests exist; no complete operational product trace or independent production witness.
- Security verification: Foundation negative-path coverage is retained; requirement-specific integration, denial/revocation and data-boundary verification remain open.
- Evidence: Source audit at ace0715d00a6d02494a112661a2b82dc6f55f0b6; implementation/test locations above. No complete requirement-level acceptance evidence yet.
- Blocking dependency: Connect model/task/tool/device/memory/knowledge audit, activity query UI, independent verification and production recovery drill.
- Final completion state: IN_PROGRESS

## Foundation cycle 1 evidence — 2026-09-11

Implemented provider-independent live identity checks in conversation HTTP,
full binding checks for turn transition/cancel, and session preconditions for
persistence begin/commit. Nine new regression cases cover mismatched principals,
devices, identity sessions and modes, revoked sessions and suppressed late answers.
Local validation: npm run check PASS (675 tests / 72 files, lint/boundaries/types),
web production build PASS, Python check PASS and 68 regressions PASS.
Ledger validation PASS; --release intentionally exits 1. No SQL migration changed.
This evidence closes the identified code defects; it does not close FR-001,
FR-012, FR-013, FR-019 or FR-021 in their entirety. Exact candidate CI follows.


## Exact candidate evidence and execution interruption

Source `1f8193edef4b3ad076d0a80a94db62513dbc2bda`, tree
`bfddc4996d581580b45fc3ac903a70387652ec45`, passed J1 run 34568543758,
Home UI run 34568543711 and Windows Presence run 34568543826. These verify the
first foundation repair and previous development coverage, not whole-product acceptance.

On resume, the workspace runner did not return even for pwd/true. Further local
engineering validation is blocked; see docs/JARVIS_EXTERNAL_BLOCKERS.md.
Unfinished product requirements remain IN_PROGRESS/NOT_STARTED. The next dependency
is pipeline audit and governed durable conversation/history integration.
