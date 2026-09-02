-- Additive J0.4 substrate. No applied migration or existing payload is rewritten.
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS recovery;
REVOKE ALL ON SCHEMA storage,recovery FROM PUBLIC;
ALTER TABLE memory.records ADD COLUMN storage_metadata jsonb;
ALTER TABLE memory.embeddings ALTER COLUMN embedding DROP NOT NULL;
ALTER TABLE memory.embeddings ADD COLUMN owner_id text;
ALTER TABLE memory.embeddings ADD COLUMN encrypted_payload text;
ALTER TABLE memory.embeddings ADD COLUMN storage_metadata jsonb;

CREATE TABLE storage.record_catalog (
 id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES identity.root_owner(id),
 domain text NOT NULL, revision integer NOT NULL CHECK(revision>0),
 data_class text NOT NULL CHECK(data_class IN ('D0','D1','D2','D3','D4')),
 deleted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id)
);
CREATE INDEX storage_catalog_owner_domain ON storage.record_catalog(owner_id,domain,deleted);
CREATE TABLE conversations.conversations (id uuid PRIMARY KEY REFERENCES storage.record_catalog(id),owner_id text NOT NULL,payload text NOT NULL,metadata jsonb NOT NULL);
CREATE TABLE conversations.messages (LIKE conversations.conversations INCLUDING ALL);
CREATE TABLE conversations.attachments (LIKE conversations.conversations INCLUDING ALL);
CREATE TABLE knowledge.entities (LIKE conversations.conversations INCLUDING ALL);
CREATE TABLE knowledge.relationships (LIKE conversations.conversations INCLUDING ALL);
CREATE TABLE knowledge.relationship_evidence (LIKE conversations.conversations INCLUDING ALL);
CREATE TABLE projects.records (LIKE conversations.conversations INCLUDING ALL);
CREATE TABLE settings.owner_records (LIKE conversations.conversations INCLUDING ALL);
CREATE TABLE memory.sources (
 owner_id text NOT NULL,record_id uuid NOT NULL,source_id uuid NOT NULL,
 PRIMARY KEY(owner_id,record_id,source_id)
);
CREATE TABLE storage.data_lineage (
 owner_id text NOT NULL, source_id uuid NOT NULL, derived_id uuid NOT NULL,
 source_version integer NOT NULL, on_delete text NOT NULL CHECK(on_delete IN ('cascade','invalidate')),
 PRIMARY KEY(owner_id,source_id,derived_id),CHECK(source_id<>derived_id),
 FOREIGN KEY(owner_id,source_id) REFERENCES storage.record_catalog(owner_id,id),
 FOREIGN KEY(owner_id,derived_id) REFERENCES storage.record_catalog(owner_id,id)
);
CREATE INDEX lineage_derived ON storage.data_lineage(owner_id,derived_id);
CREATE TABLE storage.objects (
 id uuid PRIMARY KEY,owner_id text NOT NULL,object_key text NOT NULL,metadata text NOT NULL,data_class text NOT NULL CHECK(data_class IN ('D0','D1','D2','D3','D4')),
 deleted boolean NOT NULL DEFAULT false,UNIQUE(owner_id,object_key)
);
CREATE TABLE storage.object_versions (id uuid PRIMARY KEY,owner_id text NOT NULL,object_id uuid NOT NULL,revision integer NOT NULL,payload text NOT NULL);
CREATE TABLE storage.record_versions (owner_id text NOT NULL,record_id uuid NOT NULL,revision integer NOT NULL,payload text NOT NULL,metadata jsonb NOT NULL,PRIMARY KEY(owner_id,record_id,revision));
CREATE TABLE storage.retention_policies (id uuid PRIMARY KEY,owner_id text NOT NULL,revision integer NOT NULL,payload text NOT NULL);
CREATE TABLE storage.deletion_requests (id uuid PRIMARY KEY,owner_id text NOT NULL,payload text NOT NULL);
CREATE TABLE storage.deletion_tombstones (owner_id text NOT NULL,record_id uuid NOT NULL,deleted_at timestamptz NOT NULL,deletion_id uuid NOT NULL,PRIMARY KEY(owner_id,record_id));
CREATE TABLE storage.exports (id uuid PRIMARY KEY,owner_id text NOT NULL,payload text NOT NULL);
CREATE TABLE storage.export_items (export_id uuid NOT NULL,owner_id text NOT NULL,item_id text NOT NULL,checksum text NOT NULL,PRIMARY KEY(export_id,item_id));
CREATE TABLE storage.backups (id uuid PRIMARY KEY,owner_id text NOT NULL,payload text NOT NULL);
CREATE TABLE storage.backup_items (backup_id uuid NOT NULL,owner_id text NOT NULL,item_id text NOT NULL,checksum text NOT NULL,PRIMARY KEY(backup_id,item_id));
CREATE TABLE storage.restore_jobs (id uuid PRIMARY KEY,owner_id text NOT NULL,payload text NOT NULL);
CREATE TABLE storage.integrity_checks (id uuid PRIMARY KEY,owner_id text NOT NULL,payload text NOT NULL);
CREATE TABLE security.key_metadata (id text PRIMARY KEY,owner_id text NOT NULL,payload text NOT NULL);
CREATE TABLE security.secret_metadata (id text PRIMARY KEY,owner_id text NOT NULL,payload text NOT NULL);
CREATE TABLE security.data_access_events (id uuid PRIMARY KEY,record jsonb NOT NULL);
CREATE TABLE recovery.migration_probe (id uuid PRIMARY KEY,owner_id text NOT NULL,payload text NOT NULL);
CREATE TRIGGER data_access_no_update_delete BEFORE UPDATE OR DELETE ON security.data_access_events FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TRIGGER data_access_no_truncate BEFORE TRUNCATE ON security.data_access_events FOR EACH STATEMENT EXECUTE FUNCTION audit.prevent_mutation();
REVOKE ALL ON ALL TABLES IN SCHEMA storage,recovery,conversations,knowledge,projects FROM PUBLIC;
