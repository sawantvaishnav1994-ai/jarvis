# J0 gate evidence — implementation 0.2.0

**J0 remains in progress. Foundation v1 GO: NOT ISSUED. J1: NOT STARTED.**

This release implements the previously missing local cryptographic device,
worker-process, independent-audit adapter, and full-system recovery paths.
Deployment evidence is separate from local implementation evidence.

| Requested blocker | Implemented and tested | Evidence still required |
| --- | --- | --- |
| Private GitHub repository | Existing local Git history, CI workflow, portable Git bundle | Private sawantvaishnav1994-ai/jarvis became accessible during this session. Verify publication, protection and remote CI; see work log for final evidence. |
| Cryptographic device trust | Ed25519 single-use expiring challenges; password plus device proof; encrypted client key; enrollment, device revocation and session invalidation; explicit legacy migration | Physical device/keychain custody and remote transport are not deployed. Local cryptographic proof is verified. |
| Independently immutable audit | Optional S3 COMPLIANCE adapter; exact-version write/readback; retention, versioning, account and public-access checks; fail-closed archive binding; CloudFormation and live probe | Deploy in an owner-controlled audit account under separate administration. Run the live denial probe. Simulator results do not establish immutable storage. |
| Worker termination | Default model execution in separate POSIX processes; bounded pipe input/output; deadline and owner cancellation; TERM/KILL escalation and descendant cleanup; host stop integration | Run target-host systemd cgroup and supervisor-loss drills. Python cannot guarantee termination against kernel failure, privileged escape or physical effects. |
| Complete disaster recovery | Encrypted system snapshot including key material, identity, devices, vault, control/policy records, content, events, audit; latest external deletion checks; fresh-device recovery into Safe Mode | Off-host backup custody, passphrase recovery, dependency cache, live archive access, backup scheduling, retention maintenance and clean target-host recovery drill with measured RPO/RTO. |

## Gate disposition

| Gate | Current evidence | Remaining gate work |
| --- | --- | --- |
| J0.1 | Local repository, package 0.2.0, CI definition, checks, documentation | Remote publication/protection and observed CI; optional S3 SDK installation/lock validation |
| J0.2 | Local owner and cryptographic device authentication, revocation, recovery enrollment | Deployed key custody and any future remote/API/agent/guest identities |
| J0.3 | Deterministic P0–P5 boundaries; exact approvals; safe defaults; bounded model workers | Target-host supervisor evidence; richer scope/risk policy for real connectors |
| J0.4 | Encrypted records, key separation, vault, portable and full-system backup | Hardware/keychain custody, rotation/secret leasing, durable off-host backup operation |
| J0.5 | Memory models, scope, provenance, retention, expiry, never-store | Continuous retention maintenance and future guest/agent authorization |
| J0.6 | Provider-independent Core and isolated mock-a/mock-b workers | Real provider/local-runtime conformance and budgets/streaming |
| J0.7 | Harmless mock tool through schema, policy, proposal, approval, execution and audit | Real connector idempotency/cancellation and uncertain-outcome recovery |
| J0.8 | Versioned local events and duplicate rejection | Authenticated ingress, queues, subscriptions, retries and dead letters |
| J0.9 | HMAC ledger, remote write-ahead witnesses, explicit archive reconciliation | Live immutable destination, retention operations, independent checkpoints/rollback monitoring and crash metrics |
| J0.10 | Full-system fresh-directory recovery and later-deletion suppression tested locally | Off-site custody, scheduled backups and clean target-host disaster drill |
| J0.11 | 68 integration/adversarial tests and installed CLI demo | Remote CI, target-host supervisor and live archive/recovery evidence |
| J0.12 | Concrete release blockers and acceptance procedure recorded | Close applicable gates, freeze contracts, obtain owner GO |

The prior reference status remains in Git history and the cumulative work log.
No gate has been silently waived. Deployment steps are in HARDENING.md.
