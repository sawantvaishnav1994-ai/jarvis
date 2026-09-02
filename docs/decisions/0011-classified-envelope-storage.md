# ADR-0011 — Classified records and additive envelope encryption

Date: 2026-09-02. Status: implemented development checkpoint; J0.4 GO pending.

## Decision

Keep sensitivity, retention, residency and consent separate. Require explicit values
in new records. Add a provider-neutral conversation contract, memory v2 and an envelope
format using per-record data keys protected by versioned vault KEKs. Derive bindings
from record metadata and validate externally supplied owner-scoped references on read.
Keep existing v1 data/ciphertext unchanged until a reviewed migration exists.

## Rationale

An AI provider's history is not Jarvis storage. A shared unversioned encryption key
does not give a practical rotation path. Consent to store a conversation does not
mean consent to remember every sentence or transmit it to a provider. Explicit new
contracts make missing legacy decisions visible rather than inventing them.

## Alternatives

- Rewrite all current ciphertext in place: deferred; requires tested backup/restore,
  live rotation authorization, rollback/recovery and durable migration evidence.
- Store D5 values in encrypted general memory: rejected; dedicated vault only.
- Bind everything permanently to a managed KMS/vector provider: rejected; adapters
  may be introduced, but canonical owner data and key versions remain Jarvis-owned.
- Treat an encrypted JSON round trip as disaster recovery: rejected; databases,
  files, identities, secrets, deletion history and independent copies need a full drill.

## Consequences

The codec now underpins classified PostgreSQL repositories and a J0.3-permit data
gateway. Access remains default-deny. Record/history KEKs can be rewrapped
transactionally; this is not key-compromise remediation or permission to destroy keys
protecting old objects/backups. Private vectors remain encrypted rather than queryable
as plaintext. Classification cannot detect every mislabeled credential. Legacy data
migration must resolve consent/provenance and retention, preserve existing identifiers,
and never auto-upgrade missing data to D0. Development GO still requires the complete
storage/secret/delete/recovery acceptance, not just library tests.
