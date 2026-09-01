#!/usr/bin/env bash
# Run a CLI session under the owner's systemd user manager on the target Linux host.
set -euo pipefail
jarvis_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ $# -lt 1 ]]; then
  echo 'Usage: scripts/run-supervised.sh [jarvis global options] COMMAND' >&2
  exit 2
fi
if ! systemctl --user show-environment >/dev/null 2>&1; then
  echo 'A working systemd user manager is required; no unsupervised fallback.' >&2
  exit 1
fi
exec systemd-run --user --unit=jarvis-j0 --pty --wait --collect \
  --property=Type=exec --property=KillMode=control-group \
  --property=TimeoutStopSec=2s --property=SendSIGKILL=yes \
  --property=NoNewPrivileges=yes --property=LimitCORE=0 \
  --property=TasksMax=64 --property=MemoryMax=512M \
  --property=Restart=no --working-directory="$jarvis_root" \
  "$jarvis_root/.venv/bin/jarvis" "$@"
