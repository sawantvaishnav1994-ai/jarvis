-- Additive recovery lifecycle evidence. No backup bytes or accepted data are rewritten.
ALTER TABLE storage.backups ADD CONSTRAINT backups_owner_id_unique UNIQUE(owner_id,id);
CREATE TABLE storage.backup_retention (
 owner_id text NOT NULL,
 backup_id uuid NOT NULL,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(owner_id,backup_id),
 FOREIGN KEY(owner_id,backup_id) REFERENCES storage.backups(owner_id,id)
);
CREATE TABLE storage.backup_deletion_obligations (
 owner_id text NOT NULL,
 backup_id uuid NOT NULL,
 record_id uuid NOT NULL,
 deletion_id uuid NOT NULL,
 created_at timestamptz NOT NULL,
 purge_eligible_at timestamptz NOT NULL,
 PRIMARY KEY(owner_id,backup_id,record_id),
 FOREIGN KEY(owner_id,backup_id) REFERENCES storage.backups(owner_id,id)
);
CREATE INDEX backup_obligations_due ON storage.backup_deletion_obligations(owner_id,purge_eligible_at);
REVOKE ALL ON storage.backup_retention,storage.backup_deletion_obligations FROM PUBLIC;
-- Existing backups without retention evidence are not eligible for normal restore.
-- Rollback: keep these metadata tables; dropping them would lose deletion obligations.
