# Development environment and lifecycle

Run the root commands in README with Node 24.19.0/npm 11 and Docker Compose v2.
`npm ci` uses the checked-in lockfile. Exact dependency versions and shared strict
TypeScript settings keep local development and CI aligned. Avoid global CLIs.

`npm run setup` is safe to repeat with the same vault and Docker volumes. It
never drops volumes, overwrites an existing master key, or accepts a changed
applied migration. Do not delete a vault independently of its database volume:
its runtime credentials and encryption key belong to that development instance.
If those files are lost, stop; there is no automatic credential reset.

| Setting | Default |
| --- | --- |
| `JARVIS_CONFIG` | `config/development.json` |
| `JARVIS_VAULT_FILE` | `.jarvis/development/vault.json` |
| `JARVIS_MASTER_KEY_FILE` | `~/.config/jarvis/typescript/development/master.key` |
| `NEXT_TELEMETRY_DISABLED` | Set to `1` by repository setup/start scripts |

Only file paths go in environment overrides. Configuration contains references
such as `development/database/runtime`; credentials are resolved from the
encrypted vault. Environment templates use separate database/user names and
secret namespaces. Non-development startup is deliberately rejected.

Start runs a local supervisor with a private control socket. `npm stop` sends an
authenticated local stop request; Ctrl+C works too. The supervisor sends TERM to
its child process groups, waits up to five seconds, then sends KILL to remaining
children. This development convenience is not production process containment or
a guarantee under kernel failure, supervisor kill, privileged escape, or device
side effects. Production requires independent host controls and cgroup drills.

Health endpoints: API and worker `/health/live`, `/health/ready`; web
`/api/health`. API `/v1/status` aliases readiness. Liveness says the process can
answer. Readiness checks PostgreSQL/migration history/Redis and (for API) a fresh
worker heartbeat. Dependency outages return 503 with safe metadata; data failures
never silently switch to in-memory storage. Services reconnect after restoration.

Tests create synthetic records in the development database. Use a disposable
instance for the failure drill, which stops and restarts both backing services.
The `stop` and `infra:down` commands preserve volumes. Desktop, remote deployment,
external providers, personal memory and privileged integrations are future gates.

The Python 0.2 reference remains runnable with its pinned requirements and 68
regression tests. Its previous SQLite database is not read, converted or deleted
by the new startup path. A reviewed export/import bridge will be needed before
migrating real owner data; changing the source language is not a data migration.
