"""Owner/project-scoped records with independent disclosure and retention facets."""

import time
from uuid import uuid4

from jarvis.contracts import (
    MEMORY_KINDS, Denied, Json, Principal, Privacy, RecordStore, Retention,
)


class Memory:
    def __init__(self, store: RecordStore, clock=time.time):
        self.store, self.clock = store, clock

    def remember(self, principal: Principal, project: str, text: str, kind: str,
                 privacy: Privacy, retention: Retention, ttl: float | None = None) -> str | None:
        privacy, retention = Privacy(privacy), Retention(retention)
        if kind not in MEMORY_KINDS or not project or len(project) > 100:
            raise Denied("Invalid memory scope or kind")
        if not isinstance(text, str) or len(text) > 50000:
            raise Denied("Memory exceeds the permitted size")
        if retention == Retention.NEVER:
            return None
        if retention == Retention.TEMPORARY and (ttl is None or not 0 < ttl <= 86400):
            raise Denied("Temporary memory needs a bounded expiry")
        record_id = str(uuid4())
        self.store.put("memory", record_id, {
            "id": record_id, "version": 1, "owner_id": principal.owner_id,
            "project": project, "text": text, "kind": kind, "privacy": privacy.value,
            "retention": retention.value, "created_at": self.clock(),
            "expires_at": self.clock() + ttl if retention == Retention.TEMPORARY else None,
            "source": "owner-request", "epistemic_status": "owner-supplied",
        })
        return record_id

    def recall(self, principal: Principal, project: str) -> list[Json]:
        return [r for r in self.store.scan("memory") if r["owner_id"] == principal.owner_id
                and r["project"] == project and (r["expires_at"] is None
                                                or r["expires_at"] > self.clock())]

    def purge_expired(self) -> int:
        count = 0
        with self.store.transaction():
            for record in self.store.scan("memory"):
                if record["expires_at"] is not None and record["expires_at"] <= self.clock():
                    self.store.remove("memory", record["id"])
                    count += 1
        return count


class Conversations:
    def __init__(self, store: RecordStore):
        self.store = store

    def save(self, record: Json) -> None:
        self.store.put("conversations", record["id"], record)

    def list_for(self, principal: Principal, project: str) -> list[Json]:
        return [r for r in self.store.scan("conversations")
                if r["owner_id"] == principal.owner_id and r["project"] == project]
