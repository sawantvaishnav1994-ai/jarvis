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
