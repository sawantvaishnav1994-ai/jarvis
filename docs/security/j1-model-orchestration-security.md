# J1.3 Model Orchestration Security

## Authority

J1.3 consumes current authority; it does not create it. Authority is verified before model dispatch and again before accepting provider completion. Revocation, stale security epoch, cancellation, FREEZE/SHUTDOWN enforcement supplied by the authority verifier must fail closed.

## Privacy and disclosure

- D5 is denied from generic J1.3 model orchestration.
- External model routing requires a J1.2 envelope with `external-ai` disclosure target plus the existing J0.6 external-AI consent/privacy checks.
- Owner/project/turn mismatch fails closed.
- Provider locality cannot be broadened by fallback.
- Model/provider IDs are locators only.
- NEVER_STORE/session-only content is not persisted by J1.3.

## Prompt injection

J1.3 does not elevate instructions found inside model-visible data. Untrusted context remains content. Provider output is explicitly marked content-only and cannot self-authorize a tool, permission, approval, memory write, credential disclosure, identity action or operating-mode change.

## Budgets

Existing J0.6 token/context/output/cost checks apply before dispatch and again to returned usage. J1.3 wraps the logical operation in an overall timeout. Retries and fallback use the same route/request budget and cannot create an unbounded loop.

## Cancellation

The caller's AbortSignal is propagated into provider execution. J1.3 rejects results when caller cancellation or operation deadline occurs. It does not claim that an external provider physically stopped computing when only local result acceptance can be stopped.

## Provider health

Repeated failures may open an in-memory circuit. Open circuits are denied at routing time until reset eligibility. Recovery first becomes degraded and a successful operation restores healthy state.

## Audit privacy

J1.3 audit records contain operational metadata only. Never put prompt bodies, context payloads, model response bodies, credentials, API keys, D5 data, NEVER_STORE payloads or other protected plaintext into J1.3 audit metadata.

## Credentials

CI and tests use synthetic/reference adapters with injected transports. No paid provider, external network or real secret is required. A later real transport must use the existing secret-reference architecture and remain optional/disabled by default in deterministic CI.
