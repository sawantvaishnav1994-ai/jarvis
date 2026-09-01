# Versioned contract candidates

Every current serialized boundary uses `version: 1` and strict Zod validation.
Unknown versions/fields are rejected. Package versions are 0.1.0 while the root
engineering release is 0.3.0. These are candidate contracts; J0.12 freezes the
public Foundation v1 surface only after integrated security and recovery evidence.

| Contract | Source | Key invariants |
| --- | --- | --- |
| Actor | `packages/identity` | Stable ID, explicit kind and environment |
| Permission/context | `packages/security` | P0–P5, scope list, actor/environment match, trace |
| Model | `packages/models` | Bounded messages, capabilities, destination privacy, cost, deadline |
| Memory | `packages/memory` | Stable UUID, owner/project, kind, privacy, lifetime, timestamps |
| Tool | `packages/tools` | Version, ID, permission, scope, risk, validate/execute/verify |
| Event | `packages/events` | UUID, namespaced type, actor/source, time, sensitivity, correlation |
| Audit | `packages/audit` | Actor, tool, input digest, permission, approval, result, time |
| Secrets | `packages/security` | Reference, authenticated service context, scoped expiring lease |
| Health | `packages/shared` | Service, build version, environment, readiness checks |

Memory kinds include working, conversation, episodic, semantic, project,
preference, procedural, relationship and device. Never-store persistence is
rejected both by service and PostgreSQL adapter. Temporary memory must expire;
recall filters expired entries. Physical expiry cleanup/export/deletion ledgers
are future work, not implied by a recall filter.

Model deadlines bound the Core's wait and abort the adapter signal. They cannot
forcibly terminate uncooperative code inside the Node process. Provider output is
validated against identity/cost, but a post-response cost check cannot undo a
provider charge; real adapters must enforce preflight/streaming budgets.

Queue jobs accept only `foundation.ping` with a correlation UUID. BullMQ/Redis
is an implementation choice at composition roots. Completion event IDs are UUIDs;
queue deliveries can repeat after failures. General subscription, deduplication,
transactional outbox, retry/dead-letter and replay contracts are J0.8 work.

Breaking changes require a new version, explicit reader/writer compatibility
matrix, migration plan and dual-version contract tests. Never reinterpret old
records, reuse a version with different semantics, silently rewrite migration
checksums or make a provider-specific conversation ID the canonical identity.
