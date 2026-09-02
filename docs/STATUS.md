# J0 gate status — TypeScript engineering release 0.3.0

**J0 remains in progress. Foundation v1 GO: NOT ISSUED. J1: NOT STARTED.**

The owner revised J0.1 to a TypeScript modular monorepo. The active foundation now
uses Node/Next.js, PostgreSQL/pgvector, Drizzle and Redis/BullMQ. The Python 0.2.0
reference is preserved, with its [historical gate evidence](reference/python-v0.2-status.md).
Its prior behavior was not automatically migrated; J0.2 now has a separate
TypeScript identity implementation and tests. No real owner data was migrated.

## Current acceptance evidence

- TypeScript packages compile; the Next.js production build passes.
- J0.3 now implements the owner's complete development security flow, including
  durable exact approvals, contextual risk, authorization/replay, owner policy
  administration and persisted emergency controls. Local regression checks pass;
  exact isolated source verification and full-stack CI evidence are pending.
  The separate uncommitted J0.4 draft is not part of this acceptance.
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
| J0.3 | Full development policy/risk/approval/authorization, budgets, persisted controls, audit and A–N GO implementation | Exact merged-source PostgreSQL/browser/CI acceptance pending; production containment remains a later gate |
| J0.4 | Existing PostgreSQL/vault plus local Increment A: classified contracts, envelope cipher/key handles and record codec | Runtime classified repositories, objects/vectors/lineage, managed key custody, full export/delete/backup/recovery GO |
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

**Active milestone: J0.3 — Security Policy, Permissions, Risk & Approval Engine (in progress).**
See [J0.3 increments](roadmap/j0.3.md) and [policy boundaries](security/j0.3-policy.md).
J0.3.1 prior local validation passed: 112 TypeScript tests, 68 Python regressions
and web build. On 2026-09-02 the owner explicitly requested completion of J0.3,
source publication to main and GitHub CI, followed by J0.4. The existing private
`sawantvaishnav1994-ai/jarvis` repository and push permission were verified.
The owner subsequently supplied the full 46-section specification and 80 GO steps.
Implementation reuses J0.2 proof validation, delegation and transaction storage.
See [active authorization boundaries](security/j0.3-authorization.md). The previous
J0.3.1 boundary document remains historical. Publication of isolated source and
full-stack CI are next; no J0.3 acceptance or Foundation v1 GO is issued yet.
Owner enrollment on real devices remains an owner-performed ceremony. CI created
only disposable synthetic owners; no real owner, personal data or production
infrastructure was initialized by this work.

The owner supplied the full J0.4 data-sovereignty specification on 2026-09-02.
The prior bounded additive work is preserved; further J0.4 implementation is paused
until J0.3 passes its gate and CI, per the owner's latest sequencing instruction.
The local draft encryption/record contracts do not replace current live v1 storage.
