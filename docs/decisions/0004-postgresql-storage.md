# ADR-0004 — PostgreSQL, pgvector and reviewed Drizzle migrations

Date: 2026-09-01
Status: accepted for J0.1 implementation; Foundation v1 GO not issued

## Decision

Use PostgreSQL 18/pgvector with Drizzle repository mappings and explicit checksum-reviewed SQL migrations.

## Why

One database can initially hold structured data, encrypted memory/event content, metadata and future vectors while preserving domain boundaries.

## Alternatives considered

SQLite-only; Prisma; separate graph/vector/document databases. Drizzle exposes SQL clearly, and one primary database reduces initial operational burden.

## Consequences

PostgreSQL lives behind memory/event/audit ports. Runtime roles cannot migrate schemas. Existing SQLite data stays untouched. A later storage migration requires an explicit versioned export/import bridge.
