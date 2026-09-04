CREATE TABLE conversations.sessions (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL REFERENCES identity.root_owner(id),
    actor_id text NOT NULL,
    device_id text NOT NULL REFERENCES identity.devices(id),
    identity_session_id text NOT NULL REFERENCES identity.sessions(id),
    security_epoch bigint NOT NULL CHECK (security_epoch >= 0),
    operating_mode text NOT NULL CHECK (operating_mode IN ('assistant','copilot','autonomous','focus','private','guest','safe','emergency')),
    state text NOT NULL CHECK (state IN ('ACTIVE','REVOKED','CLOSED','CANCELLED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    cancelled_at timestamptz,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    UNIQUE(owner_id, id),
    UNIQUE(owner_id, identity_session_id, device_id)
);
CREATE INDEX conversation_sessions_owner_state_idx
    ON conversations.sessions(owner_id, state, last_seen_at DESC);

CREATE TABLE conversations.turns (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    conversation_id uuid NOT NULL,
    session_id uuid NOT NULL,
    input_message_id uuid,
    state text NOT NULL CHECK (state IN ('accepted','assembling_context','awaiting_model','streaming','awaiting_approval','executing_tool','resuming','completed','failed','cancelled')),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
    correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 128),
    reason_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    UNIQUE(owner_id, id),
    UNIQUE(owner_id, session_id, idempotency_key),
    FOREIGN KEY(owner_id, conversation_id) REFERENCES storage.record_catalog(owner_id, id),
    FOREIGN KEY(owner_id, session_id) REFERENCES conversations.sessions(owner_id, id),
    FOREIGN KEY(owner_id, input_message_id) REFERENCES storage.record_catalog(owner_id, id)
);
CREATE INDEX conversation_turns_owner_conversation_idx
    ON conversations.turns(owner_id, conversation_id, created_at);
CREATE INDEX conversation_turns_owner_state_idx
    ON conversations.turns(owner_id, state, updated_at);

CREATE FUNCTION conversations.validate_turn_records() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    conversation_domain text;
    message_domain text;
BEGIN
    SELECT domain INTO conversation_domain
      FROM storage.record_catalog
     WHERE owner_id = NEW.owner_id AND id = NEW.conversation_id AND deleted = false;
    IF conversation_domain IS DISTINCT FROM 'conversation' THEN
        RAISE EXCEPTION 'invalid conversation record';
    END IF;
    IF NEW.input_message_id IS NOT NULL THEN
        SELECT domain INTO message_domain
          FROM storage.record_catalog
         WHERE owner_id = NEW.owner_id AND id = NEW.input_message_id AND deleted = false;
        IF message_domain IS DISTINCT FROM 'message' THEN
            RAISE EXCEPTION 'invalid message record';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER turn_record_domains
    BEFORE INSERT OR UPDATE OF conversation_id,input_message_id,owner_id
    ON conversations.turns
    FOR EACH ROW EXECUTE FUNCTION conversations.validate_turn_records();

CREATE FUNCTION conversations.protect_turn_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    allowed boolean := false;
BEGIN
    IF NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION 'turn version must advance exactly once';
    END IF;
    IF NEW.owner_id <> OLD.owner_id OR NEW.conversation_id <> OLD.conversation_id
       OR NEW.session_id <> OLD.session_id OR NEW.idempotency_key <> OLD.idempotency_key
       OR NEW.correlation_id <> OLD.correlation_id THEN
        RAISE EXCEPTION 'turn authority binding is immutable';
    END IF;
    IF NEW.state = OLD.state THEN
        allowed := true;
    ELSIF OLD.state = 'accepted' AND NEW.state IN ('assembling_context','failed','cancelled') THEN
        allowed := true;
    ELSIF OLD.state = 'assembling_context' AND NEW.state IN ('awaiting_model','failed','cancelled') THEN
        allowed := true;
    ELSIF OLD.state = 'awaiting_model' AND NEW.state IN ('streaming','awaiting_approval','failed','cancelled') THEN
        allowed := true;
    ELSIF OLD.state = 'streaming' AND NEW.state IN ('completed','awaiting_approval','failed','cancelled') THEN
        allowed := true;
    ELSIF OLD.state = 'awaiting_approval' AND NEW.state IN ('executing_tool','resuming','failed','cancelled') THEN
        allowed := true;
    ELSIF OLD.state = 'executing_tool' AND NEW.state IN ('resuming','failed','cancelled') THEN
        allowed := true;
    ELSIF OLD.state = 'resuming' AND NEW.state IN ('awaiting_model','streaming','completed','failed','cancelled') THEN
        allowed := true;
    END IF;
    IF NOT allowed THEN
        RAISE EXCEPTION 'invalid turn transition';
    END IF;
    IF OLD.state IN ('completed','failed','cancelled') AND NEW.state <> OLD.state THEN
        RAISE EXCEPTION 'terminal turn is immutable';
    END IF;
    IF NEW.state IN ('completed','failed','cancelled') AND NEW.completed_at IS NULL THEN
        RAISE EXCEPTION 'terminal turn requires completed_at';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_turn_transition
    BEFORE UPDATE ON conversations.turns
    FOR EACH ROW EXECUTE FUNCTION conversations.protect_turn_transition();

REVOKE ALL ON conversations.sessions, conversations.turns FROM PUBLIC;
