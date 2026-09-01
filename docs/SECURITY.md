# Security boundaries — 0.2.0

## Owner and device authority

Every local login requires the owner password and an Ed25519 signature over a
server-generated challenge bound to owner, device, generation, session epoch,
purpose, version, nonce and 60-second expiry. Challenges are consumed once,
including failed proofs. Password failures are rate-limited in persistent state.
Sessions expire after 15 minutes and remain process-local. Device revocation
invalidates existing sessions as well as future login.

The client device private key is password-encrypted PKCS8 in a private file.
The canonical database holds only its public key. The default CLI uses the same
password to unlock the device key and authenticate; this proves key possession,
but is not hardware attestation or independently held multi-factor authentication.
Enrollment requires an authenticated owner session. No remote login endpoint exists.

## Worker boundary and emergency control

The composition root uses ProcessModelExecutor by default. Only fixed registered
mock workers can start; a prompt cannot choose an executable or import path.
Worker input/output uses bounded pipes, a sanitized environment, closed inherited
descriptors and a separate POSIX session. The Linux reference worker sets a
parent-death signal and resource limits. A deadline, revocation, PAUSE or changed
control epoch causes cancellation; the supervisor escalates TERM to KILL and
reaps the leader. Descendants remaining in that process group are also killed.

The external host command `jarvis stop` persists restrictive state and revokes
sessions without starting a model or contacting the archive. Workers poll this
state; the integration test verifies termination and no late response commit.
A configured archive requires explicit owner reconciliation of offline stop
evidence before ordinary restart.

The host OS, Python packages and composition root remain trusted. Workers share
the OS user's authority: this is not a sandbox for hostile generated code. A
process that escapes its group requires target-host cgroup containment.
`scripts/run-supervised.sh` prepares that outer service; it refuses an
unsupervised fallback. Target-host shutdown remains an open operational gate.
A kernel-stuck process, compromised root or already-completed physical action
cannot be made harmless by a Python cancellation promise.

## Independent audit

Local HMAC chaining and SQL append-only triggers provide tamper evidence, not
independent immutability. With the S3 adapter, audit witnesses are written before
local append and read back by exact object version. The adapter checks private
bucket access, enabled versioning, COMPLIANCE mode, expected account and active
retention. Once bound, normal startup cannot omit or substitute the archive.
Archive failure blocks ordinary audited actions; emergency restriction remains
available locally.

The deployment template grants the runtime scoped evidence reads/writes and
denies object deletion, bucket administration and governance bypass. An independent
owner administrator controls the destination. COMPLIANCE protection is finite;
the configured interval and retention operations must be reviewed before deployment.
[Amazon S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)

A successful remote write followed by local rollback can leave an extra witness.
It is evidence of an attempted operation, not proof of a committed local effect.
`audit-archive` exposes the full remote witness set, including recovery branches.
Ordinary verification proves local entries have remote witnesses; it does not
automatically detect rollback to every previously valid prefix. Independent
checkpoint monitoring and reconciliation remain deployment requirements.

Witnesses retain actor/request/session IDs, operation, outcome, time and chain
links. They omit prompt text, arguments, output, passwords and credential values.
Content deletion retains these minimal security records and opaque deletion IDs.
Jarvis cannot automatically erase active compliance-retained objects.

## Recovery, deletion and custody

Full-system backups are authenticated and encrypted with a separate backup
passphrase. They include the master key inside that encrypted envelope to preserve
vault decryption and historical audit verification. They are highly sensitive:
keep independent recovery custody for the passphrase and a protected off-host copy.

Recovery requires the original archive and reads current external deletion
manifests before restoring content. It verifies the audit snapshot, revokes old
devices, resets the password/session epoch, enrolls a fresh device and publishes
a validated fresh directory in Safe Mode with external access disconnected.
Sessions, pending challenges, proposals and approvals are not restored.

Backup expiry cannot exceed the archive protection deadlines observed during
backup. Expired archive evidence causes verification to fail closed; this release
has no automatic retention-extension or archival-rollover job. Such operations
must exist before prolonged production use. Restoring never erases independent
historical evidence or promises forensic erasure of SSDs, snapshots or exported copies.

The separate master-key file and encrypted device key protect against casual
exposure, not root compromise. Hardware custody, key rotation and secret leasing
remain future hardening. Never-store avoids intentional application persistence;
Python memory, OS swap, terminal capture and host monitoring remain OS concerns.

## Sources

- [Ed25519 API](https://cryptography.io/en/latest/hazmat/primitives/asymmetric/ed25519/)
- [Authenticated encryption](https://cryptography.io/en/latest/hazmat/primitives/aead/)
- [S3 lock administration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html)
- [systemd process termination](https://www.freedesktop.org/software/systemd/man/systemd.kill.html)
