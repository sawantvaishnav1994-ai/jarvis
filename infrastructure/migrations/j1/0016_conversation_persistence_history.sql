CREATE TABLE conversations.history_conversations (
    owner_id text NOT NULL,
    conversation_id uuid NOT NULL,
    project_id text,
    security_epoch bigint NOT NULL CHECK (security_epoch >= 0),
    state text NOT NULL CHECK (state IN ('ACTIVE','ARCHIVED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY(owner_id, conversation_id),
    FOREIGN KEY(owner_id, conversation_id) REFERENCES storage.record_catalog(owner_id, id)
);
CREATE INDEX conversation_history_owner_updated_idx
    ON conversations.history_conversations(owner_id, updated_at DESC, conversation_id DESC);

CREATE TABLE conversations.history_messages (
    owner_id text NOT NULL,
    message_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    turn_id uuid,
    role text NOT NULL CHECK (role IN ('user','assistant','system','tool')),
    ordinal bigint NOT NULL CHECK (ordinal > 0),
    content_digest text NOT NULL CHECK (length(content_digest) = 64),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(owner_id, message_id),
    UNIQUE(owner_id, conversation_id, ordinal),
    FOREIGN KEY(owner_id, message_id) REFERENCES storage.record_catalog(owner_id, id),
    FOREIGN KEY(owner_id, conversation_id) REFERENCES conversations.history_conversations(owner_id, conversation_id),
    FOREIGN KEY(owner_id, turn_id) REFERENCES conversations.turns(owner_id, id)
);
CREATE INDEX conversation_history_messages_owner_conversation_idx
    ON conversations.history_messages(owner_id, conversation_id, ordinal);

CREATE TABLE conversations.turn_results (
    owner_id text NOT NULL,
    turn_id uuid NOT NULL,
    response_message_id uuid,
    terminal_state text NOT NULL CHECK (terminal_state IN ('COMPLETED','FAILED','CANCELLED','REVOKED','TIMED_OUT','SAFE_MODE_BLOCKED','EMERGENCY_STOPPED')),
    input_digest text NOT NULL CHECK (length(input_digest) = 64),
    context_digest text CHECK (context_digest IS NULL OR length(context_digest) = 64),
    model_digest text CHECK (model_digest IS NULL OR length(model_digest) = 64),
    response_digest text CHECK (response_digest IS NULL OR length(response_digest) = 64),
    completed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(owner_id, turn_id),
    FOREIGN KEY(owner_id, turn_id) REFERENCES conversations.turns(owner_id, id),
    FOREIGN KEY(owner_id, response_message_id) REFERENCES storage.record_catalog(owner_id, id)
);
CREATE INDEX conversation_turn_results_owner_completed_idx
    ON conversations.turn_results(owner_id, completed_at DESC, turn_id DESC);

CREATE FUNCTION conversations.validate_history_records() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    actual_domain text;
BEGIN
    SELECT domain INTO actual_domain
      FROM storage.record_catalog
     WHERE owner_id = NEW.owner_id
       AND id = CASE WHEN TG_TABLE_NAME = 'history_conversations' THEN NEW.conversation_id ELSE NEW.message_id END
       AND deleted = false;
    IF TG_TABLE_NAME = 'history_conversations' AND actual_domain IS DISTINCT FROM 'conversation' THEN
        RAISE EXCEPTION 'invalid history conversation record';
    END IF;
    IF TG_TABLE_NAME = 'history_messages' AND actual_domain IS DISTINCT FROM 'message' THEN
        RAISE EXCEPTION 'invalid history message record';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_history_conversation_record
    BEFORE INSERT OR UPDATE OF owner_id,conversation_id
    ON conversations.history_conversations
    FOR EACH ROW EXECUTE FUNCTION conversations.validate_history_records();

CREATE TRIGGER validate_history_message_record
    BEFORE INSERT OR UPDATE OF owner_id,message_id
    ON conversations.history_messages
    FOR EACH ROW EXECUTE FUNCTION conversations.validate_history_records();

CREATE FUNCTION conversations.validate_turn_result_response() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    actual_domain text;
BEGIN
    IF NEW.response_message_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT domain INTO actual_domain
      FROM storage.record_catalog
     WHERE owner_id = NEW.owner_id AND id = NEW.response_message_id AND deleted = false;
    IF actual_domain IS DISTINCT FROM 'message' THEN
        RAISE EXCEPTION 'invalid response message record';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_turn_result_response
    BEFORE INSERT OR UPDATE OF owner_id,response_message_id
    ON conversations.turn_results
    FOR EACH ROW EXECUTE FUNCTION conversations.validate_turn_result_response();

REVOKE ALL ON conversations.history_conversations, conversations.history_messages, conversations.turn_results FROM PUBLIC;
