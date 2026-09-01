CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS security;
CREATE SCHEMA IF NOT EXISTS conversations;
CREATE SCHEMA IF NOT EXISTS memory;
CREATE SCHEMA IF NOT EXISTS knowledge;
CREATE SCHEMA IF NOT EXISTS projects;
CREATE SCHEMA IF NOT EXISTS agents;
CREATE SCHEMA IF NOT EXISTS tools;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS devices;
CREATE SCHEMA IF NOT EXISTS integrations;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA identity,security,conversations,memory,knowledge,projects,agents,tools,events,audit,devices,integrations,settings FROM PUBLIC;
CREATE TABLE identity.principals (
 id text PRIMARY KEY,
 version integer NOT NULL CHECK (version=1),
 kind text NOT NULL CHECK (kind IN ('owner','human','device','core','agent','service','tool','integration')),
 environment text NOT NULL CHECK (environment IN ('development','staging','production')),
 owner_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memory.records (
 id uuid PRIMARY KEY, owner_id text NOT NULL, project_id text NOT NULL,
 version integer NOT NULL CHECK (version=1), payload text NOT NULL,
 created_at timestamptz NOT NULL
);
CREATE INDEX memory_owner_project ON memory.records(owner_id,project_id);
CREATE TABLE memory.embeddings (
 id uuid PRIMARY KEY, memory_id uuid NOT NULL REFERENCES memory.records(id),
 provider text NOT NULL, dimensions integer NOT NULL CHECK(dimensions>0),
 embedding vector NOT NULL, CHECK(vector_dims(embedding)=dimensions)
);
CREATE TABLE events.envelopes (
 id uuid PRIMARY KEY, type text NOT NULL, environment text NOT NULL,
 actor_id text NOT NULL, correlation_id text NOT NULL, payload text NOT NULL,
 occurred_at timestamptz NOT NULL
);
CREATE INDEX events_correlation ON events.envelopes(correlation_id);
CREATE TABLE audit.entries (
 id uuid PRIMARY KEY, record jsonb NOT NULL, created_at timestamptz NOT NULL,
 CHECK ((record->>'version')::integer=1)
);
CREATE FUNCTION audit.prevent_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'audit records are append-only';
END;
$$;
CREATE TRIGGER audit_no_update_delete BEFORE UPDATE OR DELETE ON audit.entries
 FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit.entries
 FOR EACH STATEMENT EXECUTE FUNCTION audit.prevent_mutation();
REVOKE ALL ON ALL TABLES IN SCHEMA identity,memory,events,audit,settings FROM PUBLIC;
