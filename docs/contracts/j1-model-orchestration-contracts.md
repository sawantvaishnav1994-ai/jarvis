# J1.3 Model Orchestration Contracts

J1.3 reuses and extends the frozen J0.6 provider-neutral request/result, provider descriptor, registry, routing, audit and adapter contracts. It does not introduce a competing model authority family.

## J13ExecutionInput

Fields: operationKey, operationDigest, current `ContextAssemblyAuthority`, J1.2 `ContextEnvelope`, J0.6 `J06ModelRequest`, and `J13RuntimePolicy`.

`operationKey` is an idempotency/correlation locator only. `operationDigest` is a 64-hex non-plaintext binding supplied by the trusted upstream JARVIS layer. Neither grants authority. Reusing a key with a different digest fails closed.

## J13RuntimePolicy

Fields: J0.6 route policy, operationTimeoutMs, operationAttemptLimit, operationMaxTokens, operationMaxCost, operationAllowUnknownCost, circuitFailureThreshold and circuitResetMs.

The J0.6 route policy carries provider allow/deny/preference, degraded eligibility, retry bound, optional unknown-cost allowance and optional routing strategy. Supported strategies are balanced, cheapest eligible, fastest eligible, highest-quality eligible, local/private preferred, pinned provider+model and fallback-chain preference.

## Model descriptor extensions

The existing J0.6 model descriptor remains version 1 and now permits optional modelFamily, revision, latencyClass, qualityTier, reliabilityTier, region and pricingKnown metadata. Existing locality, capability, context/output limit, pricing, health and credential-reference fields remain valid.

Descriptors are facts/hints for routing. They do not grant disclosure, permission or execution authority.

## Cost contracts

`RouteCandidate.estimatedCost` is `number | null`. Null means the estimate is genuinely unknown; JARVIS must not manufacture an exact estimate.

`NormalizedUsage.cost` is `number | null`. Null means the provider/adapter cannot truthfully report actual cost.

Unknown estimated cost is denied unless the route explicitly allows it. J1.3 also requires `operationAllowUnknownCost` before a logical operation may proceed with unknown cost. The J1.3 result separately exposes selected estimated maximum cost, reported actual cost and `costStatus` (`actual` or `unknown`).

## J13ExecutionResult

Fields include operationId, turnId, correlationId, normalized J0.6 result, deterministic route decision, attemptsBound, fallbackPossible, reservedTokenBudget, reservedCostBudget, selectedEstimatedMaximumCost, actualCost, costStatus, cancellationState and `acceptedAsContentOnly: true`.

The result never authorizes tools, memory writes, approvals, permissions, identity changes or operating-mode changes.

## J13ProviderHealth

Health snapshots contain providerId, state (`healthy`, `degraded`, `unavailable`, `circuit-open`), consecutiveFailures, lastFailureCode, lastSuccessAt, circuitOpenedAt and retryAfter.

J0.6 exposes an optional `ModelExecutionObserver` with before-attempt control and after-attempt outcome metadata. J1.3 uses it to revalidate authority between retry/fallback attempts and to update the health of the provider that actually failed or succeeded. Existing J0.6 callers may omit the observer and retain previous behavior.

## Authority verifier

`J13AuthorityVerifier.verify(authority)` is injected by the authority-owning layer. J1.3 does not manufacture its own identity/session/device/security-epoch/emergency authority. Verification occurs before dispatch, before every retry/fallback attempt and after completion.

## Cancellation contract

`MODEL_CANCELLED` means JARVIS has requested cancellation and will not accept a late result. `cancellationState: requested-result-discarded` is intentionally honest: it does not assert that a remote provider physically stopped computing. Operation deadline failure remains distinct as `MODEL_TIMEOUT`.

## Error model

J1.3 exposes normalized failure codes including policy denial, no eligible provider, capability/context/budget denial, timeout, cancellation, rate limiting, provider unavailable/auth/invalid-response/error, routing failure, authority invalidation and operation conflict. Provider-specific exceptions do not become Core authority signals.

## Structured output

When a structured response contract is requested, J0.6/J1.3 validates the returned value with a JARVIS-owned verifier. Invalid JSON, malformed provider results and contract-invalid structures fail closed. Structured output is still content, not execution authority.

## Reference provider adapter

`ReferenceModelAdapter` implements the existing J0.6 adapter interface and receives a transport dependency. It proves provider interchangeability without embedding a concrete vendor SDK or credentials into Core.

## Compatibility

J1.3 is client-neutral and provider-neutral. New J0.6 descriptor/policy fields are optional so existing callers remain valid. J1.4 may consume the normalized content result but must not reinterpret provider output as authority.
