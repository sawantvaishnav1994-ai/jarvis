# ADR-0009 — Owner passkeys, independent device proof and bounded delegation

Date: 2026-09-02. Status: accepted implementation direction; J0.2 development
acceptance passed in [run 33595165916](https://github.com/sawantvaishnav1994-ai/jarvis/actions/runs/33595165916).

## Decision

Keep one portable owner ID. Use a replaceable real WebAuthn verifier and separately
registered P-256 device keys. Store opaque hashed sessions and recipient-bound
capabilities in owner-controlled encrypted storage. Require fresh one-use signed
approvals for sensitive identity changes. Reserve A4 and deny critical/ownership
transfer until hardware trust and its ceremony actually exist.

Persist identity changes and security audit in the same database transaction;
consume failed challenges durably. Recover owner identity from an encrypted kit
plus separate random offline key, revoking previous authority. Treat data/vault
restoration and external rollback detection as separate J0.10 requirements.

## Why

The owner requires portable identity, least privilege, signed approvals and
provider-independent continuity. A model's claim, synced passkey, bearer cookie,
email address, local-network location or voice match cannot establish all of
those properties. Separating proof, policy and persistence permits replacement
of UI, models and storage without changing owner identity.

## Alternatives considered

- Managed identity provider as root: convenient, but ties portable ownership and
  recovery to an external account. It can later be an adapter, not the root ID.
- Password/email recovery: not selected; introduces a weaker takeover route.
- Passkey alone as device ID: rejected because passkeys can sync between devices.
- Self-contained long-lived JWTs: rejected for the initial owner session because
  live revocation and exact device/epoch checks are required on every action.
- Custom passkey cryptography: rejected in favor of a maintained verifier.
- Claim all verified passkeys are hardware-backed: rejected; no attestation policy.

## Consequences

Browser storage loss requires re-enrollment; remote-domain moves need a migration
ceremony. Database availability is necessary; no insecure in-memory fallback.
Non-extractable browser keys still depend on browser/OS integrity. One serialized
encrypted state adapter is simple but intentionally not a high-scale design.
The development vault is not a hardware enclave; independent audit/recovery
and host confinement remain open. See [full boundaries](../security/j0.2-identity.md).
