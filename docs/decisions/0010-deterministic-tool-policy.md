# ADR-0010 — Deterministic policy and a registered v2 tool gateway

Date: 2026-09-02. Status: implemented; J0.3 increment acceptance pending full CI.

## Decision

Use strict, versioned policy documents, exact matches, default denial and deny
precedence. Derive risk floors from registered tool effects, not model output.
Construct v2 execution context only after cryptographic identity verification.
Separate policy evaluation, one-use approval consumption, control-state reads,
tool execution and audit persistence. Only a synthetic P0 read is registered in
the development API; policy edits cannot install tools or enable network effects.

Copy/freeze tool metadata, policy, input and authenticated context. Bind approvals
to the complete action, input digest, identity, resource, policy digest and control
state. Recheck controls and expiry after asynchronous gates. Store v2 policy
evidence in a new append-only table without changing v1 records or constraints.

## Why

Jarvis's security decisions must remain independent of replaceable brains, UI and
storage. Explicit denial must not depend on rule ordering. A valid identity or
capability is necessary but does not itself satisfy resource/action policy.
The approach follows centralized, default-deny, per-request authorization guidance
in [OWASP's Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

## Alternatives considered

- Keep the API's inline mock predicate: insufficient for reusable resource/risk policy.
- LLM decides permission: violates the constitution; not considered an authority.
- Full general policy language now: deferred until requirements justify that complexity.
- Modify v1 audit's constraint: the migration guard rejected constraint replacement.
  Chose a strictly additive table instead; the guard and applied migrations remain intact.
- Implement approval issuance with an in-memory map: rejected for runtime. Test doubles
  exercise the consume contract; production-quality generic issuance remains a later gate.

## Consequences

New audit readers must query v1 and v2 tables deliberately. v1 APIs remain for
reference/conformance tests; the active API uses v2. Post-effect audit failure
is an uncertain outcome, not rollback. Metadata and trusted tool implementations
remain part of the trusted computing base. Same-process checks are not a sandbox.
The local policy file is operator-controlled configuration, not yet a signed,
owner-administered policy distribution system. Full J0.3 is not complete.
