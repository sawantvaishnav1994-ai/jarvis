"""Encrypted whole-system recovery, bound to an independent deletion/audit authority."""

import base64
import math
import os
import secrets
import shutil
import tempfile
import time
from pathlib import Path
from uuid import UUID

from jarvis.audit.service import Audit
from jarvis.contracts import Denied, IntegrityError
from jarvis.identity.service import Identity, password_hash
from jarvis.storage.crypto import Cipher, load_key, private_directory
from jarvis.storage.portable import open_backup, seal_backup
from jarvis.storage.sqlite import SQLiteStore

NAMESPACES = {"system", "identity", "devices", "conversations", "memory", "events", "vault", "tombstones"}


class RecoveryService:
    def __init__(self, store, identity, audit, master_key: bytes, archive=None):
        self.store, self.identity, self.audit = store, identity, audit
        self._master_key, self.archive = master_key, archive

    def backup(self, token: str, passphrase: str) -> bytes:
        principal = self.identity.resolve(token)
        if self.archive is None:
            raise Denied("Full recovery requires the independent archive")
        self.archive.verify_configuration()
        with self.store.transaction():
            self.identity.resolve(token)
            self.audit.record(principal.owner_id, "recovery.backup", "success")
            head = self.audit.verify()
            records = [r for r in self.store.dump_records() if r["namespace"] in NAMESPACES
                       and not (r["namespace"] == "memory" and r["value"]["retention"] != "persist")]
            # Encryption/master material exists only inside the passphrase-encrypted package.
            bundle = {"format": "jarvis-system-recovery", "version": 1,
                      "owner_id": principal.owner_id, "created_at": time.time(),
                      "expires_at": min(time.time() + self.archive.retention_days * 86400,
                                        self.archive.protection_deadline),
                      "archive_identity": self.archive.identity,
                      "master_key": base64.b64encode(self._master_key).decode(),
                      "records": records, "audit": self.store.ledger(), "audit_head": head}
            return seal_backup(bundle, passphrase)


