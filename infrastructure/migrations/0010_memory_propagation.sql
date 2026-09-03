-- J0.5 lifecycle/cache propagation from the canonical J0.4 deletion marker.
CREATE FUNCTION memory.propagate_catalog_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.deleted = true AND OLD.deleted = false THEN
        IF NEW.domain = 'memory' THEN
            UPDATE memory.lifecycle
               SET lifecycle='DELETED', updated_at=now()
             WHERE owner_id=NEW.owner_id AND memory_id=NEW.id
               AND lifecycle NOT IN ('DELETED','PURGED');
        END IF;
        DELETE FROM memory.context_cache
         WHERE owner_id=NEW.owner_id
           AND (NEW.id = ANY(memory_ids) OR NEW.id = ANY(graph_ids));
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER memory_catalog_deletion
AFTER UPDATE OF deleted ON storage.record_catalog
FOR EACH ROW EXECUTE FUNCTION memory.propagate_catalog_deletion();

CREATE FUNCTION memory.invalidate_expired_cache() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.lifecycle IN ('EXPIRED','DELETION_REQUESTED','DELETED','PURGED','SUPERSEDED')
       AND OLD.lifecycle IS DISTINCT FROM NEW.lifecycle THEN
        DELETE FROM memory.context_cache
         WHERE owner_id=NEW.owner_id AND NEW.memory_id = ANY(memory_ids);
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER memory_lifecycle_cache_invalidation
AFTER UPDATE OF lifecycle ON memory.lifecycle
FOR EACH ROW EXECUTE FUNCTION memory.invalidate_expired_cache();
