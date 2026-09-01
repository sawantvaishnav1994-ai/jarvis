# ADR-0008 — Separate operational logs and append-only audit access

Date: 2026-09-01
Status: accepted for J0.1 implementation; Foundation v1 GO not issued

## Decision

Use allowlisted operational metadata and a separate AuditSink. PostgreSQL grants/triggers prevent ordinary audit edits. Preserve the independent archive contract as a later deployment requirement.

## Why

Debug logs and accountability have different payload, retention and access needs.

## Alternatives considered

Treat operational logs as audit; claim database restrictions alone are immutable; store raw tool secrets in audit.

## Consequences

A privileged administrator can bypass database-local protections. Independently administered retention-lock storage, external witnesses and restore reconciliation remain prerequisites for Foundation v1 GO. This decision complements ADR-0002; it does not waive it.
