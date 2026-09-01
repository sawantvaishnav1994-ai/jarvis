"""Versioned, provider/database-independent data exchange. Credentials are excluded."""

import hashlib
import json
import math
import os
from uuid import UUID

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from jarvis.contracts import (
    MEMORY_KINDS, AuditPort, Denied, IdentityPort, IntegrityError, Json, Privacy, RecordStore,
)

DATA_NAMESPACES = ("conversations", "memory", "events")


def validate_record(namespace: str, record: Json, owner_id: str) -> None:
    common = {"id", "version", "owner_id"}
    fields = {
        "conversations": common | {"project", "prompt", "reply", "provider", "privacy",
                                    "retention", "created_at"},
        "memory": common | {"project", "text", "kind", "privacy", "retention", "created_at",
                             "expires_at", "source", "epistemic_status"},
        "events": common | {"type", "source", "occurred_at", "correlation_id"},
    }
    try:
        if not isinstance(record, dict) or set(record) != fields[namespace]:
            raise ValueError("Wrong record shape")
        UUID(record["id"])
        if record["owner_id"] != owner_id or type(record["version"]) is not int or record["version"] != 1:
            raise ValueError("Wrong owner or version")
        timestamp = record["occurred_at"] if namespace == "events" else record["created_at"]
        if type(timestamp) not in {int, float} or not math.isfinite(timestamp) or timestamp < 0:
            raise ValueError("Invalid timestamp")
        if namespace != "events":
            if not isinstance(record["project"], str) or not 1 <= len(record["project"]) <= 100:
                raise ValueError("Invalid project")
            Privacy(record["privacy"])
            if record["retention"] != "persist":
                raise ValueError("Nonportable retention")
        text_fields = ("prompt", "reply", "provider") if namespace == "conversations" else (
            "text", "source", "epistemic_status") if namespace == "memory" else ()
        if any(not isinstance(record[field], str) or len(record[field]) > 50000 for field in text_fields):
            raise ValueError("Invalid text")
        if namespace == "memory" and (record["kind"] not in MEMORY_KINDS or record["expires_at"] is not None):
            raise ValueError("Invalid memory")
        if namespace == "events":
            UUID(record["correlation_id"])
            if record["type"] != "conversation.completed" or record["source"] != "jarvis.core":
                raise ValueError("Invalid event")
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        raise Denied("Malformed export record") from exc


class DataSovereignty:
    def __init__(self, store: RecordStore, identity: IdentityPort, audit: AuditPort, archive=None):
        self.store, self.identity, self.audit = store, identity, audit
        self.archive = archive

    def export(self, token: str) -> Json:
        principal = self.identity.resolve(token)
        with self.store.transaction():
            data = {ns: [r for r in self.store.scan(ns) if r["owner_id"] == principal.owner_id
                         and (ns != "memory" or (r["retention"] == "persist"
                              and r["expires_at"] is None))] for ns in DATA_NAMESPACES}
            self.audit.record(principal.owner_id, "data.export", "success")
            return {"format": "jarvis-data", "version": 1, "owner_id": principal.owner_id,
                    "data": data, "deleted_ids": [r["id"] for r in self.store.scan("tombstones")
                                                   if r["owner_id"] == principal.owner_id]}

    def delete_project(self, token: str, project: str) -> int:
        principal = self.identity.resolve(token)
        if not project:
            raise Denied("Project is required")
        count = 0
        with self.store.transaction():
            conversations = self.store.scan("conversations")
            ids = {r["id"] for r in conversations
                   if r["owner_id"] == principal.owner_id and r["project"] == project}
            deleting = [r["id"] for namespace in DATA_NAMESPACES for r in self.store.scan(namespace)
                        if r["owner_id"] == principal.owner_id and
                        (r.get("project") == project or
                         (namespace == "events" and r["correlation_id"] in ids))]
            if self.archive and deleting:
                self.archive.append("deletions", {"version": 1, "owner_id": principal.owner_id,
                                                   "ids": sorted(deleting)})
            for namespace in DATA_NAMESPACES:
                for record in self.store.scan(namespace):
                    matched = (record.get("project") == project or
                               (namespace == "events" and record["correlation_id"] in ids))
                    if record["owner_id"] == principal.owner_id and matched:
                        self.store.remove(namespace, record["id"])
                        self.store.put("tombstones", record["id"], {
                            "id": record["id"], "owner_id": principal.owner_id})
                        count += 1
            self.audit.record(principal.owner_id, "data.delete", "success")
        return count

    def restore(self, token: str, bundle: Json) -> int:
        principal = self.identity.resolve(token)
        if (set(bundle) != {"format", "version", "owner_id", "data", "deleted_ids"}
                or bundle["format"] != "jarvis-data" or bundle["version"] != 1
                or bundle["owner_id"] != principal.owner_id
                or set(bundle["data"]) != set(DATA_NAMESPACES)):
            raise Denied("Unsupported export or different owner")
        # Validate the whole bundle before changing anything.
        for namespace, records in bundle["data"].items():
            if not isinstance(records, list) or len(records) > 10000:
                raise Denied("Invalid export records")
            for record in records:
                validate_record(namespace, record, principal.owner_id)
        try:
            for item in bundle["deleted_ids"]:
                UUID(item)
        except (ValueError, TypeError, AttributeError) as exc:
            raise Denied("Invalid deletion manifest") from exc
        count = 0
        with self.store.transaction():
            tombstones = {r["id"] for r in self.store.scan("tombstones")}
            tombstones.update(bundle["deleted_ids"])
            if self.archive:
                tombstones.update(self.archive.deletion_ids(principal.owner_id))
            for record_id in tombstones:
                self.store.put("tombstones", record_id, {"id": record_id, "owner_id": principal.owner_id})
                for namespace in DATA_NAMESPACES:
                    self.store.remove(namespace, record_id)
            for namespace, records in bundle["data"].items():
                for record in records:
                    if record["id"] in tombstones:
                        continue
                    existing = self.store.get(namespace, record["id"])
                    if existing is not None and existing != record:
                        raise Denied("Restore conflict; existing record differs")
                    if existing is None:
                        self.store.put(namespace, record["id"], record)
                        count += 1
            self.audit.record(principal.owner_id, "data.restore", "success")
        return count


def seal_backup(bundle: Json, passphrase: str) -> bytes:
    if not 16 <= len(passphrase) <= 1024:
        raise Denied("Backup passphrase must be 16–1024 characters")
    salt, nonce = os.urandom(16), os.urandom(12)
    key = hashlib.scrypt(passphrase.encode(), salt=salt, n=32768, r=8, p=1,
                         maxmem=128 * 1024 * 1024, dklen=32)
    payload = json.dumps(bundle, sort_keys=True, allow_nan=False).encode()
    return b"JARVIS01" + salt + nonce + AESGCM(key).encrypt(nonce, payload, b"jarvis-backup-v1")


def open_backup(payload: bytes, passphrase: str) -> Json:
    if (not payload.startswith(b"JARVIS01") or len(payload) < 52
            or len(payload) > 32 * 1024 * 1024 or not 16 <= len(passphrase) <= 1024):
        raise IntegrityError("Invalid backup")
    salt, nonce = payload[8:24], payload[24:36]
    key = hashlib.scrypt(passphrase.encode(), salt=salt, n=32768, r=8, p=1,
                         maxmem=128 * 1024 * 1024, dklen=32)
    try:
        return json.loads(AESGCM(key).decrypt(nonce, payload[36:], b"jarvis-backup-v1"))
    except (InvalidTag, ValueError) as exc:
        raise IntegrityError("Backup authentication failed") from exc
