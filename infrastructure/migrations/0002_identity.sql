CREATE TABLE identity.root_owner (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 id text NOT NULL UNIQUE,
 payload text NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version=1)
);
CREATE FUNCTION identity.protect_root_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'root owner identity is immutable';
END;
$$;
CREATE TRIGGER root_no_id_change BEFORE UPDATE OF id ON identity.root_owner
 FOR EACH ROW EXECUTE FUNCTION identity.protect_root_owner();
CREATE TRIGGER root_no_delete BEFORE DELETE ON identity.root_owner
 FOR EACH ROW EXECUTE FUNCTION identity.protect_root_owner();
CREATE TABLE identity.devices (id text PRIMARY KEY, payload text NOT NULL);
CREATE TABLE identity.passkeys (id text PRIMARY KEY, payload text NOT NULL);
CREATE TABLE identity.sessions (id text PRIMARY KEY, payload text NOT NULL);
CREATE TABLE identity.subjects (id text PRIMARY KEY, payload text NOT NULL);
CREATE TABLE identity.delegations (id text PRIMARY KEY, payload text NOT NULL);
CREATE TABLE identity.challenges (id text PRIMARY KEY, payload text NOT NULL);
CREATE TABLE identity.approvals (id text PRIMARY KEY, payload text NOT NULL);
CREATE TABLE identity.replays (id text PRIMARY KEY, payload text NOT NULL);
CREATE TABLE audit.identity_events (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id uuid NOT NULL UNIQUE,
 event_type text NOT NULL,
 occurred_at timestamptz NOT NULL,
 payload text NOT NULL
);
CREATE TRIGGER identity_audit_no_update_delete BEFORE UPDATE OR DELETE ON audit.identity_events
 FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TRIGGER identity_audit_no_truncate BEFORE TRUNCATE ON audit.identity_events
 FOR EACH STATEMENT EXECUTE FUNCTION audit.prevent_mutation();
REVOKE ALL ON ALL TABLES IN SCHEMA identity FROM PUBLIC;
REVOKE ALL ON audit.identity_events FROM PUBLIC;
