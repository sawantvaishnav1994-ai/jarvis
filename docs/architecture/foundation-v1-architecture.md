# JARVIS Foundation v1 architecture

Status: J0.12 qualification candidate. This is the frozen development-foundation architecture description, not a production certification or GO by itself.

## Purpose and authority

JARVIS is the system. AI models are replaceable brains used by JARVIS. Root Owner identity, device trust, sessions, permissions, policy, memory, tool execution authority, events, audit, recovery and emergency controls belong to JARVIS and remain provider independent.

## Module boundaries

- **Web / browser:** user-facing identity and foundation interfaces. Browser state is not trusted as Root Owner authority without server-side verification and independent device proof.
- **API:** authenticated request boundary, readiness surface and composition of accepted foundation services.
- **Core:** orchestration boundary. It may coordinate but may not invent authorization.
- **Identity:** Root Owner, passkeys, device proof, sessions, delegation, revocation and security epochs.
- **Security:** permissions, risk/policy decisions, approvals, execution permits, privacy vetoes, classified handling and emergency restrictions.
- **Memory / knowledge:** owner/project-scoped contextual state with provenance, retention and disclosure policy.
- **Models:** replaceable provider adapters/router with privacy preflight, bounded failure and no authority.
- **Tools:** registry and Universal Tool Gateway. Executable side effects require governed authorization.
- **Events:** versioned event contracts, persistence and Redis/BullMQ transport.
- **Worker:** constrained asynchronous consumer. Queue possession is not authorization.
- **Storage:** PostgreSQL/pgvector persistence, encrypted private records, deletion/retention, migrations, backup/export/recovery.
- **Audit:** correlated append-oriented evidence, integrity chain/checkpoints and protected-field redaction.
- **Runtime supervisor:** dependency startup/readiness and clean shutdown behavior.

## Control plane versus data plane

Identity, policy/risk, approvals, security epochs, emergency state and authorization permits are control-plane state. Memory content, model context, tool inputs/results, events and stored user records are data-plane content. Data-plane content cannot manufacture control-plane authority. A model suggestion, event payload, queue message or stored object is never sufficient authorization by itself.

## Trust and dependency boundaries

PostgreSQL is required for authoritative persisted state and pgvector-backed capabilities covered by J0. Redis/BullMQ is required for accepted asynchronous event transport. Critical dependency unavailability makes affected readiness/capabilities fail closed rather than permitting work. External model providers are untrusted computation services receiving only data allowed by privacy policy. Local models are still non-authoritative. Secrets remain behind secret handles/execution boundaries rather than normal model/tool/audit payloads.

## Canonical governed request flow

1. Root Owner uses a registered or candidate device.
2. Passkey/user-verification and independent device proof establish the required assurance.
3. JARVIS creates an expiring device-bound session subject to revocation/security epoch.
4. The request enters Core through an authenticated API boundary.
5. Authorized memory/context is retrieved with provenance, scope and retention/disclosure controls.
6. Data classification and privacy preflight minimize/permit model context.
7. A replaceable model adapter performs inference; its output carries no authority.
8. A requested side effect becomes a tool proposal with schema validation.
9. Deterministic policy/risk evaluates identity, permission, mode, budget, emergency state and action risk.
10. Sensitive actions require the existing fresh owner approval/step-up conditions.
11. Authorization issues a short-lived, bound, one-use execution permit.
12. The Universal Tool Gateway validates the binding and executes exactly the authorized operation.
13. Result/state transitions emit versioned events and correlated audit evidence.
14. Events are persisted and, where applicable, delivered through Redis/BullMQ to constrained workers.
15. Storage applies classification, encryption, retention/deletion and NEVER_STORE obligations.
16. Backup/export captures only permitted provider-neutral state with authenticated recovery metadata.
17. Restore verifies key, owner, component/version authenticity and restores restrictions, revocations, deletion obligations and epochs while refusing stale authority.
18. JARVIS returns to constrained/ready operation only when required dependencies and security material are usable.

## Bypass analysis

No accepted module is allowed to convert model output, agent intent, tool input, an event, a queue message or configuration alone into privileged authority. The tool path remains schema -> proposal -> policy/risk -> approval when needed -> permit -> execution -> result -> audit/event. Direct internal functions are implementation details and are not a supported authorization boundary; tests and package boundaries must reject any externally usable bypass path.

## Emergency and lifecycle behavior

PAUSE, FREEZE, DISCONNECT, SAFE MODE, REVOKE and SHUTDOWN only reduce/terminate capability. Emergency state overrides normal/autonomous intentions. Shutdown stops acceptance of new governed work, terminates supervised services/workers and is followed by orphan-process verification. Startup/readiness fails closed on unusable critical dependencies or required security material.

## Recovery architecture

Foundation v1 recovery is authenticated, owner-bound and version-aware. It rejects wrong keys, cross-owner material, tampering, component substitution and unsupported future schema. It preserves a single Root Owner, revocations, deletion obligations, policy restrictions, audit/events, memory and security epoch semantics; stale sessions/delegations/consumed approvals are not restored as authority. Production HSM/KMS, geo-independent DR and hostile-host containment remain explicit exclusions.

## Schema and compatibility

Foundation v1 freezes the development schema at migrations `0001` through `0014`. `foundation/schema-v1.json` and `infrastructure/migrations/manifest.json` bind each historical migration by SHA-256. Historical migrations are immutable for this freeze; incompatible future schema must fail closed until explicitly versioned and accepted.
