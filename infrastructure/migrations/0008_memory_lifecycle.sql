-- Additive J0.5 memory lifecycle, revision, conflict and admission substrate.
-- Existing J0.4 encrypted memory payloads remain canonical and are not rewritten.

CREATE TABLE memory.lifecycle (
    owner_id text NOT NULL,
    memory_id uuid NOT NULL,
    lifecycle text NOT NULL CHECK(lifecycle IN (
        'PROPOSED','ACTIVE','SUPERSEDED','DISPUTED','EXPIRED',
        'DELETION_REQUESTED','DELETED','PURGED'
    )),
    assertion text NOT NULL CHECK(assertion IN (
        'OWNER_ASSERTED','OBSERVED','IMPORTED','MODEL_INFERRED','DERIVED'
    )),
    semantic_key text,
    confidence double precision NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
    captured_at timestamptz NOT NULL,
    observed_at timestamptz,
    valid_from timestamptz,
    valid_until timestamptz,
    verified_at timestamptz,
    superseded_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(owner_id,memory_id),
    FOREIGN KEY(owner_id,memory_id) REFERENCES storage.record_catalog(owner_id,id),
    CHECK(valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until)
);
CREATE INDEX memory_lifecycle_lookup
    ON memory.lifecycle(owner_id,semantic_key,lifecycle,updated_at DESC);

CREATE TABLE memory.revisions (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    memory_id uuid NOT NULL,
    record_version integer NOT NULL CHECK(record_version > 0),
    lifecycle text NOT NULL CHECK(lifecycle IN (
        'PROPOSED','ACTIVE','SUPERSEDED','DISPUTED','EXPIRED',
        'DELETION_REQUESTED','DELETED','PURGED'
    )),
    assertion text NOT NULL CHECK(assertion IN (
        'OWNER_ASSERTED','OBSERVED','IMPORTED','MODEL_INFERRED','DERIVED'
    )),
    content_hash text NOT NULL CHECK(length(content_hash) BETWEEN 32 AND 128),
    changed_at timestamptz NOT NULL,
    reason text NOT NULL,
    supersedes_revision_id uuid REFERENCES memory.revisions(id),
    UNIQUE(owner_id,memory_id,record_version),
    FOREIGN KEY(owner_id,memory_id) REFERENCES storage.record_catalog(owner_id,id)
);
CREATE INDEX memory_revision_history
    ON memory.revisions(owner_id,memory_id,record_version DESC);

CREATE TABLE memory.conflicts (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    project_id text,
    semantic_key text NOT NULL,
    state text NOT NULL CHECK(state IN ('OPEN','RESOLVED','OWNER_CONFIRMATION_REQUIRED')),
    resolution text CHECK(resolution IS NULL OR resolution IN (
        'SUPERSEDE','PRESERVE_TEMPORAL_HISTORY','DISPUTED',
        'OWNER_CORRECTED','REJECT_LOW_AUTHORITY'
    )),
    created_at timestamptz NOT NULL,
    resolved_at timestamptz,
    CHECK((state = 'RESOLVED' AND resolved_at IS NOT NULL) OR state <> 'RESOLVED')
);
CREATE INDEX memory_conflict_lookup
    ON memory.conflicts(owner_id,semantic_key,state,created_at DESC);

CREATE TABLE memory.conflict_members (
    conflict_id uuid NOT NULL REFERENCES memory.conflicts(id) ON DELETE CASCADE,
    owner_id text NOT NULL,
    memory_id uuid NOT NULL,
    PRIMARY KEY(conflict_id,memory_id),
    FOREIGN KEY(owner_id,memory_id) REFERENCES storage.record_catalog(owner_id,id)
);

CREATE TABLE memory.admission_decisions (
    candidate_id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    project_id text,
    decision text NOT NULL CHECK(decision IN (
        'ACCEPT','ACCEPT_EPHEMERAL','MERGE_WITH_EXISTING','SUPERSEDE_EXISTING',
        'MARK_CONFLICT','REQUIRE_OWNER_CONFIRMATION','REJECT'
    )),
    canonical_memory_id uuid,
    related_memory_ids uuid[] NOT NULL DEFAULT '{}',
    reason_codes text[] NOT NULL,
    decision_hash text NOT NULL CHECK(length(decision_hash) = 64),
    decided_at timestamptz NOT NULL DEFAULT now(),
    CHECK(cardinality(reason_codes) > 0)
);
CREATE INDEX memory_admission_owner
    ON memory.admission_decisions(owner_id,decided_at DESC);
