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
| J0.4 | Complete development implementation and explicit A–S acceptance passed on the private validation branch | Accepted for development; production custody, immutable/offline recovery, PITR and hostile-process containment remain later gates |
| J0.5 | Memory schema/service/adapter and retention rules | Full memory provenance, expiry maintenance, authenticated data interfaces |
| J0.6 | Model port, privacy checks, swap conformance, bounded wait | Real/local adapters, enforced preflight budgets and process isolation |
| J0.7 | Tool contract and gateway tested with synthetic echo | Real connector scopes, idempotency/cancellation/reconciliation |
| J0.8 | Event schema, encrypted persistence and constrained queue worker | Outbox, subscriptions, authenticated ingress, replay/dead-letter semantics |
| J0.9 | Operational metadata and database append-only audit controls | Independently immutable archive, external witnesses and operations |
| J0.10 | Historical Python encrypted recovery/export/delete tests | Active-runtime full data sovereignty and off-host disaster drill |
| J0.11 | Full Foundation integration and adversarial qualification passed on exact-SHA cloud CI; J0.11 A–T PASS | Development qualification complete; production-only controls remain outside J0.11 |
| J0.12 | Foundation v1 freeze manifests, architecture/security/trust reviews and fail-closed A-T qualification pipeline implemented on isolated validation branch | Exact-SHA qualification and owner-controlled Foundation v1 GO decision; production exclusions remain explicitly unclaimed |

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

## J0.4 development acceptance — 2026-09-03

**J0.4 — Private Data, Database, Encryption, Secrets & Storage Architecture:
COMPLETE for development. Development GO is issued.** Main has not been changed or
merged by this validation. The accepted implementation candidate is validation-branch
source `db6e3e48c33af2944a319815c4d0729924b3a718`, verified by
[GitHub Actions run 33731571717](https://github.com/sawantvaishnav1994-ai/jarvis/actions/runs/33731571717).

The exact run passed package compilation, lint, architecture boundaries, TypeScript
types, the Next.js production build, 246 unit/contract/security tests, 50 real
PostgreSQL/pgvector tests, five browser scenarios, 68 Python regressions, disposable
PostgreSQL and Redis setup, startup/readiness and queue round-trip, PostgreSQL/Redis
outage and recovery, and verified service shutdown. The machine-readable J0.4 gate
reported `A-S_PASS`, with non-empty passing assertions for every phase A through S.

Accepted development behavior includes exact J0.3-governed synthetic secret-handle
use without returning D5 plaintext, envelope encryption and key rotation, shared and
legacy attachment lifecycle checks, NEVER_STORE, provider-independent checked export,
derived-data deletion and backup-expiry obligations, encrypted backup and isolated
restore, corrupt-backup rejection, reviewed and recovery-backed destructive migration
governance, deterministic external-context minimization, storage-health fault handling,
and payload-free append-only audit evidence. Migration 0007 adds backup retention and
deletion-obligation metadata; migrations 0001–0006 remain unchanged.

No production credentials or owner data were introduced. Normal exports exclude D5.
The default production destructive-migration registry remains empty and unsupported
operations fail closed. Development limits remain bounded record/object/export and
backup sizes, and backup purge eligibility is deterministic metadata—not a claim that
an independent physical copy has been erased.

Production validation remains pending for HSM/KMS custody, physical A4 ceremonies,
independently immutable/offline backups, PostgreSQL PITR, multi-region disaster
recovery, hostile-process containment, real connector credential rotation, secure
enclave validation and regulatory retention. J0 Foundation v1 GO remains NOT ISSUED,
and J1/J0.5 have not been started. Any merge to main requires a separate owner decision.

## J0.11 development qualification — 2026-09-04

**J0.11 — Full Foundation Integration, Adversarial Validation & Release-Candidate Qualification: COMPLETE for development validation. J0.11 Development GO is recommended for owner review.**

Protected J0.10 baseline: `f00eabba0bf4cda66b906d61a8e050b95123463f`. Validation branch: `validation/j0.11-full-foundation-integration-20260904`. The behaviorally validated candidate `f5c1df7ccc2926caeddc3f60a8f344aea5c511c8` passed GitHub Actions run `33801036155` from a fresh checkout with disposable PostgreSQL/pgvector and Redis/BullMQ.

The exact run passed 447 TypeScript unit/contract/security tests, 77 real PostgreSQL/pgvector integration tests, four foundation browser tests, the full synthetic Root Owner/passkey/second-device/restricted-agent/revocation/recovery browser ceremony, real queue transport, J0.10 disaster-recovery authenticity and substitution attacks, PostgreSQL/Redis outage and recovery, verified service shutdown, J0.4 `A-S_PASS`, J0.5–J0.10 `A-T_PASS`, and J0.11 `A-T_PASS`. Critical governance, governed-gateway and J0.10-hardening tests were repeated three consecutive times without failure. No migration 0015 or runtime redesign was introduced.

Earlier J0.11 runs `33800548093` and `33800858623` failed only the newly added acceptance-catalog formatting harness. Those failures were retained as evidence; the harness was diagnosed and corrected without skipping or weakening any behavioral/security requirement.

This is development qualification, not production security certification. Production HSM/KMS custody, physical-device ceremonies, independently separated/offline recovery infrastructure, hostile-host containment, production connector credentials and geographically independent disaster recovery remain unclaimed unless separately proven.

Main has not been changed by J0.11. No release or Foundation v1 tag was created. **J0 Foundation v1 GO remains NOT ISSUED. J0.12 and J1 remain NOT STARTED.**
