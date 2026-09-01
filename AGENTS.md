# JARVIS engineering rules

Read docs/J0_CHARTER.md and docs/STATUS.md before changing scope.
The owner-supplied Master Definition remains the protected product baseline.
Core imports contracts, never concrete storage, model, or interface adapters.
Model output cannot grant permissions. No connector may bypass the gateway.
Do not introduce a cloud service, paid resource, live agent or external action
as a side effect of running tests. Use synthetic data and temporary directories.
Do not commit credentials, runtime databases, exports, or keys.
Run `PYTHONPATH=src python3 scripts/check.py` and
`PYTHONPATH=src python3 -m unittest discover -s tests -v` before committing.
Record the evidence for each completed gate. Never describe local hash chaining
as independently immutable storage. Preserve old master-definition versions.

## Owner-required cumulative work log

Read JARVIS_WORK_LOG.md at the start of each JARVIS work session. Before the final
response, append every new project prompt verbatim (including original spelling,
punctuation, and formatting), the actual work performed, affected files, checks
and results, available commit references, deliverables, blockers, and next steps.
Use one cumulative JARVIS_WORK_LOG.md, preserve older entries, and update the
existing saved file rather than creating a disconnected log for each task.
Backfill exact previous delivered responses when available; never reconstruct
unavailable conversation text as a verbatim transcript. This is the owner's
standing instruction, not an optional documentation step.

## Active TypeScript monorepo (owner revision, 2026-09-01)

Read docs/architecture/system.md and docs/security/j0.1-boundaries.md. The active
application is apps/* plus packages/*; src/jarvis remains the Python reference.
Use public package entrypoints, strict TypeScript and versioned Zod contracts.
Never add provider SDKs, SQL or UI imports to Core. Do not bypass ToolGateway.
No agent may grant permissions or alter protected policy. No audit bypass.
No plaintext credentials in source, logs, ordinary tables or environment templates.
No direct production database changes. Applied SQL migrations are immutable;
new migrations need a reviewed checksum entry. Destructive migrations require
verified backup/recovery and authorization. No deployment without passing tests.
Do not enable personal-data, tool or owner endpoints before J0.2 authentication.
Run npm run check and npm run build:web before publishing; full-stack CI must
pass before calling J0.1 accepted. Preserve the required Python regression checks.
Update one cumulative JARVIS_WORK_LOG.md, preserving all user prompts verbatim.
