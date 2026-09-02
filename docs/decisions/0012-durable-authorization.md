# ADR-0012 — Durable authorization on the existing identity transaction

Date: 2026-09-02. Status: accepted for development on source
`5ee91e681839fd58737d79eeb99821cda0da9d49`, CI run 33620442554.

## Decision

Extend the accepted J0.2 cryptographic ceremonies and transaction adapter with a
typed security command port, encrypted governance state and evolved delegation
records. Security owns schemas/policy/risk/approval; Identity owns proof validation;
Storage owns persistence; Tools owns a closed synthetic registry and one-shot
permit verification. No model or UI decides authorization.

## Why

State, replay counters, revocation and audit must commit together. Reusing the
existing transaction prevents parallel approval/use races and identity duplication.
A development grant is insufficient for production: an explicit proposal rule and
fresh exact owner approval are required, without adding a standing permission.

## Alternatives

In-memory approvals lose revocation/replay state on restart. A second owner/auth
system would duplicate J0.2. Direct network calls inside the transaction risk
unbounded locks and unrecoverable effects, so this milestone registers only mocks.

## Consequences

The encrypted aggregate is intentionally bounded (1000 requests/authorizations,
256 policy versions) and fails closed at capacity. No automatic security-history
purge occurs. Real connectors require outbox/idempotency/containment work before
activation. Hardware A4, independent audit immutability and off-host recovery are
not claimed. This ADR extends the historical J0.3.1 boundary in ADR-0010.
