# JARVIS Foundation v1 contracts

Status: J0.12 qualification candidate. This document freezes the development-foundation contract surface; it does not itself issue Foundation v1 GO.

## Governing rule

JARVIS owns identity, policy, state, memory, tool governance, events, audit and recovery. Model providers are replaceable computation adapters and never become an authority source.

## Frozen contract versions

All Foundation v1 contract families below are version 1 and are enumerated machine-readably in `foundation/foundation-v1.manifest.json`.

| Family | Version | Primary implementation/evidence |
| --- | ---: | --- |
| API | 1 | `apps/api`, shared schemas, health/readiness tests |
| Root Owner identity | 1 | `packages/identity`, `packages/storage/src/identity.ts`, identity E2E |
| Device trust | 1 | passkeys + independent device proof, trust/revocation tests |
| Session | 1 | device-bound expiring sessions and security epochs |
| Approval | 1 | one-shot signed approval and freshness binding |
| Authorization permit | 1 | governed one-use execution permit |
| Policy | 1 | deterministic governance and privacy vetoes |
| Risk | 1 | governance policy/risk classification |
| Storage | 1 | classified/encrypted storage gateway |
| Encryption envelope | 1 | envelope encryption/key rotation interfaces |
| Memory | 1 | J0.5 contracts, provenance, scope and lifecycle |
| Model provider port | 1 | J0.6 adapter/router/privacy boundary |
| Universal Tool Gateway | 1 | J0.7 proposal-to-execution lifecycle |
| Event | 1 | J0.8 event identity/persistence/transport |
| Audit | 1 | J0.9 append-only/integrity/correlation |
| Backup format | 1 | J0.10 portability/recovery |
| Recovery manifest | 1 | J0.10 keyed authenticity/owner binding |
| Emergency controls | 1 | PAUSE/FREEZE/DISCONNECT/SAFE MODE/REVOKE/SHUTDOWN |
| Security epoch | 1 | stale-authority invalidation |
| Data classification | 1 | D0-D5 data policy |
| NEVER_STORE | 1 | prohibited durable persistence semantics |

## Identity and trust

Foundation v1 permits one portable Root Owner. Sensitive identity operations require the existing privileged-device and fresh owner-verification conditions. Browser passkey authentication and independent device proof are distinct signals. Sessions are expiring, device-bound and invalidated by revocation or relevant security-epoch changes. Delegation is short lived, recipient bound and narrower than Root Owner authority. Recovery restores identity authority only according to the accepted recovery contracts; it does not silently create a second owner or elevate data-vault access.

## Governance

Permissions remain P0 Observe, P1 Suggest, P2 Prepare, P3 Execute Safe Actions, P4 Execute Sensitive Actions and P5 Critical Owner Actions. `foundation/permissions-v1.json` is the frozen explanatory matrix. Models, agents, tools, services and integrations cannot self-escalate. A model response is data, not an authorization decision. Sensitive execution remains bound to identity/session/device state, policy/risk, freshness, approval and a valid execution permit.

## Privacy and storage

Data classes remain D0-D5. D5 is local-only and never eligible for external model disclosure or general durable data storage. Retention modes remain keep, until, session and never-store. NEVER_STORE prohibits persistence into durable application stores and prohibited derivative surfaces. Classified storage, encrypted envelopes, retention/deletion obligations, secret handles, portable export and recovery formats retain their accepted J0.4/J0.10 semantics.

## Memory

Memory remains owner scoped with optional project scope, provenance/source metadata, disclosure controls, retention/expiry/purge and NEVER_STORE enforcement. Memory does not become provider-owned state.

## Models

The model port normalizes provider behavior and failure. Privacy preflight precedes disclosure. Provider swap, outage, timeout or malformed output cannot grant authority, replace JARVIS identity or own durable JARVIS state.

## Tools

The frozen executable path is: schema validation -> proposal -> policy/risk -> approval when required -> bound execution permit -> execution -> result -> event/audit. Proposal and execution are distinct. Direct invocation may exist internally only behind accepted governed interfaces and must not create an authorization bypass.

## Events and workers

Events carry explicit identity/source/type/freshness/classification semantics. Accepted persistence and Redis/BullMQ transport enforce duplicate/idempotency controls and constrained worker handling. External authenticated ingress beyond the accepted J0 implementation remains a later production concern.

## Audit

Audit evidence is append-oriented, correlated and integrity checked, with protected plaintext excluded. Development database protections do not claim an independently administered immutable production archive.

## Recovery

Recovery is owner-bound and authenticated. Wrong key, wrong owner, tampering, component substitution, unsupported future version and applicable expiry fail closed. Recovery preserves revocation, deletion obligations, policy restrictions and security epochs; stale sessions/delegations/consumed approvals do not regain authority. Secrets are rebound rather than embedded as production credentials.

## Change rule after Foundation v1

A later milestone may extend these contracts through explicit versioning. It must not silently reinterpret a frozen Foundation v1 security contract. Breaking changes require architecture/security review, migration/compatibility analysis, new regression evidence and owner-controlled acceptance.
