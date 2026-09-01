"""Local owner authentication with client-held device proof and revocable sessions."""

import hashlib
import hmac
import os
import secrets
import time
from threading import RLock
from uuid import uuid4

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from jarvis.contracts import AuditPort, Denied, Principal, RecordStore
from jarvis.devices.keys import challenge_bytes


def password_hash(password: str, salt: bytes) -> str:
    return hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=1,
                          maxmem=128 * 1024 * 1024, dklen=32).hex()


class Identity:
    def __init__(self, store: RecordStore, audit: AuditPort, clock=time.time):
        self.store, self.audit, self.clock = store, audit, clock
        self._sessions: dict[str, tuple[Principal, float, int, int]] = {}
        self._lock = RLock()

    def bootstrap(self, password: str, device_id: str = "local-device",
                  owner_id: str | None = None, device_public_key: str | None = None) -> str:
        if not 16 <= len(password) <= 1024:
            raise Denied("Owner password must be 16–1024 characters")
        if not device_id or len(device_id) > 100:
            raise Denied("Invalid device ID")
        self._validate_public_key(device_public_key)
        with self.store.transaction():
            if self.store.get("identity", "owner"):
                raise Denied("Owner already exists")
            from uuid import UUID
            owner_id, salt = str(UUID(owner_id)) if owner_id else str(uuid4()), os.urandom(16)
            self.store.put("identity", "owner", {
                "owner_id": owner_id, "salt": salt.hex(),
                "verifier": password_hash(password, salt), "device_id": device_id,
                "failures": 0, "locked_until": 0, "session_epoch": 0,
            })
            self.store.put("devices", device_id, {
                "id": device_id, "owner_id": owner_id, "public_key": device_public_key,
                "generation": 1, "revoked": False,
            })
            self.audit.record(owner_id, "owner.bootstrap", "success")
            return owner_id

    @staticmethod
    def _validate_public_key(public_key: str | None) -> None:
        try:
            if not isinstance(public_key, str) or len(public_key) != 64:
                raise ValueError("Wrong length")
            Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key))
        except (ValueError, TypeError) as exc:
            raise Denied("A valid Ed25519 device public key is required") from exc

    def challenge(self, device_id: str) -> dict:
        with self.store.transaction():
            owner = self.store.get("identity", "owner")
            device = self.store.get("devices", device_id)
            if not owner or not device or device["revoked"]:
                raise Denied("Device is not enrolled; legacy stores require explicit migration")
            if self.clock() < owner["locked_until"]:
                raise Denied("Authentication temporarily locked")
            active = 0
            for old in self.store.scan("challenges"):
                if old["expires_at"] <= self.clock():
                    self.store.remove("challenges", old["id"])
                else:
                    active += 1
            if active >= 32:
                raise Denied("Too many pending authentication challenges")
            challenge = {"id": str(uuid4()), "purpose": "owner-login", "version": 1,
                         "nonce": secrets.token_hex(32), "owner_id": owner["owner_id"],
                         "device_id": device_id, "generation": device["generation"],
                         "session_epoch": owner["session_epoch"], "expires_at": self.clock() + 60}
            self.store.put("challenges", challenge["id"], challenge)
            return challenge

    def authenticate(self, password: str, device_id: str = "local-device",
                     challenge_id: str | None = None, signature: str | None = None) -> str:
        with self.store.transaction(), self._lock:
            owner = self.store.get("identity", "owner")
            if not owner:
                raise Denied("Owner not initialized")
            if self.clock() < owner["locked_until"]:
                raise Denied("Authentication temporarily locked")
            proof = self.store.get("challenges", challenge_id) if challenge_id else None
            device = self.store.get("devices", device_id)
            if proof:
                self.store.remove("challenges", challenge_id)
            device_valid = False
            if (proof and device and not device["revoked"] and proof["device_id"] == device_id
                    and proof["owner_id"] == owner["owner_id"] and proof["expires_at"] > self.clock()
                    and proof["generation"] == device["generation"]
                    and proof["session_epoch"] == owner["session_epoch"]):
                try:
                    Ed25519PublicKey.from_public_bytes(bytes.fromhex(device["public_key"])).verify(
                        bytes.fromhex(signature or ""), challenge_bytes(proof))
                    device_valid = True
                except (ValueError, TypeError, InvalidSignature):
                    pass
            valid = (isinstance(password, str) and len(password) <= 1024 and hmac.compare_digest(
                password_hash(password, bytes.fromhex(owner["salt"])), owner["verifier"]))
            if not valid or not device_valid:
                owner["failures"] += 1
                if owner["failures"] >= 5:
                    owner["locked_until"] = self.clock() + 60
                    owner["failures"] = 0
                self.store.put("identity", "owner", owner)
                self.audit.record("unauthenticated", "authentication", "denied")
                # Raise after commit so rate limits and denial evidence persist.
                failed = True
            else:
                owner["failures"], owner["locked_until"] = 0, 0
                self.store.put("identity", "owner", owner)
                token = secrets.token_urlsafe(32)
                principal = Principal(owner["owner_id"], device_id, str(uuid4()))
                self.audit.record(owner["owner_id"], "authentication", "success")
                failed = False
        if failed:
            raise Denied("Authentication failed")
        with self._lock:
            self._sessions[hashlib.sha256(token.encode()).hexdigest()] = (
                principal, self.clock() + 900, owner["session_epoch"], device["generation"])
        return token

    def resolve(self, token: str) -> Principal:
        if not isinstance(token, str) or len(token) > 256:
            raise Denied("Invalid session")
        # Match authenticate/revoke lock ordering, including concurrent worker cancellation.
        with self.store.transaction(), self._lock:
            owner = self.store.get("identity", "owner")
            entry = self._sessions.get(hashlib.sha256(token.encode()).hexdigest())
            if (not entry or self.clock() >= entry[1] or not owner
                    or entry[2] != owner["session_epoch"]):
                raise Denied("Invalid or expired session")
            device = self.store.get("devices", entry[0].device_id)
            if not device or device["revoked"] or device["generation"] != entry[3]:
                raise Denied("Device authorization was revoked")
            return entry[0]

    def enroll_device(self, token: str, device_id: str, public_key: str) -> None:
        principal = self.resolve(token)
        self._validate_public_key(public_key)
        if not device_id or len(device_id) > 100:
            raise Denied("Invalid device ID")
        with self.store.transaction():
            self.resolve(token)
            if self.store.get("devices", device_id):
                raise Denied("Device already exists; revoke and use a new ID")
            self.store.put("devices", device_id, {"id": device_id, "owner_id": principal.owner_id,
                                                   "public_key": public_key, "generation": 1,
                                                   "revoked": False})
            self.audit.record(principal.owner_id, "device.enroll", "success")

    def revoke_device(self, token: str, device_id: str) -> None:
        principal = self.resolve(token)
        with self.store.transaction():
            self.resolve(token)
            device = self.store.get("devices", device_id)
            if not device or device["owner_id"] != principal.owner_id:
                raise Denied("Unknown device")
            device.update(revoked=True, generation=device["generation"] + 1)
            self.store.put("devices", device_id, device)
            self.audit.record(principal.owner_id, "device.revoke", "success")

    def revoke_all(self, token: str) -> None:
        principal = self.resolve(token)
        with self.store.transaction(), self._lock:
            owner = self.store.get("identity", "owner")
            owner["session_epoch"] += 1
            self.store.put("identity", "owner", owner)
            self._sessions.clear()
        self.audit.record(principal.owner_id, "sessions.revoke", "success")
