# Deployment strategy

J0.1 runs locally with Docker backing services and host Node processes. CI creates
a disposable copy of this layout. There is no production deployment workflow.

The future owner-controlled deployment places API and workers on Linux with
host-level service supervision, resource limits, cgroup containment and a stop
control independent of model reasoning. Remote interfaces require authenticated
TLS and explicit environment policy. Database/service credentials and encryption
keys must be distinct by environment and role. Local-only device data remains
local unless the owner authorizes a specific transfer.

Web hosting is replaceable; Vercel is optional. PostgreSQL can be self-hosted or
managed behind the same repository contracts. S3-compatible files/backups and an
independently administered immutable audit destination need separate adapters.
Ordinary S3 compatibility alone does not establish retention-lock guarantees.

Before production: J0.2/J0.3 authentication and policy, managed key custody,
least-privilege identities, independent audit retention evidence, encrypted
off-host backup with recovery drill, pinned deployment images, tested rollback,
monitoring and owner-controlled stop procedures. These are J0 gates, not tasks
silently fulfilled by the development Compose file.
