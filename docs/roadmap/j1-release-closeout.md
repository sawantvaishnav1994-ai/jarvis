# J1 Core + Conversation v1 — Authoritative Release Closeout

Status: COMPLETE + FROZEN

Release date: 2026-09-05

Frozen release SHA: `f75ed2d2d712fe32e64eb161a7ecab73dcb34db1`

Exact-candidate qualification run: `33974285835` — SUCCESS

Exact-main qualification run: `33974955058` — SUCCESS

This document is the authoritative J1 release-status record. Where an older milestone roadmap file still contains a development-era status header, that header is historical and is superseded by this closeout.

## Released milestone status

- J1.0 — COMPLETE + FROZEN
- J1.1 — COMPLETE + FROZEN
- J1.2 — COMPLETE + FROZEN
- J1.3 — COMPLETE + FROZEN
- J1.4 — COMPLETE + FROZEN
- J1.5 — COMPLETE + FROZEN
- J1.6 — COMPLETE + FROZEN
- J1.7 — COMPLETE + FROZEN
- J1.8 — COMPLETE + FROZEN
- J1.9 — COMPLETE + FROZEN
- J1.10 — COMPLETE + FROZEN
- J1.11 — COMPLETE + FROZEN
- J1.12 — COMPLETE + FROZEN

J1 Core + Conversation v1 GO: ISSUED

## Qualification evidence

The frozen candidate and the same exact SHA on `main` passed the complete J1.12 real-stack qualification, including:

- release formatting, integrity, static and contract checks;
- critical J1 security repeatability;
- real PostgreSQL/pgvector integration;
- API, worker and Web startup;
- queue/health and Redis/BullMQ transport;
- browser acceptance;
- trusted Root Owner/device/Foundation-session browser flow;
- J1.1 conversation-session PostgreSQL integration;
- J1.2 context assembly regression;
- J1.3 model orchestration regression;
- J1.4 response-turn pipeline regression;
- J1.5 durable history/persistence integration;
- J1.6 memory-aware conversation regression;
- J1.7 J0.7 UniversalToolGateway regression;
- J1.8 permission/approval replay/race regression;
- J1.9 operating-mode/emergency regression;
- J1.10 streaming/cancellation/resilience regression;
- J1.11 authenticated conversational Web UI authority regression;
- approval replay/race/duplicate/emergency adversarial sequence;
- backup/recovery/restart drills;
- PostgreSQL/Redis/model/tool dependency outage and recovery;
- clean shutdown;
- inherited J0.4 A-S acceptance;
- inherited J0.5-J0.12 A-T acceptance;
- inherited J1.0-J1.8 A-T acceptance;
- final J1.12 A-T acceptance.

## Frozen authority boundaries carried forward

J2 and later generations must not create alternate authority for any capability already frozen in J0/J1.

- J0 remains authoritative for identity, device trust, sessions, policy, risk, permission, approvals, authorization permits, security/ownership epochs, emergency controls, UniversalToolGateway execution, audit and protected system boundaries.
- J1 remains authoritative for conversation/session coordination, context assembly, model orchestration, turn state, durable conversation history, memory-aware conversation coordination, tool-aware conversation bridging, approval-aware conversation coordination, operating-mode projection, streaming/cancellation/resilience and authenticated conversational Web presentation.
- Models remain replaceable brains and cannot become authority.
- Browser/UI metadata remains presentation, never authority.
- No future milestone may bypass or duplicate the J0/J1 execution chain.

## Change-control rule after J1 freeze

The release SHA above is the immutable J1 Core + Conversation v1 evidence anchor. Future development starts from it or from explicitly documented post-release planning/documentation commits. Any runtime change to frozen J0/J1 behavior must be treated as inherited-compatibility work and must receive evidence proportional to the affected frozen boundary.

## Next authorized generation

The original Master Definition defines the next generation as:

**J2 — Memory + Knowledge Graph**

J2 must extend the already-frozen memory contracts and J1.6 memory-aware conversation layer. It must not rebuild them.
