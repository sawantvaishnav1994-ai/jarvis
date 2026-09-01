# Local operation and recovery — 0.2.0

Install the core environment with README.md. Default data is under
`~/.local/share/jarvis`; master and device keys are under `~/.config/jarvis`.
Use private 0700 directories and 0600 files. Pass `--home`, `--key-file`,
`--device-key` and `--device-id` before a subcommand to select other locations.
Keep both key files outside the data directory. Passwords and request text are
interactive inputs, never command-line arguments.

## Local lifecycle

```bash
.venv/bin/jarvis init
.venv/bin/jarvis status
.venv/bin/jarvis control copilot
.venv/bin/jarvis ask --project jarvis
.venv/bin/jarvis recall --project jarvis
.venv/bin/jarvis tool --project jarvis
.venv/bin/jarvis --provider mock-b ask --project jarvis
.venv/bin/jarvis audit
.venv/bin/jarvis stop
```

Initialization creates an encrypted device key. Every subsequent owner login
signs a fresh challenge with that key. Safe and Private modes permit only
never-store conversations. Mock tool execution in Copilot requires exact approval.
After host stop, inspect the incident before explicitly issuing `control resume`
and selecting an operating mode.

## Existing 0.1.0 data

Back up the existing private data/key directories under owner custody first.
A legacy store with no enrolled cryptographic device fails ordinary login.
Use `jarvis migrate-device` locally with the legacy owner password and a fresh
device-key destination. It enrolls the first key, increments the session epoch
and appends migration evidence. It does not offer password-only login as a fallback.
An already-enrolled store cannot use this migration path.

## Portable content exchange

```bash
.venv/bin/jarvis export /private/path/owner-export.json
.venv/bin/jarvis backup /private/path/content.jbackup
.venv/bin/jarvis restore /private/path/content.jbackup
.venv/bin/jarvis delete --project jarvis
```

Export is plaintext canonical content and must be handled as private data.
`backup` encrypts that content. `restore` imports into an existing owner store.
Legacy `recover` initializes fresh owner storage from a content backup. It does
not recover the entire system and, without an archive, cannot discover deletion
decisions that occurred after the content backup. Use the full-system procedure
below for disaster recovery.

## Independent archive

Follow HARDENING.md to provision and verify the destination, then pass
`--archive-config /private/path/archive.json` on ordinary commands.
A new archive-backed store can initialize with that option. To bind existing
local history, use `archive-sync` with the owner password/device key first.

`archive-verify` checks configuration; `audit-archive` reads retained witnesses.
After offline `stop`, `archive-sync` explicitly reconciles local stop evidence.
It does not resume work or change restrictive control flags.

## Full-system backup and recovery

```bash
.venv/bin/jarvis --archive-config /private/path/archive.json full-backup /private/path/system.jbackup
.venv/bin/jarvis --home /private/new-data --key-file /private/new-keys/master.key --device-key /private/new-keys/device.pem --archive-config /private/path/archive.json full-recover /private/path/system.jbackup
```

The parent directories must exist with appropriate private permissions or be
creatable. All final recovery destinations must be absent. Enter the backup
passphrase and a new owner/device password when prompted.

Record the returned recovered device ID. Supply it using `--device-id` for later
commands. Verify owner identity, retained memories, vault contents and audit,
check that later deletions remain absent, and keep Safe Mode until recovery is
reviewed. Old devices and sessions are revoked. The recovery function reports
elapsed recovery seconds and the snapshot creation time.

Copy the encrypted backup off the runtime host and keep its passphrase recoverable
through a separate owner-controlled channel. Neither copy nor scheduled backup
operation is provisioned by these commands. The target-host drill in HARDENING.md
is still required; a simulator-backed test is not evidence of disaster readiness.
