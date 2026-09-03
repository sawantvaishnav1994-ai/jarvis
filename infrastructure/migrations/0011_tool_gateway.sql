CREATE SCHEMA IF NOT EXISTS tools;

CREATE TABLE IF NOT EXISTS tools.executions (
    execution_id text PRIMARY KEY,
    request_id text NOT NULL,
    correlation_id text NOT NULL,
    tool_id text NOT NULL,
    tool_version integer NOT NULL CHECK (tool_version > 0),
    operation text NOT NULL,
    actor_id text NOT NULL,
    source text NOT NULL,
    input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
    authorization_reference text,
    approval_reference text,
    idempotency_key text,
    state text NOT NULL,
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    verification_state text NOT NULL DEFAULT 'UNVERIFIED',
    error_class text,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS tools.idempotency (
    idempotency_key text PRIMARY KEY,
    request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    tool_id text NOT NULL,
    tool_version integer NOT NULL CHECK (tool_version > 0),
    operation text NOT NULL,
    execution_id text,
    state text NOT NULL DEFAULT 'RESERVED',
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS tool_executions_request_idx
    ON tools.executions(request_id);
CREATE INDEX IF NOT EXISTS tool_executions_idempotency_idx
    ON tools.executions(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
