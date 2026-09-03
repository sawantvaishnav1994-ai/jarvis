CREATE SCHEMA IF NOT EXISTS events;

CREATE TABLE events.event_log (
    event_id uuid PRIMARY KEY,
    event_type text NOT NULL,
    schema_version integer NOT NULL CHECK (schema_version > 0),
    occurred_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL,
    owner_id text NOT NULL,
    project_id text,
    correlation_id text NOT NULL,
    causation_id uuid,
    trace_id text,
    producer_id text NOT NULL,
    producer_type text NOT NULL CHECK (producer_type IN ('INTERNAL','EXTERNAL','SCHEDULED','SYSTEM')),
    source_event_id text,
    subject text NOT NULL,
    payload jsonb NOT NULL,
    payload_classification text NOT NULL CHECK (payload_classification IN ('D0','D1','D2','D3','D4')),
    privacy text NOT NULL CHECK (privacy IN ('local-only','private-cloud','ai-allow')),
    sequence_key text,
    sequence_value bigint,
    chain_depth integer NOT NULL DEFAULT 0 CHECK (chain_depth BETWEEN 0 AND 32),
    replay_of uuid,
    replay_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((sequence_key IS NULL) = (sequence_value IS NULL)),
    CHECK ((replay_of IS NULL) = (replay_reason IS NULL))
);
CREATE UNIQUE INDEX event_source_dedupe ON events.event_log(producer_id, source_event_id) WHERE source_event_id IS NOT NULL;
CREATE INDEX event_owner_received ON events.event_log(owner_id, received_at DESC);

CREATE TABLE events.outbox (
    event_id uuid PRIMARY KEY REFERENCES events.event_log(event_id) ON DELETE CASCADE,
    state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','CLAIMED','PUBLISHED')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,
    published_at timestamptz,
    last_error_code text
);
CREATE INDEX event_outbox_pending ON events.outbox(state, available_at);

CREATE TABLE events.inbox (
    event_id uuid NOT NULL REFERENCES events.event_log(event_id) ON DELETE CASCADE,
    consumer_id text NOT NULL,
    state text NOT NULL CHECK (state IN ('CLAIMED','COMPLETED','CANCELLED')),
    claimed_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    PRIMARY KEY(event_id, consumer_id)
);

CREATE TABLE events.subscriptions (
    subscription_id text PRIMARY KEY,
    consumer_id text NOT NULL,
    consumer_type text NOT NULL,
    event_type text NOT NULL,
    owner_id text NOT NULL,
    project_id text,
    boundary text NOT NULL,
    max_classification text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    max_attempts integer NOT NULL,
    base_backoff_ms integer NOT NULL,
    ordered boolean NOT NULL DEFAULT false,
    dead_letter boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events.delivery_attempts (
    attempt_id bigserial PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events.event_log(event_id) ON DELETE CASCADE,
    consumer_id text NOT NULL,
    attempt integer NOT NULL CHECK (attempt > 0),
    state text NOT NULL,
    error_code text,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);

CREATE TABLE events.dead_letters (
    dead_letter_id bigserial PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events.event_log(event_id) ON DELETE CASCADE,
    consumer_id text NOT NULL,
    error_code text NOT NULL,
    attempts integer NOT NULL CHECK (attempts > 0),
    safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    replayed_at timestamptz
);
CREATE INDEX event_dead_letters_owner_lookup ON events.dead_letters(event_id, created_at DESC);

CREATE TABLE events.schedules (
    schedule_id text PRIMARY KEY,
    owner_id text NOT NULL,
    project_id text,
    event_type text NOT NULL,
    schema_version integer NOT NULL CHECK (schema_version > 0),
    subject text NOT NULL,
    payload jsonb NOT NULL,
    classification text NOT NULL CHECK (classification IN ('D0','D1','D2','D3','D4')),
    privacy text NOT NULL CHECK (privacy IN ('local-only','private-cloud','ai-allow')),
    timezone text NOT NULL,
    next_due_at timestamptz NOT NULL,
    interval_seconds integer CHECK (interval_seconds > 0),
    enabled boolean NOT NULL DEFAULT true,
    occurrence bigint NOT NULL DEFAULT 0 CHECK (occurrence >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_schedules_due ON events.schedules(enabled, next_due_at);

CREATE TABLE events.ingress_receipts (
    producer_id text NOT NULL,
    source_event_id text NOT NULL,
    nonce text,
    signature_digest text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    event_id uuid,
    PRIMARY KEY(producer_id, source_event_id)
);
CREATE UNIQUE INDEX event_ingress_nonce ON events.ingress_receipts(producer_id, nonce) WHERE nonce IS NOT NULL;

CREATE TABLE events.sequence_checkpoints (
    owner_id text NOT NULL,
    sequence_key text NOT NULL,
    sequence_value bigint NOT NULL CHECK (sequence_value >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(owner_id, sequence_key)
);
