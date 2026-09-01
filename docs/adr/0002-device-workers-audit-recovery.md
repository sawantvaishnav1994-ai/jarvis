# ADR 0002 — Signed devices, bounded workers and independent recovery evidence

Status: implemented in 0.2.0; live deployment acceptance pending.

The 0.1.0 reference used a logical device label, in-process model calls, local
audit chaining and content-only backups. Those mechanisms could not establish
device possession, forcibly stop a blocked model, preserve evidence independently
of the runtime host, or recover vault/identity/audit after total data loss.

Use Ed25519 device challenges and owner-authorized enrollment/revocation. Keep
private keys client-held and encrypted; do not call this hardware attestation.
Introduce ModelExecutor as a contract so Core can request bounded isolated work
without importing process or provider implementations. Keep fixed mock worker
registrations until real adapters receive equivalent isolation/conformance tests.

Add an explicitly configured S3 COMPLIANCE archive behind the audit adapter.
Canonical data and Core do not depend on S3. Require separate archive administration
and exact-version readback, and fail closed when a bound archive is unavailable.
Local host emergency restriction remains usable without network access; an owner
must reconcile its offline evidence before ordinary archived operation resumes.

Keep portable content exchange separate from full-system disaster recovery.
Encrypt the canonical system snapshot and key material under a recovery passphrase,
require current independent deletion evidence, verify audit, revoke old authority,
enroll a new device and restore in Safe Mode. Preserve Jarvis IDs and source data
independently of model selection. Archive-provider migration requires an explicit
verified copy/checkpoint procedure, never silent replacement.

Costs: remote witness writes add latency; remote history scanning is bounded to
100,000 objects and is not a production-scale index. Independent retention needs
maintenance before expiry. Process groups need an outer cgroup for escaped
descendants. Neither simulated AWS responses nor prepared deployment files close
the live archive, supervisor or disaster-recovery acceptance gates.
