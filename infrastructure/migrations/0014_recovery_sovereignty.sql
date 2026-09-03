CREATE SCHEMA IF NOT EXISTS recovery;

CREATE TABLE recovery.manifests (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    project_id text,
    source_installation_id text NOT NULL,
    manifest_version integer NOT NULL,
    manifest_digest text NOT NULL CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    status text NOT NULL CHECK (status IN ('PENDING','VALID','INVALID','EXPIRED'))
);
CREATE INDEX recovery_manifests_owner_time_idx ON recovery.manifests(owner_id, created_at DESC);

CREATE TABLE recovery.restore_plans (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    backup_id uuid NOT NULL,
    plan_digest text NOT NULL CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
    security_epoch bigint NOT NULL,
    payload jsonb NOT NULL,
    state text NOT NULL CHECK (state IN ('PLANNED','SIMULATED','APPROVED','RESTORING','VERIFIED','CUTOVER_READY','COMPLETED','ABORTED','FAILED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz NOT NULL
);
CREATE INDEX recovery_restore_plans_owner_time_idx ON recovery.restore_plans(owner_id, created_at DESC);

CREATE TABLE recovery.executions (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    plan_id uuid NOT NULL REFERENCES recovery.restore_plans(id),
    target_id text NOT NULL,
    state text NOT NULL CHECK (state IN ('RESTORING','VERIFYING','VERIFIED','CUTOVER','COMPLETED','ABORTED','FAILED')),
    correlation_id text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX recovery_executions_owner_time_idx ON recovery.executions(owner_id, started_at DESC);

CREATE TABLE recovery.checkpoints (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    plan_id uuid,
    checkpoint_type text NOT NULL,
    digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
    sequence bigint NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(owner_id, sequence)
);

CREATE TABLE recovery.cutover_markers (
    owner_id text PRIMARY KEY,
    plan_id uuid NOT NULL REFERENCES recovery.restore_plans(id),
    target_id text NOT NULL,
    state text NOT NULL CHECK (state IN ('PREPARED','ACTIVATING','ACTIVE','ABORTED')),
    security_epoch bigint NOT NULL,
    plan_digest text NOT NULL CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recovery.safe_mode (
    owner_id text PRIMARY KEY,
    enabled boolean NOT NULL,
    reason_code text NOT NULL,
    plan_id uuid,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recovery.evidence (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    plan_id uuid,
    action text NOT NULL,
    result text NOT NULL,
    correlation_id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_evidence_owner_time_idx ON recovery.evidence(owner_id, created_at DESC);
