# ADR-0005 — Provider-independent intelligence contract

Date: 2026-09-01
Status: accepted for J0.1 implementation; Foundation v1 GO not issued

## Decision

Core accepts a ModelProvider interface with versioned request/reply schemas, capabilities, privacy, cost and cancellation. Use two local deterministic mocks for foundation tests.

## Why

Changing a model must not change Jarvis identity, memories or canonical data.

## Alternatives considered

Direct provider SDK in Core; provider-managed canonical conversations; committing to a hosted agent framework.

## Consequences

Real/local providers require separate adapters and conformance tests. Waiting deadlines abort signals but do not kill uncooperative in-process code. No real AI API key or external inference is required for J0.1.
