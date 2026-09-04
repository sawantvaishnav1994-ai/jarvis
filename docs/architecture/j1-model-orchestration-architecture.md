# J1.3 Model Orchestration Architecture

## Governing principle

JARVIS is the system. Models are replaceable brains. The orchestration runtime can choose and call an eligible model, but it cannot create authority.

## Composition

`ConversationSessionEngine` establishes the current turn authority. `ContextAssembler` creates the only context envelope eligible for the model stage. `J13ModelOrchestrator` binds those two inputs to the existing J0.6 `ModelRouter` and provider registry.

Flow:

1. validate J1.3 runtime policy;
2. bind owner/project/turn and J1.2 disclosure metadata;
3. verify current session/device/security-epoch authority through an injected verifier;
4. evaluate the J0.6 registry and deterministic provider route;
5. exclude providers whose J1.3 circuit is open;
6. dispatch through the provider-neutral adapter contract;
7. keep retries/fallback inside the same bounded J0.6 request/policy;
8. recheck cancellation, timeout and current authority after provider completion;
9. validate/normalize provider result through J0.6;
10. return a correlated result explicitly marked content-only.

## Provider architecture

Concrete providers implement the J0.6 `J06ModelAdapter` contract. J1.3 supplies a second `ReferenceModelAdapter` whose transport is injected. This permits a standards-compatible HTTP transport later without coupling Core to a vendor SDK. Tests use deterministic synthetic transports and no real credentials/network.

## Determinism

J0.6 registry enumeration and routing are explicitly sorted. J1.3 adds deterministic circuit exclusions before rerouting. For the same registry, route policy, request, ContextEnvelope, authority and health snapshot, the selected candidate is deterministic.

## Budgets and fallback

J0.6 preflight enforces model context/output/token/cost ceilings and validates returned usage. J1.3 adds one operation timeout around the whole logical orchestration operation. Retry count is bounded by the route policy and fallback is restricted to candidates that remain eligible under the same privacy/locality/capability/budget policy.

## Health and circuit state

J1.3 tracks only runtime metadata: state, consecutive failures, last failure code, last success time, circuit-open time and retry-after. A threshold opens the circuit; expiry moves it to degraded; a successful probe returns it to healthy. The state is intentionally not durable in J1.3.

## Cancellation and authority

Cancellation is checked before dispatch, propagated by `AbortSignal`, checked after provider completion, and late results are rejected. Current authority is verified both before dispatch and after completion so revocation/security-epoch invalidation cannot be ignored by a late model result.

## Observability

J1.3 audit events contain operation/turn/correlation IDs, provider/model IDs, reason/error codes, attempt bounds, usage and cost metadata. They do not contain prompt/context/model plaintext, API keys, D5 or NEVER_STORE payloads.

## Future compatibility

Provider/model/health/usage/cost/cancellation metadata is structured so J1.11 can later expose safe model activity in the Owner Control Center. Full response-generation, persistence, memory, tools, approvals, operating-mode behavior, streaming resilience and UI remain later milestones.
