# J0 deployment and acceptance procedure

Status: code and local tests are present; no cloud resources were provisioned.
Complete the following on the owner's selected infrastructure before Foundation
v1 GO. These are concrete deployment dependencies, not new approval requests for
the implementation already authorized.

## Private GitHub destination

The private repository [sawantvaishnav1994-ai/jarvis](https://github.com/sawantvaishnav1994-ai/jarvis)
became accessible during this work session. Its owner and private visibility were
verified. Initial main contained only an eight-byte README and was unprotected.
The work log records the final source publication and CI evidence.

The GitHub integration exposes file/tree/commit operations but no repository
creation or branch-protection mutation. Configure required review/check protection
where the account supports it. Retain the actual Foundation checks workflow run
URL and commit SHA; a prepared workflow is not proof of remote CI success.

## Independent audit infrastructure

The reviewable template is `deploy/audit-archive.cloudformation.json`.
It creates a versioned private S3 bucket with COMPLIANCE retention, server-side
encryption, retained resource deletion policy and a scoped runtime bucket policy.
Required parameters are BucketName, an existing RuntimeRoleArn, a unique
`jarvis/owner-id` Prefix, and owner-selected RetentionDays.

Deploy using separate audit-account administrative credentials. The runtime role
must not administer the archive, assume that administrator role or change its
own IAM permissions. For cross-account use, its identity policy must also grant
the narrow actions listed in the bucket policy. No AWS credentials, account,
bucket or role was available in this development environment.

The optional SDK is pinned directly as `boto3==1.43.85` in the `s3` extra.
The local environment could not complete the package-network operation, so its
transitive lock and installation remain unverified. Resolve, review and save a
hash-locked optional dependency set on the target build host before deployment.
The core runtime/development lock files remain unchanged and installed.

Copy `deploy/archive.example.json` to a private configuration location and replace
every placeholder using the deployed outputs. Credential material belongs in the
host SDK credential chain or scoped workload identity, never in this JSON.

After installation, explicitly run the acceptance probe:

```bash
.venv/bin/python scripts/verify_archive_live.py /private/path/archive.json --write-retained-probe
```

It writes one synthetic COMPLIANCE-retained object, reads its exact version,
tries deletion and retention shortening with the runtime principal, requires
AccessDenied, and verifies the object still reads correctly. The probe object
remains retained; it contains no owner content or secrets. Unexpected network
or permission errors are failures, not successful immutability evidence.
The probe has been prepared but not run against AWS.

Run `archive-sync` for existing history or initialize an archive-backed store.
Exercise archive outage and verify ordinary actions fail while `jarvis stop`
still restricts operation. Reconcile afterward using the owner device key.
Review the remote witness set after crashes; extra witnesses can represent
attempts that never committed to the local database.

Maintain protection before the earliest retained evidence expires. The current
adapter intentionally refuses expired witnesses, and it does not implement
automatic retention extension or archive rollover. Establish independent
checkpoint/rollback monitoring and a retention-maintenance procedure.

## Linux supervisor and emergency drill

The tested local environment runs Linux under supervisord, not systemd.
`scripts/run-supervised.sh` starts a CLI session in a transient systemd user
service named `jarvis-j0.service`. It uses control-group termination, a two-second
stop timeout, SIGKILL escalation, no restart, no privilege escalation, and task/
memory limits. Only one named session is allowed at a time.

```bash
scripts/run-supervised.sh ask --project jarvis
systemctl --user stop jarvis-j0.service
```

Use another owner terminal to stop the service. Check that the service cgroup is
empty and that no late conversation/tool result committed. Independently run
`jarvis stop` to persist restriction across subsequent starts. If the application
or database is hung, the systemd stop must remain effective without application
reasoning or archive access. Test parent/supervisor loss and a descendant that
creates a new POSIX session; process-group tests alone do not prove cgroup cleanup.

This is a trusted local CLI deployment, not an untrusted-code sandbox. A future
network service needs separate least-privilege OS identities, controlled cgroup
membership, authenticated transport and a watchdog before accepting remote work.

## Disaster-recovery drill

Use synthetic data first. Establish a 24-hour RPO and 30-minute RTO as proposed
engineering targets; these are not measured production guarantees.

1. Provision the independently administered archive and record live probe evidence.
2. Enroll the owner device; create two project memories, a mock-tool event and a
   synthetic vault credential. Record audit head, owner UUID and data IDs.
3. Produce a full-system encrypted backup and put a verified copy off-host.
   Record creation time, expiry, SHA-256 and source package/commit/dependency inventory.
4. Delete one project after the backup; confirm the current deletion manifest is
   independently retained. Back up before expiry and monitor failed backup jobs.
5. On a clean target host with no original data/master/device files, install the
   recorded package/dependencies. Obtain the backup passphrase and archive access
   from separate owner-controlled recovery custody.
6. Run full-recover into absent destinations. Record duration and snapshot age.
   Verify stable owner/data IDs, retained vault/content/audit, absence of the later
   deletion, new device proof, revoked old devices and Safe Mode.
7. Exercise a wrong passphrase, inaccessible archive, expired backup and corrupt
   audit. Confirm refusal without a published live directory.
8. Capture the recovery result, independent evidence and target-host process drill.
   Only then assess RPO/RTO and the Foundation v1 GO checklist.

The repository's local recovery tests perform real encryption and fresh SQLite
restore with a simulated archive. They prove the software path, not off-site
custody, IAM enforcement, retention operations or clean-machine recoverability.

## Primary implementation references

- [S3 CloudFormation resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-s3-bucket.html)
- [S3 condition keys and actions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_s3.html)
- [S3 Object Lock administration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html)
- [systemd service termination](https://www.freedesktop.org/software/systemd/man/systemd.kill.html)
- [AWS Python SDK](https://docs.aws.amazon.com/boto3/latest/)
