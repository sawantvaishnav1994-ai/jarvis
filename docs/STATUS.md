# J0 gate status — TypeScript engineering release 0.3.0

**J0 remains in progress. Foundation v1 GO: NOT ISSUED. J1: NOT STARTED.**

The owner revised J0.1 to a TypeScript modular monorepo. The active foundation now
uses Node/Next.js, PostgreSQL/pgvector, Drizzle and Redis/BullMQ. The Python 0.2.0
reference is preserved, with its [historical gate evidence](reference/python-v0.2-status.md).
Its prior behavior was not automatically migrated; J0.2 now has a separate
TypeScript identity implementation and tests. No real owner data was migrated.

## Current acceptance evidence

- TypeScript packages compile; the Next.js production build passes.
- J0.3 development GO passed on main source `5ee91e681839fd58737d79eeb99821cda0da9d49`
  in [run 33620442554](https://github.com/sawantvaishnav1994-ai/jarvis/actions/runs/33620442554):
  147 TypeScript tests, 16 real PostgreSQL tests, 5 browser scenarios (including
  the combined J0.2 and complete J0.3 A–N GO), 68 Python regressions, startup/queue
  smoke, dependency outage/recovery and verified service stop. Both CI jobs passed.
  Durable exact approvals, risk, authorization/replay, owner administration and
  emergency controls passed real-stack verification. The separate uncommitted
  J0.4 draft was excluded from that historical J0.3 run. See [acceptance report](roadmap/j0.3-report.md).
- J0.2 development acceptance passed on source `59a581c46574a53e5abbccd6f076743d5d6e9c77`
  in [run 33595165916](https://github.com/sawantvaishnav1994-ai/jarvis/actions/runs/33595165916):
  60 TypeScript tests, 14 real PostgreSQL tests, 5 browser scenarios (including
  the full owner/device/delegation/revocation/recovery flow), 68 Python regressions,
  startup/queue smoke, dependency outage/recovery and verified service stop.
- Real PostgreSQL integration (8 tests), full startup, browser (4 tests), queue
  smoke, outage/recovery and stop checks passed in [GitHub Actions run
  33567299408](https://github.com/sawantvaishnav1994-ai/jarvis/actions/runs/33567299408)
  on source commit `e0aca69da332ec83a5a6d484fe935b8b7f13bb30`. The preserved
  Python job also passed all 68 tests.
- The refined source revision `3b3bd515898b00a8fefe10686d3d146e270883e6` also
  passed the complete suite in [run 33567718496](https://github.com/sawantvaishnav1994-ai/jarvis/actions/runs/33567718496).
- This workspace has no Docker/PostgreSQL and cannot install system packages;
  local mock tests do not establish Docker acceptance.

| Gate | Current implementation | Remaining work |
| --- | --- | --- |
| J0.1 | All 24 artifact categories implemented; fresh Linux checkout/Docker CI acceptance passed | Accepted for development |
| J0.2 | Real passkeys, device proof, sessions, signed approvals, restricted delegation, identity recovery and console; full development GO flow passed | Accepted for local development; physical-device validation, hardware A4/remote production and full disaster recovery are not claimed |
| J0.3 | Full development policy/risk/approval/authorization, budgets, persisted controls, audit and A–N GO passed on exact merged source and CI | Accepted for development; real connectors, hardware A4 and production containment remain later gates |
| J0.4 | Classified PostgreSQL repositories, envelope crypto/rotation, objects, lineage, exports, isolated backup/restore and health; real-stack checkpoint passed | Secret lifecycle, full retention/object deletion/recovery and complete A–S GO; see current report |
| J0.5 | Memory schema/service/adapter and retention rules | Full memory provenance, expiry maintenance, authenticated data interfaces |
| J0.6 | Model port, privacy checks, swap conformance, bounded wait | Real/local adapters, enforced preflight budgets and process isolation |
| J0.7 | Tool contract and gateway tested with synthetic echo | Real connector scopes, idempotency/cancellation/reconciliation |
| J0.8 | Event schema, encrypted persistence and constrained queue worker | Outbox, subscriptions, authenticated ingress, replay/dead-letter semantics |
| J0.9 | Operational metadata and database append-only audit controls | Independently immutable archive, external witnesses and operations |
| J0.10 | Historical Python encrypted recovery/export/delete tests | Active-runtime full data sovereignty and off-host disaster drill |
| J0.11 | Unit/contracts/security and real-stack acceptance suite | Complete authenticated full-J0 workflow and host/deployment tests |
| J0.12 | Contract versions and acceptance criteria recorded | Close applicable gates, freeze interfaces, owner GO |

The private GitHub repository already exists. Branch ruleset enforcement was
previously rejected by GitHub HTTP 403 under the current private-repository plan;
visibility has not been changed and no paid upgrade has been performed.
See [J0.1 deliverables](roadmap/j0.1.md) and [security scope](security/j0.1-boundaries.md).
See [J0.2 deliverables](roadmap/j0.2.md) and [identity security scope](security/j0.2-identity.md).

**J0.3 — Security Policy, Permissions, Risk & Approval Engine: COMPLETE for development.**
See [J0.3 increments](roadmap/j0.3.md) and [policy boundaries](security/j0.3-policy.md).
J0.3.1 prior local validation passed: 112 TypeScript tests, 68 Python regressions
and web build. On 2026-09-02 the owner explicitly requested completion of J0.3,
source publication to main and GitHub CI, followed by J0.4. The existing private
`sawantvaishnav1994-ai/jarvis` repository and push permission were verified.
The owner subsequently supplied the full 46-section specification and 80 GO steps.
Implementation reuses J0.2 proof validation, delegation and transaction storage.
See [active authorization boundaries](security/j0.3-authorization.md). The previous
J0.3.1 boundary document remains historical. The accepted source tree is
`58402ea7ea3f8e1c58b0a2490014e88bce85ecc5`. Earlier runs 33618677436 and 33619985866
failed browser harness timing/rate handling and were not accepted; corrected run
33620442554 passed with rate limits, assertions and runtime security preserved.
J0.3 development GO is issued. Foundation v1 GO is still NOT ISSUED.
Owner enrollment on real devices remains an owner-performed ceremony. CI created
only disposable synthetic owners; no real owner, personal data or production
infrastructure was initialized by this work.

The owner supplied the full J0.4 data-sovereignty specification on 2026-09-02.
Work now extends the accepted J0.3 baseline. J0.4 remains INCOMPLETE. Existing v1
storage is preserved; new classified records do not silently migrate legacy data.

## J0.4 implementation checkpoint — 2026-09-02

IN PROGRESS — GO NOT ISSUED. Protected baseline: `6c62f85c4c00822a082d304ff96736599cb41cb6`,
accepted baseline workflow `33621181083`. Applied migrations 0001–0004 are unchanged.
The additive 0005 migration extends classified records, lineage, objects, keys and recovery.
Storage operations use the existing J0.3 one-time execution permit and the same
PostgreSQL transaction as identity, authorization consumption and audit persistence.
Private payloads are passed transiently with an exact approval-bound digest; request
history stores the digest rather than the payload. The next source checkpoint composes
the new gateway into the existing authenticated identity RPC, with default-deny policies.

Source `8e5cfc6143adede46c5d75bae46ffdba213586bf` passed
[CI 33680546883](https://github.com/sawantvaishnav1994-ai/jarvis/actions/runs/33680546883):
205 TypeScript tests, 30 real PostgreSQL tests, 5 browser scenarios, 68 Python regressions,
startup/queue, outage/recovery and shutdown. J0.1/J0.2/J0.3 regression passed.
This is a verified J0.4 checkpoint, not the complete A–S acceptance flow.
API/browser wiring source `734fee41b4402b2f76f46f71508bde37ab94fc9e` passed
[CI 33681464024](https://github.com/sawantvaishnav1994-ai/jarvis/actions/runs/33681464024)
verification, including owner-approved storage/read, replay rejection and NEVER_STORE.
Follow-up hardening source `fc0883f70a4d73440d55545888570411fc0a9ff7` passed
[CI 33682921990](https://github.com/sawantvaishnav1994-ai/jarvis/actions/runs/33682921990):
208 TypeScript, 34 PostgreSQL, 5 browser scenarios, 68 Python and all lifecycle checks.
Health reads cannot initialize key metadata; initialization requires a governed write.
See the [current detailed report](roadmap/j0.4-report.md).

Remaining development gates include secret lifecycle/handle execution integration,
complete retention execution and backup expiration, shared/legacy attachment deletion,
complete ownership inventory, recovery configuration/key kit, general reviewed
destructive migration support and complete A–S GO coverage. Health and API adapters
now exist; the bounded synthetic
migration probe is not yet a generalized destructive migration runner. J0.5 is not started.

The next bounded increment adds migration 0006 and staged attachment/object cleanup:
committed access revocation and purge tickets, followed by separate owner-authorized
physical ciphertext removal. An outage preserves pending cleanup; shared/unlinked legacy
attachments fail closed. This checkpoint is verified on main source
`c90a814887c1cf7b5bc0f1dc51e5c97a4363e7c2` in
[CI 33683907734](https://github.com/sawantvaishnav1994-ai/jarvis/actions/runs/33683907734):
210 TypeScript, 35 real PostgreSQL, 5 browser scenarios, 68 Python and all lifecycle
checks passed. J0.1/J0.2/J0.3 remain regression-free. The complete J0.4 A–S GO is
still NOT ISSUED; see the detailed report's coverage map and development gaps.
