# J1.3 Model Orchestration Contracts

J1.3 reuses the frozen J0.6 provider-neutral request/result, provider descriptor, registry, routing, audit and adapter contracts. It does not introduce a competing model contract family.

## J13ExecutionInput

Fields: operationKey, current `ContextAssemblyAuthority`, J1.2 `ContextEnvelope`, J0.6 `J06ModelRequest`, and `J13RuntimePolicy`.

The operation key is an idempotency/correlation locator only. It grants no authority.

## J13RuntimePolicy

Fields: J0.6 route policy, operationTimeoutMs, circuitFailureThreshold and circuitResetMs. Route policy continues to carry provider allow/deny/preference, degraded eligibility and retry bound.

## J13ExecutionResult

Fields: operationId, turnId, correlationId, normalized J0.6 result, deterministic route decision, attemptsBound, fallbackPossible and `acceptedAsContentOnly: true`.

The result never authorizes tools, memory writes, approvals, permissions, identity changes or operating-mode changes.

## J13ProviderHealth

Health snapshots contain providerId, state (`healthy`, `degraded`, `unavailable`, `circuit-open`), consecutiveFailures, lastFailureCode, lastSuccessAt, circuitOpenedAt and retryAfter.

## Authority verifier

`J13AuthorityVerifier.verify(authority)` is injected by the authority-owning layer. J1.3 does not manufacture its own identity/session/device/security-epoch authority.

## Error model

J1.3 exposes normalized failure codes including policy denial, no eligible provider, capability/context/budget denial, timeout, cancellation, rate limiting, provider unavailable/auth/invalid-response/error, routing failure, authority invalidation and operation conflict. Provider-specific errors do not become Core authority signals.

## Reference provider adapter

`ReferenceModelAdapter` implements the existing J0.6 adapter interface and receives a transport dependency. It proves provider interchangeability without embedding a concrete vendor SDK or credentials into Core.

## Compatibility

J1.3 is client-neutral and provider-neutral. Existing J0.6 contracts remain valid. J1.4 may consume the normalized content result but must not reinterpret provider output as authority.
