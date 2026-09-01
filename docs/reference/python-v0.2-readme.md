# JARVIS — J0 foundation reference

JARVIS is the system. AI models are replaceable brains used by JARVIS.

This repository contains a runnable local foundation: thirteen logical boundaries,
signed device authentication, encrypted storage, memory, isolated mock-model
workers, a permission-controlled mock tool, events, audit, and encrypted system
recovery. Version 0.2.0 adds an optional independently retained S3 audit adapter.
Local checks pass; deployment gates remain open before Foundation v1 GO.

The approved J0.1–J0.12 sequence is in [J0_CHARTER.md](docs/J0_CHARTER.md).
The original [Master Definition v0.1](docs/JARVIS_Master_Definition_v0.1.md) is
preserved. Read [STATUS.md](docs/STATUS.md) before treating any gate as complete.

## Quick start

Verified target: Python 3.12 on Linux. Run from this directory:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --require-hashes -r requirements-dev.lock
.venv/bin/python -m pip install --no-deps --no-build-isolation -e .
.venv/bin/jarvis demo
```

The demo uses synthetic content, temporary keys, two deterministic local models,
and a harmless echo tool. It authenticates, stores a conversation and memory,
records an event, prepares/approves/executes the tool, swaps the model, reads
memory, encrypts a portable backup, deletes data, and verifies that replaying the
old backup cannot restore deleted IDs into the same store. It makes no network
requests at runtime. Installing dependencies requires package-network access.

## Run checks

```bash
.venv/bin/ruff check .
.venv/bin/python scripts/check.py
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -v
.venv/bin/jarvis demo
```

CI runs the same lint, architecture, integration, and demo checks. The workflow
is prepared but has not run on a private remote in this session. Third-party
Actions are pinned to verified full commit SHAs and the job has read-only
repository permission.

## Documents

- [Architecture and stable boundaries](docs/ARCHITECTURE.md)
- [Security model and remaining limitations](docs/SECURITY.md)
- [Local operation and recovery](docs/OPERATIONS.md)
- [Versioning, migrations, and testing](docs/ENGINEERING.md)
- [Implementation decisions](docs/adr/0001-foundation-reference.md)
- [Dependency inventory](docs/DEPENDENCIES.md)
- [Hardening deployment and acceptance](docs/HARDENING.md)
- [Cumulative prompts and work record](JARVIS_WORK_LOG.md)

## Repository state

The source is published in the owner's private repository:
[sawantvaishnav1994-ai/jarvis](https://github.com/sawantvaishnav1994-ai/jarvis).
The first import preserved the repository's initial commit and matched the tested
local source tree exactly. [Remote Foundation checks passed](https://github.com/sawantvaishnav1994-ai/jarvis/actions/runs/33562610591), including all 68 tests.

GitHub reports that rulesets require a paid plan for this private repository.
The repository remains private; protected-branch enforcement is not configured.
Historical pre-import local commits are preserved on a local history branch and
in earlier source deliveries. Use the private repository for current source.

All rights in Jarvis-owned source are reserved to Vaishnav Sawant. Dependencies
retain their own licenses. No credentials or runtime data are included.