def recover_system(payload: bytes, passphrase: str, home: Path, key_file: Path,
                   new_password: str, new_device_key, device_key_file: Path, archive) -> dict:
    started = time.monotonic()
    bundle = open_backup(payload, passphrase)
    if (not isinstance(bundle, dict) or bundle.get("format") != "jarvis-system-recovery"
            or bundle.get("version") != 1 or archive is None
            or bundle.get("archive_identity") != archive.identity):
        raise Denied("Recovery requires the original independent archive")
    if (not isinstance(bundle.get("expires_at"), (int, float))
            or not math.isfinite(bundle["expires_at"]) or time.time() >= bundle["expires_at"]):
        raise Denied("Backup has expired under its retention policy")
    if not 16 <= len(new_password) <= 1024:
        raise Denied("Recovery password must be 16–1024 characters")
    UUID(bundle["owner_id"])
    master = base64.b64decode(bundle["master_key"], validate=True)
    if len(master) != 32 or len(bundle["records"]) > 100000:
        raise IntegrityError("Invalid system recovery package")
    for path in (home, key_file, device_key_file):
        if path.exists() or path.is_symlink():
            raise Denied("Recovery refuses to overwrite any existing destination")
    if (key_file.resolve().is_relative_to(home.resolve())
            or device_key_file.resolve().is_relative_to(home.resolve())
            or key_file.resolve() == device_key_file.resolve()):
        raise Denied("Recovery key destinations must be distinct and outside data")
    archive.verify_configuration()
    # Never trust the deletion list inside an old backup as the current truth.
    current_deletions = archive.deletion_ids(bundle["owner_id"])
    home.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".jarvis-recover-", dir=home.parent))
    store = SQLiteStore(staging / "jarvis.db", Cipher(master))
    created_files = []
    published = False
    try:
        with store.transaction():
            seen = set()
            for record in bundle["records"]:
                if (set(record) != {"namespace", "key", "value"}
                        or record["namespace"] not in NAMESPACES
                        or not isinstance(record["key"], str) or len(record["key"]) > 200
                        or not isinstance(record["value"], dict)):
                    raise IntegrityError("Invalid recovery record")
                location = (record["namespace"], record["key"])
                if location in seen:
                    raise IntegrityError("Duplicate recovery record")
                seen.add(location)
                if record["namespace"] in {"conversations", "memory", "events"} and record["key"] in current_deletions:
                    continue
                store.put(record["namespace"], record["key"], record["value"])
            owner = store.get("identity", "owner")
            if not owner or owner["owner_id"] != bundle["owner_id"]:
                raise IntegrityError("Owner does not match the recovery package")
            for entry in bundle["audit"]:
                store.append_ledger(entry)
            audit = Audit(store, Cipher(master).derive(b"audit-v1"), archive)
            if audit.verify() != bundle["audit_head"]:
                raise IntegrityError("Recovery audit checkpoint differs")
            for record_id in current_deletions:
                store.put("tombstones", record_id, {"id": record_id, "owner_id": owner["owner_id"]})
            # Recovered devices/sessions cannot silently regain authority.
            for device in store.scan("devices"):
                device.update(revoked=True, generation=device["generation"] + 1)
                store.put("devices", device["id"], device)
            salt = os.urandom(16)
            owner.update(salt=salt.hex(), verifier=password_hash(new_password, salt),
                         session_epoch=owner["session_epoch"] + 1, failures=0, locked_until=0)
            store.put("identity", "owner", owner)
            recovered_device_id = "recovered-" + secrets.token_hex(8)
            store.put("devices", recovered_device_id, {"id": recovered_device_id,
                       "owner_id": owner["owner_id"], "public_key": new_device_key.public_key,
                       "generation": 1, "revoked": False})
            control = store.get("system", "control") or {"epoch": 0}
            control.update(mode="safe", paused=False, frozen=False, disconnected=True, shutdown=False,
                           epoch=control["epoch"] + 1)
            store.put("system", "control", control)
            audit.record(owner["owner_id"], "recovery.restore", "success")
        store.close()
        store = None
        private_directory(key_file.parent)
        descriptor = os.open(key_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        created_files.append(key_file)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(master)
            handle.flush()
            os.fsync(handle.fileno())
        new_device_key.save(device_key_file, new_password)
        created_files.append(device_key_file)
        # Publish only a validated staging directory; failed validation leaves no live store.
        if home.exists():
            raise Denied("Recovery destination appeared during validation")
        staging.rename(home)
        published = True
        return {"owner_id": bundle["owner_id"], "device_id": recovered_device_id,
                "mode": "safe", "suppressed_deletions": len(current_deletions),
                "recovery_seconds": round(time.monotonic() - started, 3),
                "snapshot_created_at": bundle["created_at"]}
    finally:
        if store:
            store.close()
        if not published:
            shutil.rmtree(staging, ignore_errors=True)
            for path in created_files:
                path.unlink(missing_ok=True)


def migrate_legacy_device(home: Path, key_file: Path, password: str, device_id: str, public_key: str) -> None:
    """Explicit host-local migration only; not an alternative login path."""
    import hmac
    cipher = Cipher(load_key(key_file))
    store = SQLiteStore(home / "jarvis.db", cipher)
    try:
        with store.transaction():
            owner = store.get("identity", "owner")
            if not owner or store.scan("devices"):
                raise Denied("Only an unenrolled legacy owner can use device migration")
            if not device_id or len(device_id) > 100 or not 16 <= len(password) <= 1024:
                raise Denied("Invalid migration credentials or device ID")
            Identity._validate_public_key(public_key)
            if not hmac.compare_digest(password_hash(password, bytes.fromhex(owner["salt"])), owner["verifier"]):
                raise Denied("Migration owner password is incorrect")
            store.put("devices", device_id, {"id": device_id, "owner_id": owner["owner_id"],
                                               "public_key": public_key, "generation": 1, "revoked": False})
            owner["session_epoch"] += 1
            store.put("identity", "owner", owner)
            Audit(store, cipher.derive(b"audit-v1")).record(owner["owner_id"], "device.migrate", "success")
    finally:
        store.close()
