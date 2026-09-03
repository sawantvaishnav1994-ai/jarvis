-- J0.9 additive audit, observability, traceability and forensic evidence.
CREATE TABLE audit.records_v3 (
    audit_id uuid PRIMARY KEY,
    audit_version integer NOT NULL CHECK (audit_version = 3),
    owner_id text NOT NULL,
    project_id text NOT NULL DEFAULT '',
    stream_sequence bigint NOT NULL,
    action text NOT NULL,
    result text NOT NULL,
    severity text NOT NULL,
    classification text NOT NULL CHECK (classification IN ('D0','D1','D2','D3','D4')),
    actor_id text NOT NULL,
    actor_type text NOT NULL,
    correlation_id text NOT NULL,
    trace_id text NOT NULL,
    causation_id text,
    occurred_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL,
    previous_hash char(64),
    record_hash char(64) NOT NULL UNIQUE,
    payload_redacted boolean NOT NULL DEFAULT false,
    retention_class text NOT NULL,
    record jsonb NOT NULL,
    UNIQUE(owner_id, project_id, stream_sequence)
);
CREATE INDEX audit_records_owner_time ON audit.records_v3(owner_id, recorded_at DESC);
CREATE INDEX audit_records_project_time ON audit.records_v3(owner_id, project_id, recorded_at DESC);
CREATE INDEX audit_records_trace ON audit.records_v3(owner_id, trace_id);
CREATE INDEX audit_records_correlation ON audit.records_v3(owner_id, correlation_id);
CREATE INDEX audit_records_action ON audit.records_v3(owner_id, action, recorded_at DESC);
CREATE INDEX audit_records_result_severity ON audit.records_v3(owner_id, result, severity, recorded_at DESC);
CREATE TRIGGER audit_v3_no_update_delete BEFORE UPDATE OR DELETE ON audit.records_v3
 FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TRIGGER audit_v3_no_truncate BEFORE TRUNCATE ON audit.records_v3
 FOR EACH STATEMENT EXECUTE FUNCTION audit.prevent_mutation();

CREATE TABLE audit.checkpoints (
    checkpoint_id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    project_id text NOT NULL DEFAULT '',
    first_sequence bigint NOT NULL,
    last_sequence bigint NOT NULL,
    record_count bigint NOT NULL CHECK (record_count >= 0),
    chain_head_hash char(64) NOT NULL,
    created_at timestamptz NOT NULL
);
CREATE INDEX audit_checkpoints_owner_time ON audit.checkpoints(owner_id, project_id, created_at DESC);
CREATE TRIGGER audit_checkpoint_no_update_delete BEFORE UPDATE OR DELETE ON audit.checkpoints
 FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TRIGGER audit_checkpoint_no_truncate BEFORE TRUNCATE ON audit.checkpoints
 FOR EACH STATEMENT EXECUTE FUNCTION audit.prevent_mutation();

CREATE TABLE audit.trace_spans (
    span_id text PRIMARY KEY,
    trace_id text NOT NULL,
    parent_span_id text,
    owner_id text NOT NULL,
    project_id text NOT NULL DEFAULT '',
    category text NOT NULL,
    status text NOT NULL,
    started_at timestamptz NOT NULL,
    ended_at timestamptz NOT NULL,
    duration_ms double precision NOT NULL CHECK (duration_ms >= 0),
    safe_attributes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_trace_spans_trace ON audit.trace_spans(owner_id, trace_id, started_at);
CREATE TRIGGER audit_span_no_update_delete BEFORE UPDATE OR DELETE ON audit.trace_spans
 FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();

CREATE TABLE audit.export_manifests (
    export_id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    project_id text NOT NULL DEFAULT '',
    requested_by text NOT NULL,
    first_sequence bigint,
    last_sequence bigint,
    record_count bigint NOT NULL CHECK (record_count >= 0),
    chain_head_hash char(64),
    verification_ok boolean NOT NULL,
    manifest jsonb NOT NULL,
    created_at timestamptz NOT NULL
);
CREATE INDEX audit_exports_owner_time ON audit.export_manifests(owner_id, created_at DESC);
CREATE TRIGGER audit_export_no_update_delete BEFORE UPDATE OR DELETE ON audit.export_manifests
 FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();

REVOKE ALL ON audit.records_v3,audit.checkpoints,audit.trace_spans,audit.export_manifests FROM PUBLIC;
