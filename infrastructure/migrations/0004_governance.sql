-- Additive J0.3 state. Identity lock + transaction serialize policy/approval/use/revocation.
-- Logical entities are strict versioned encrypted records, not a second identity system.
CREATE TABLE security.governance_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 version integer NOT NULL DEFAULT 1 CHECK(version=1),
 payload text NOT NULL
);
REVOKE ALL ON security.governance_state FROM PUBLIC;
-- Security decision evidence remains in encrypted, append-only audit.identity_events.
-- Rollback is code rollback with this table retained; no destructive down migration.
