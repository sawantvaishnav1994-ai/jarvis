-- Additive migration: v1 audit entries and their constraints remain unchanged.
CREATE TABLE audit.policy_entries (
    id uuid PRIMARY KEY,
    record jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    CHECK (record->'version' IS NOT NULL AND record->'version' = '2'::jsonb)
);
CREATE TRIGGER policy_audit_no_update_delete BEFORE UPDATE OR DELETE ON audit.policy_entries
 FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TRIGGER policy_audit_no_truncate BEFORE TRUNCATE ON audit.policy_entries
 FOR EACH STATEMENT EXECUTE FUNCTION audit.prevent_mutation();
REVOKE ALL ON audit.policy_entries FROM PUBLIC;
