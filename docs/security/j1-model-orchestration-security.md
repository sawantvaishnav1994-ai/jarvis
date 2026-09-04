# J1.3 Model Orchestration Security

## Authority

J1.3 consumes current authority; it does not create it. Authority is verified before model dispatch, before every retry/fallback attempt and again before accepting provider completion. Revocation, stale security epoch, cancellation, FREEZE/SHUTDOWN enforcement supplied by the authority verifier must fail closed.

A provider failure cannot authorize another attempt after authority has become invalid.

## Privacy and disclosure

- D5 is denied from generic J1.3 model orchestration.
- The J1.2 classification ceiling is rechecked against the model request before dispatch.
- `local` context cannot cross to private/external processing.
- `private` context cannot cross to approved external processing.
- External model routing requires a J1.2 envelope with `external-ai` disclosure target plus the existing J0.6 external-AI consent/privacy checks.
- Private operating mode cannot silently broaden disclosure to approved external processing.
- Owner/project/turn mismatch fails closed.
- Provider locality cannot be broadened by fallback.
- Model/provider IDs are locators only.
- NEVER_STORE/session-only content is not persisted by J1.3.

## Prompt injection

J1.3 does not elevate instructions found inside model-visible data. Untrusted context remains content and is subject to J1.2 exclusion/trust policy. Provider output is explicitly marked content-only and cannot self-authorize a tool, permission, approval, memory write, credential disclosure, identity action or operating-mode change.

## Idempotency and replay

`operationKey` alone is not trusted as an exact-request binding. A 64-hex non-plaintext `operationDigest` is stored beside the in-process operation. Exact same key+digest deduplicates; same key with a changed digest fails `MODEL_OPERATION_CONFLICT`. This prevents a caller from replaying a locator with changed model inputs and inheriting a previous result.

The runtime idempotency map does not store prompt/context plaintext.

## Budgets

Existing J0.6 context/output/token/cost checks apply before dispatch and again to returned usage. J1.3 additionally calculates one bounded logical operation plan across retries and fallback:

- maximum total attempts;
- reserved token bound;
- reserved known-cost bound.

The plan must fit `operationAttemptLimit`, `operationMaxTokens` and `operationMaxCost`. Retry/fallback therefore cannot multiply a single-attempt budget into an uncontrolled operation.

Unknown estimated cost and unknown actual cost are represented as null/unknown rather than fabricated numbers. Unknown cost is denied by default and requires explicit route-level and operation-level permission.

## Cancellation

The caller's AbortSignal is propagated into provider execution. J1.3 checks it before dispatch, between attempts and after provider completion. J1.3 rejects late results when caller cancellation occurs.

`cancellationState: requested-result-discarded` describes what JARVIS can prove. It does not claim that an external provider physically stopped computing when only local result acceptance can be stopped.

Operation deadline is independently normalized as `MODEL_TIMEOUT` rather than being misreported as owner cancellation.

## Retry and fallback

Retry/fallback remains within the same policy and shared operation budget. Before each new attempt J1.3 rechecks current authority, cancellation and deadline. Fallback cannot bypass provider allow/deny, pinned selection, privacy, locality, capability, health, known/unknown cost policy or budget constraints.

## Provider health

Per-attempt outcome observation means a failing primary provider is degraded/opened even if a later fallback succeeds. Repeated provider failures may open an in-memory circuit. Open circuits are denied at routing time until reset eligibility. Recovery first becomes degraded and a successful probe restores healthy state.

Owner cancellation, policy denial and authority invalidation are not counted as provider-health failures.

## Provider response validation

Malformed provider result shape, identity mismatch, invalid token accounting, over-budget usage and invalid structured output fail closed. Provider-specific exceptions are normalized before reaching JARVIS Core callers.

## Audit privacy

J1.3 audit records contain operational metadata only. Never put prompt bodies, context payloads, model response bodies, credentials, API keys, D5 data, NEVER_STORE payloads or other protected plaintext into J1.3 audit metadata.

## Credentials

CI and tests use synthetic/reference adapters with injected transports. No paid provider, external network or real secret is required. A later real transport must use the existing secret-reference architecture and remain optional/disabled by default in deterministic CI.
