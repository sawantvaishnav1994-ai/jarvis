# Engineering, testing, and migrations

## Repository and package strategy

One repository and one Python distribution contain thirteen module boundaries.
Independent workspaces are unnecessary until a second language/runtime creates
a concrete need. Core may import only `jarvis.contracts` and approved standard
library modules. Adapter selection belongs to `bootstrap.py`; CLI presentation
belongs to Interfaces. The syntax/architecture check enforces the Core boundary.

`pyproject.toml` declares Python 3.12 and the runtime dependency. Runtime and
development lock files pin exact versions with wheel hashes. Development tools
are separate from runtime requirements. Do not put secrets into `.env`, source,
test fixtures, CI, package metadata, or exports committed to Git.

Current dependency lock was installed successfully in a fresh virtual environment.
Full wheel hashes support several platforms; only the Linux/Python 3.12 target
has been executed. Other platforms remain unverified. No claim is made that
an offline installation works without a previously prepared wheel cache.

## Tests that matter

The suite uses synthetic data and temporary stores. It exercises authentication,
session revocation/expiry, exact approvals, denied tools, data scope, retention,
provider replacement, storage replacement, encryption tampering, event rejection,
transaction rollback, backup authentication, deletion suppression, audit attacks,
and a real concurrent blocked-model/host-stop scenario. No real external actions
are performed. The two RecordStore adapters run the same contract behavior.

CI also runs Ruff, syntax/hygiene checks, Core import checks, and the CLI demo.
Prepared CI configuration is not evidence of a remote CI run. Browser tests are
not relevant yet because there is no browser interface or network server.

Before enabling a real connector, add integration tests for that connector's
authorization, data disclosure, idempotency, retry, cancellation, partial failure,
and uncertain outcomes. Before enabling cloud models, test provider eligibility,
schema conversion, budgets, redaction, transport behavior, and disabled fallback.

## Versioning

The implementation version is 0.2.0. Contracts are candidate v1 envelopes, not
the approved Foundation v1 contract freeze. The Master Definition remains v0.1;
the owner-approved implementation charter is v0.2 and updates only J0 sequencing
and the additional provider/database/device/interface independence principle.

Future package releases use semantic versioning. Schema and event/export envelope
versions are independent of package versions. Unknown future versions fail closed.
Never derive a canonical record ID from a provider's conversation identifier.

## Migrations

The initial SQLite migration is atomic and sets `PRAGMA user_version=1`. Newer
database versions are rejected. There are no historical production schemas yet,
so no invented downgrade migration or data-repair promise is included.

Each future migration requires a source/target version, backup prerequisite,
compatibility statement, transaction or resumable transformation, tests with
representative old records, and rollback or restore instructions. A schema change
must not silently reclassify privacy, re-enable a permission, erase provenance,
or reconstruct deleted records. Prefer restoring a verified pre-migration backup
over an untested destructive downgrade.

Canonical data export/import is the database-provider migration boundary. It
preserves owner and data IDs, validates full record shapes, rejects owner/version
mismatches, respects tombstones, and refuses conflicting records. Authentication,
keys, policy, and audit need their own reviewed migration paths.

Version 0.2.0 adds device/challenge records without changing SQLite table layout
or user_version. Legacy owners explicitly run migrate-device to enroll a public
key; ordinary password-only authentication is no longer accepted. Full-system
recovery has its own version-1 encrypted envelope and includes key/policy/audit
state. It requires the original independent archive and fresh device enrollment.
Portable content export remains separately versioned and provider-independent.

The optional S3 SDK is a separately pinned extra; a complete transitive hash lock
and target installation are still required before live deployment. The core
runtime/development lock has not been weakened to accommodate that extra.

## Delivery gate

Do not tag Foundation v1, enable J1, or label all of J0 complete from this snapshot.
Review STATUS.md, close the listed blockers with evidence, then present the tested
contract freeze for the owner's J0.12 GO decision. Routine engineering fixes
within the approved scope do not need repeated permission requests.
