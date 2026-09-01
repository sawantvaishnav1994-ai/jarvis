# PostgreSQL layout

PostgreSQL 18 with pgvector 0.8.6 is the initial adapter. Drizzle mappings live in
`packages/storage/src/schema.ts`; reviewed, checksum-listed SQL lives in
`infrastructure/migrations`. The runner uses a transaction and advisory lock,
checks applied history, and grants limited privileges to a separate runtime role.
Only the development migrator can apply schema changes. No automated downgrade,
destructive migration or production path is supplied.

Schemas: identity, security, conversations, memory, knowledge, projects, agents,
tools, events, audit, devices, integrations and settings. Initially only
principals, encrypted memory, optional embedding metadata, encrypted events,
minimal audit records and migration history have tables. Empty schemas reserve
domain boundaries; they are not implemented features.

Runtime can read migration history, insert/read/delete encrypted memory, and
insert/read events and audit metadata. It cannot create schema objects, edit
migration history, or update/delete/truncate audit rows. It has no embedding write
grant. Owner isolation is currently in service/repository predicates; runtime
DB credentials are trusted service credentials, not per-owner authentication.
Row-level security and authenticated request contexts are later gates.

Add a new monotonically numbered SQL file and reviewed SHA-256 manifest entry.
Do not edit an applied file. The destructive-statement check is conservative
lint, not a SQL sandbox; schema changes still require review. Destructive plans
must wait for an approved backup/restore gate. PostgreSQL administrators remain
capable of bypassing database-local audit controls.
