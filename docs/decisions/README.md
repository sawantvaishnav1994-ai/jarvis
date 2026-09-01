# Architectural decisions

Create a new numbered ADR from `template.md` when a difficult-to-reverse choice
changes. Record date, status, decision, why, alternatives, consequences and links
to validation. Keep superseded decisions in history.

Historical ADR-0001 and ADR-0002 remain in `docs/adr`. ADR-0003 supersedes the
Python-first package choice for the main application, following the owner's
new J0.1 prompt. The original Master Definition is unchanged.

| ADR | Choice |
| --- | --- |
| 0003 | TypeScript modular monorepo |
| 0004 | PostgreSQL/pgvector, Drizzle, reviewed SQL |
| 0005 | Provider-independent model port |
| 0006 | Local ownership and encrypted secret references |
| 0007 | Tool gateway, policy and approvals |
| 0008 | Operational/audit separation and append-only access |
