# ADR-0007 — Permission and approval gateway for tools

Date: 2026-09-01
Status: accepted for J0.1 implementation; Foundation v1 GO not issued

## Decision

Every tool uses validation, policy/risk, exact-bound approval, execution, verification and separate audit recording. Foundation policy denies sensitive/critical operations.

## Why

A model or agent cannot be its own permission authority. Tool execution must have accountable actor/context.

## Alternatives considered

Direct tool calls from models; per-connector ad hoc approvals; prompt-only safety.

## Consequences

Only contract tests invoke the harmless test tool. The API exposes no tool execution. J0.2/J0.3 must supply authenticated contexts and durable approval authority. Real connectors need idempotency and uncertain-outcome recovery.
