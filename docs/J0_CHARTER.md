# J0 — Implementation Charter v0.2

Authority: the owner's latest J0 instruction in this conversation. This charter
supersedes the proposed J0 work-package numbering in Sections 18 and 20 of Master
Definition v0.1. The original document remains preserved unchanged. Its product
vision, ownership commitments, and J0–J15 generations remain in force.

**Permanent principle:** Jarvis must never depend on one AI provider, one database
implementation, one device, or one user interface to remain Jarvis.

## Approved J0 gates

| Gate | Scope |
| --- | --- |
| J0.1 — Repository & Engineering Foundation | Private repository; project/package structure; CI; linting; tests; environment configuration |
| J0.2 — Identity & Ownership | Owner and device identities; sessions; authentication; authorization |
| J0.3 — Security & Permissions | P0–P5; policy engine; tool scopes; approvals; emergency controls |
| J0.4 — Data & Storage | Databases; files; encryption; secrets; backups; migrations |
| J0.5 — Memory Contracts | Working, episodic, semantic, project, preference, procedural and the other retained master-definition memory families |
| J0.6 — Model Abstraction | Replaceable OpenAI, local, and other provider adapters |
| J0.7 — Tool Gateway | Common browser, computer, GitHub, email, device, and other connector contract |
| J0.8 — Event System | Standard events, triggers, subscriptions, queues, and state changes |
| J0.9 — Audit & Observability | Every meaningful action traceable and reviewable |
| J0.10 — Recovery & Data Sovereignty | Backup, restore, export, delete, provider migration, disaster recovery |
| J0.11 — J0 Integration Tests | Prove the foundation works as one system |
| J0.12 — Foundation v1 GO Gate | Freeze tested contracts and approve entry into J1 |

The completion target includes one documented architecture, identity model,
permissions model, database architecture, memory architecture, provider
abstraction, tool contract, event contract, encrypted secrets strategy, immutable
audit system, emergency-stop design, local/cloud strategy, testing strategy,
development environment, versioning/migration strategy, and backup/export/delete
strategy. Documentation alone does not prove an implementation gate.

## Stable boundaries

Core, Identity, Security, Memory, Knowledge, Models, Agents, Tools, Events, Audit,
Storage, Devices, and Interfaces. Each owns a logical responsibility. A separate
service or package distribution per boundary is not required in J0.

## Required completion demonstration

Start the system; authenticate as the owner; send a basic request; route it
through a model abstraction; persist the conversation in Jarvis-owned storage;
create an auditable event; execute a harmless mock tool through the permission
layer; retrieve memory later; export and delete the data; change the AI provider
without changing permanent data. Database portability must also be demonstrated.

The current implementation is a reference slice to test that chain. Passing the
chain does not waive identity, independently protected audit, disaster recovery,
or other unfinished parts of the completion target. See STATUS.md for the actual
gate disposition. J1 remains closed until J0.12 is approved.
