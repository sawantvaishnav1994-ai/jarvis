# JARVIS foundation architecture

## Decision and dependency direction

Start with one Python 3.12 distribution and thirteen logical boundaries. Core
depends only on Jarvis contracts and the standard library. The composition root
chooses concrete adapters. A CLI is the first interface. It owns no permanent
Jarvis identity. A modular coordinator keeps deployment small; model execution
runs through a separate bounded worker process. Runtime is an infrastructure
helper, not a fourteenth domain boundary.

| Boundary | Current implementation | Extension boundary |
| --- | --- | --- |
| Core | Request, retention, event, audit coordination | Contract ports |
| Identity | Local owner password plus signed device challenges, revocable sessions | IdentityPort; remote authentication not exposed |
| Security | Deterministic allowlist, bounded approvals, persisted control state | PolicyPort; richer scopes and risk policies pending |
| Memory | Encrypted records; source, kind, project, disclosure and retention facets | MemoryPort |
| Knowledge | Explicit disabled traversal implementation | KnowledgePort |
| Models | Two deterministic local adapters in isolated worker processes | ModelProvider and ModelExecutor |
| Agents | Explicit disabled delegation implementation | AgentPort |
| Tools | Proposal → owner approval → single-use execution; only mock.echo | ToolPort and GatewayPort |
| Events | Versioned local event ledger and duplicate detection | EventPort; ingress and queue transport pending |
| Audit | HMAC chain, SQL triggers, optional independently retained S3 witnesses | AuditPort; live immutable destination not deployed |
| Storage | Encrypted SQLite and volatile contract-test adapter | RecordStore; canonical data exchange is JSON |
| Devices | Enrolled Ed25519 public keys, per-device generation and revocation | DevicePort; hardware attestation pending |
| Interfaces | CLI and repeatable synthetic demo | Core/service ports; no HTTP server |

## Request lifecycle

1. Authenticate with the owner password and a signed one-time device challenge.
   Resolve the session against expiry, revocation epoch and device generation.
2. Validate request size, project, disclosure label, retention, and control state.
3. Record safe request metadata. Pass only the supplied prompt to the selected
   registered isolated adapter worker. No vault content or automatic cross-project
   memory is included. The supervisor bounds output/time and observes cancellation.
4. Validate the returned envelope. Recheck session and control epoch after the
   model finishes so a late response cannot commit after a stop or revoke.
5. In one local transaction, save permitted records and the completion event.
   Archive an audit witness before local append when configured, then commit.
   Local rollback cannot remove an already retained external witness.

A model reply is ordinary text. It cannot invoke an adapter, approve a proposal,
create an agent, or mutate policy. Model failures store no conversation or raw
exception text. A request that is interrupted before completion may retain an
audit `started` record without a completion record; crash reconciliation is a
remaining J0.9 requirement.

## Tool lifecycle

The registered tool validates the input schema. The gateway prepares a proposal
without granting execution. The trusted owner CLI shows the exact tool, project,
and arguments, then requires the literal APPROVE response. An approved token is
bound to the owner, session, tool name/version, permission, project, arguments,
control epoch, and two-minute expiry. Its hash is stored; the token is single-use.

Only mock.echo v1/P3 can execute. Copilot requires exact approval. Autonomous mode
permits this pre-approved harmless mock. P4/P5, external connectors, unknown
tools, invalid grants, and unsupported execution modes are denied. This does
not establish safe execution of future real side effects: they require durable
intent/result handling, cancellation, idempotency, and uncertain-outcome recovery.

## Canonical data architecture

SQLite stores encrypted versioned records in namespaces plus a minimal plaintext
audit ledger. The identifiers and namespaces are metadata; record bodies are
AES-GCM encrypted with context binding to their namespace and key. Each write
uses a fresh random nonce. Data and audit keys are separately derived from the
master key. The key file is outside the database directory.

Conversation, memory, event, and deletion-manifest exports contain Jarvis-owned
IDs and schema versions. Provider identifiers are provenance only. A second
storage engine can consume those records without reassigning owner or data IDs.
The InMemoryStore demonstrates that contract; it is not durable or encrypted and
is only for tests. No production second database is selected.

No vector index, graph backend, ORM, or provider-hosted conversation state is
required by Core. Future derived indexes must be rebuildable from canonical
records and follow source access and deletion policies.

## Memory boundaries

Memory kinds include working, conversation, personal, preference, project,
semantic, episodic, procedural, relationship, and device. Preference specializes
personal memory rather than removing any of the nine original families.

Disclosure and retention are independent enums. LOCAL-ONLY and PRIVATE CLOUD
cannot reach a cloud adapter. All non-local adapters are currently disconnected.
NEVER-STORE leaves no conversation, memory, or content-bearing event. Only minimal
audit metadata remains. Temporary memory has a bounded expiry; reads exclude it
after expiry, and the local purge removes expired records. Purge runs at startup
or explicit service maintenance; a continuous retention worker remains pending.

The only available principal is the owner. Project scope limits retrieval, but
this is not a completed guest/agent multi-tenant authorization system. Direct
Python service access is trusted host access, not a security sandbox.

## Local and cloud strategy

Current: one local host and supervised model subprocesses, private filesystem
permissions, no listening port, no provider traffic or public deployment. Python
3.12 on Linux is verified. The optional archive alone uses explicit network access.

Planned private server: keep the same contracts; introduce authenticated transport,
TLS, deployed device enrollment, service isolation, managed key custody, the
independently protected audit adapter, and backup supervision before remote access. Decide
whether the server may decrypt data or stores ciphertext only. Do not imply
end-to-end encryption if it processes plaintext.

Device clients should authenticate through Identity and call Interfaces; they
must not open the canonical database directly. Offline synchronization, conflict
resolution, and mobile secure storage are future designs. No server, database
service, cloud account, or device connection has been provisioned by this release.
