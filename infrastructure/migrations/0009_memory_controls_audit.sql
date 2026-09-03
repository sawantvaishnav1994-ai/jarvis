-- J0.5 owner memory controls, context cache invalidation and append-only audit metadata.
CREATE TABLE memory.restrictions (
    owner_id text NOT NULL,
    semantic_key text NOT NULL,
    mode text NOT NULL CHECK(mode IN ('NEVER_STORE')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(owner_id,semantic_key)
);
CREATE TABLE memory.context_cache (
    owner_id text NOT NULL,
    cache_key text NOT NULL,
    memory_ids uuid[] NOT NULL DEFAULT '{}',
    graph_ids uuid[] NOT NULL DEFAULT '{}',
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(owner_id,cache_key)
);
CREATE INDEX memory_context_cache_expiry ON memory.context_cache(owner_id,expires_at);
CREATE TABLE audit.memory_events (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    action text NOT NULL CHECK(action IN (
        'create','admission','retrieve','correct','conflict','supersede',
        'context.include','context.exclude','delete','expire'
    )),
    memory_id uuid,
    reason text NOT NULL,
    occurred_at timestamptz NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX memory_audit_owner_time ON audit.memory_events(owner_id,occurred_at DESC);
CREATE TRIGGER memory_events_no_update_delete BEFORE UPDATE OR DELETE ON audit.memory_events
 FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TRIGGER memory_events_no_truncate BEFORE TRUNCATE ON audit.memory_events
 FOR EACH STATEMENT EXECUTE FUNCTION audit.prevent_mutation();
REVOKE ALL ON memory.restrictions,memory.context_cache,audit.memory_events FROM PUBLIC;
