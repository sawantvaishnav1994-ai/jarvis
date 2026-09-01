"""Local durable event ledger with duplicate rejection; no untrusted webhook ingress."""

import time
from uuid import UUID

from jarvis.contracts import Denied, Json, RecordStore


class Events:
    def __init__(self, store: RecordStore, clock=time.time):
        self.store, self.clock = store, clock

    def publish(self, event: Json) -> bool:
        required = {"id", "version", "type", "source", "occurred_at", "correlation_id", "owner_id"}
        if set(event) != required or event["version"] != 1:
            raise Denied("Unsupported event schema")
        try:
            UUID(event["id"])
            UUID(event["correlation_id"])
            UUID(event["owner_id"])
            age = self.clock() - event["occurred_at"]
        except (ValueError, TypeError, AttributeError) as exc:
            raise Denied("Invalid event envelope") from exc
        if (not -5 <= age <= 300 or event["source"] != "jarvis.core"
                or event["type"] != "conversation.completed"):
            raise Denied("Untrusted or stale event")
        with self.store.transaction():
            if self.store.get("events", event["id"]):
                return False
            self.store.put("events", event["id"], event)
            return True
