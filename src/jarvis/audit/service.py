"""Append-only, HMAC-chained local audit; independent anchoring is still required."""

import hashlib
import hmac
import json
import re
import time

from jarvis.contracts import IntegrityError, Json, RecordStore


def encoded(value: Json) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


class Audit:
    def __init__(self, store: RecordStore, key: bytes, archive=None):
        self.store, self._key = store, key
        self.archive = archive

    def verify(self, checkpoint: Json | None = None) -> Json:
        previous = "0" * 64
        entries = self.store.ledger()
        for index, raw in enumerate(entries, 1):
            entry = dict(raw)
            signature = entry.pop("hash", "")
            expected = hmac.new(self._key, encoded(entry), hashlib.sha256).hexdigest()
            if (entry.get("sequence") != index or entry.get("previous") != previous
                    or not hmac.compare_digest(signature, expected)):
                raise IntegrityError("Audit integrity check failed")
            previous = signature
        head = {"sequence": len(entries), "hash": previous}
        if self.archive:
            remote = {item["entry"]["hash"] for item in self.archive.records("audit")}
            if any(entry["hash"] not in remote for entry in entries):
                raise IntegrityError("Local audit entry has no immutable archive witness")
        if checkpoint:
            seq = checkpoint.get("sequence", -1)
            if (not isinstance(seq, int) or seq < 0 or seq > len(entries)
                    or (seq == 0 and checkpoint.get("hash") != "0" * 64)
                    or (seq > 0 and entries[seq - 1]["hash"] != checkpoint.get("hash"))):
                raise IntegrityError("Audit rollback or checkpoint mismatch")
        return head

    def record(self, actor: str, operation: str, result: str, metadata: Json | None = None) -> None:
        # Only internally assigned identifiers and short operation/status labels.
        if not all(isinstance(s, str) and re.fullmatch(r"[a-zA-Z0-9._-]{1,100}", s)
                   for s in (actor, operation, result)):
            raise IntegrityError("Unsafe audit metadata")
        metadata = dict(metadata or {})
        if (set(metadata) - {"session_id", "request_id", "tool", "tool_version"}
                or not all(isinstance(value, str) and re.fullmatch(r"[a-zA-Z0-9._-]{1,100}", value)
                           for value in metadata.values())):
            raise IntegrityError("Unapproved audit metadata field")
        with self.store.transaction():
            head = self.verify()
            entry = {"sequence": head["sequence"] + 1, "previous": head["hash"],
                     "time": time.time(), "actor": actor, "operation": operation,
                     "result": result, "version": 1, "metadata": metadata}
            entry["hash"] = hmac.new(self._key, encoded(entry), hashlib.sha256).hexdigest()
            if self.archive:
                # Keep evidence even if the surrounding local transaction later rolls back.
                self.archive.append("audit", {"version": 1, "entry": entry})
            self.store.append_ledger(entry)
