# J1.3 Model Orchestration Architecture

## Governing principle

JARVIS is the system. Models are replaceable brains. The orchestration runtime can choose and call an eligible model, but it cannot create authority.

## Composition

`ConversationSessionEngine` establishes the current turn authority. `ContextAssembler` creates the only context envelope eligible for the model stage. `J13ModelOrchestrator` binds those two inputs to the existing J0.6 `ModelRouter` and provider/model registry.

Flow:

1. validate J1.3 runtime policy and exact operation digest;
2. bind owner/project/turn, classification ceiling and J1.2 disclosure metadata;
3. verify current session/device/security-epoch/emergency authority through an injected verifier;
4. evaluate the J0.6 registry and deterministic provider route;
5. exclude providers whose J1.3 circuit is open;
6. calculate the full logical attempt bound and reserve token/cost budget across retry/fallback;
7. dispatch through the provider-neutral adapter contract;
8. before every retry/fallback attempt, recheck cancellation, deadline and current authority;
9. validate/normalize every provider result through J0.6;
10. update health for the provider that actually succeeded or failed;
11. recheck cancellation, timeout and authority before accepting completion;
12. return a correlated result explicitly marked content-only.

## Provider architecture

Concrete providers implement the J0.6 `J06ModelAdapter` contract. J1.3 supplies a second `ReferenceModelAdapter` whose transport is injected. This permits a standards-compatible HTTP transport later without coupling Core to a vendor SDK. Tests use deterministic synthetic transports and no real credentials/network.

Provider descriptors can expose optional model family/revision, latency class, quality tier, reliability tier, region and pricing-known metadata in addition to locality, capabilities, context/output limits and health. These are routing descriptors only; none grants authority.

## Routing strategies

Routing remains deterministic for a fixed registry/policy/request/context/health snapshot. The provider-neutral route policy supports balanced routing, cheapest eligible, fastest eligible, highest-quality eligible, local/private preferred, explicitly pinned provider+model and explicit fallback-chain preference. Pinned/preferred models remain preferences constrained by allow/deny, privacy, capability, locality, health and budget rules; they cannot override policy.

Stable provider/model identifiers are the final tie-break. Unknown latency/quality/reliability metadata receives deterministic neutral defaults.

## Cost representation

Estimated maximum provider cost is separate from reported actual cost. A provider descriptor can mark pricing as unknown, producing `estimatedCost: null`; providers can report `usage.cost: null` when actual cost is unavailable. Unknown cost is denied by default and requires explicit route-level plus operation-level allowance. J1.3 never converts an unknown amount into a fabricated exact value.

## Budgets and fallback

J0.6 preflight enforces model context/output/token/cost ceilings and validates returned usage. J1.3 adds one operation timeout and one shared logical operation budget around the complete retry/fallback plan.

Before dispatch J1.3 computes:

- the total maximum number of provider attempts;
- the reserved token bound for those attempts;
- the reserved known-cost bound for those attempts.

The operation fails closed when these exceed `operationAttemptLimit`, `operationMaxTokens` or `operationMaxCost`. Unknown cost requires explicit `operationAllowUnknownCost`. Retry count is bounded and fallback remains restricted to candidates eligible under the same privacy/locality/capability/budget policy.

## Health and circuit state

J1.3 tracks only runtime metadata: state, consecutive failures, last failure code, last success time, circuit-open time and retry-after. Per-attempt observer events allow the circuit to learn which provider actually failed even when a later fallback succeeds. A threshold opens the circuit; expiry moves it to degraded; a successful probe returns it to healthy. Owner cancellation, policy denial and authority invalidation do not incorrectly degrade provider health. The state is intentionally not durable in J1.3.

## Idempotency and correlation

`operationKey` is a locator. `operationDigest` binds the logical operation to an upstream non-plaintext 64-hex digest. Reusing the same key with the same digest returns the same in-process operation; reusing the key with a different digest fails with `MODEL_OPERATION_CONFLICT`. Neither value grants authorization.

The operation result carries turn, operation and correlation identifiers. J1.3 does not store prompt/context plaintext in the idempotency map.

## Cancellation and authority

Cancellation is checked before dispatch, propagated by `AbortSignal`, checked before every attempt and checked after provider completion. Current authority is verified before dispatch, before every retry/fallback and after completion so revocation/security-epoch invalidation/FREEZE/SHUTDOWN cannot be ignored by a later attempt or result.

`MODEL_CANCELLED` means JARVIS requested cancellation and will discard the result. It does not falsely claim an external provider physically stopped computing. Operation timeout is separately normalized as `MODEL_TIMEOUT`.

## Structured output and model authority

Structured output is validated against a JARVIS-owned verifier when a contract is requested. Malformed or contract-invalid structured output fails closed. Tool-call-like content remains model output only; it does not execute a tool or create approval/permission authority.

## Observability

J1.3 audit events contain operation/turn/correlation IDs, provider/model IDs, reason/error codes, attempt bounds, usage and cost metadata. They do not contain prompt/context/model plaintext, API keys, credentials, D5 or NEVER_STORE payloads.

## Future compatibility

Provider/model/health/usage/cost/cancellation metadata is structured so J1.11 can later expose safe model activity in the Owner Control Center. Full response generation, persistence, memory, tools, approvals, complete operating-mode behavior, full streaming resilience and UI remain later milestones.
