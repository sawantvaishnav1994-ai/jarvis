-- Additive deletion substrate. Old attachments require explicit governed linkage;
-- absence of a link must never silently orphan their ciphertext.
ALTER TABLE storage.objects ADD CONSTRAINT storage_objects_owner_id_unique UNIQUE(owner_id,id);
CREATE TABLE storage.attachment_objects (
 owner_id text NOT NULL,
 attachment_id uuid NOT NULL,
 object_id uuid NOT NULL,
 PRIMARY KEY(owner_id,attachment_id),
 FOREIGN KEY(owner_id,attachment_id) REFERENCES storage.record_catalog(owner_id,id),
 FOREIGN KEY(owner_id,object_id) REFERENCES storage.objects(owner_id,id)
);
CREATE INDEX attachment_objects_object ON storage.attachment_objects(owner_id,object_id);
CREATE TABLE storage.object_purges (
 id uuid PRIMARY KEY,
 owner_id text NOT NULL,
 deletion_id uuid NOT NULL REFERENCES storage.deletion_requests(id),
 object_id uuid NOT NULL,
 object_key text NOT NULL CHECK(object_key ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN ('PENDING','PURGED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 purged_at timestamptz,
 UNIQUE(owner_id,object_id),
 FOREIGN KEY(owner_id,object_id) REFERENCES storage.objects(owner_id,id)
);
CREATE INDEX object_purges_pending ON storage.object_purges(owner_id,deletion_id,state);
REVOKE ALL ON storage.attachment_objects,storage.object_purges FROM PUBLIC;
