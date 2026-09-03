ALTER TABLE events.event_log
    ADD COLUMN retention_until timestamptz,
    ADD COLUMN payload_redacted_at timestamptz;

CREATE INDEX event_retention_due
    ON events.event_log(retention_until)
    WHERE payload_redacted_at IS NULL AND retention_until IS NOT NULL;
