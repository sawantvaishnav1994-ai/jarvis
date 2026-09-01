# J0 gate status — TypeScript engineering release 0.3.0

**J0 remains in progress. Foundation v1 GO: NOT ISSUED. J1: NOT STARTED.**

The owner revised J0.1 to a TypeScript modular monorepo. The active foundation now
uses Node/Next.js, PostgreSQL/pgvector, Drizzle and Redis/BullMQ. The Python 0.2.0
reference is preserved, with its [historical gate evidence](reference/python-v0.2-status.md).
Its authenticated device/recovery behavior has not automatically migrated into
the new API.

## Current acceptance evidence

- TypeScript packages compile; the Next.js production build passes.
- 26 unit/contract/security tests pass locally, including privacy, timeout,
  scope/approval denial, encrypted vault and audit failure behavior.
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
| J0.1 | All 24 artifact categories implemented; fresh Linux checkout/Docker CI acceptance passed | J0.1 accepted for development; proceed to J0.2 |
| J0.2 | Identity ports/types; historical Python signed-device implementation | Owner/session/device authentication in active TypeScript runtime |
| J0.3 | Default-deny tool gateway and approval ports; local service stop | Durable authenticated approvals, richer policy, host containment |
| J0.4 | PostgreSQL domains, encrypted payloads/vault, reviewed migrations | Managed key custody, rotation and recovery-backed destructive migrations |
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
