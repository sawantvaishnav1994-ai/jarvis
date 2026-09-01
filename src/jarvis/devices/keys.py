"""Client-held Ed25519 keys; servers receive public keys and signed challenges only."""

import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from jarvis.contracts import Denied, Json
from jarvis.storage.crypto import private_directory


def challenge_bytes(challenge: Json) -> bytes:
    return b"JARVIS-DEVICE-AUTH-v1\x00" + json.dumps(
        challenge, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


class DeviceKey:
    def __init__(self, key: Ed25519PrivateKey):
        self._key = key

    @classmethod
    def generate(cls):
        return cls(Ed25519PrivateKey.generate())

    @property
    def public_key(self) -> str:
        return self._key.public_key().public_bytes_raw().hex()

    def sign(self, challenge: Json) -> str:
        return self._key.sign(challenge_bytes(challenge)).hex()

    def save(self, path: Path, password: str) -> None:
        if not 16 <= len(password) <= 1024:
            raise Denied("Device key password must be 16–1024 characters")
        private_directory(path.parent)
        payload = self._key.private_bytes(serialization.Encoding.PEM,
                                         serialization.PrivateFormat.PKCS8,
                                         serialization.BestAvailableEncryption(password.encode()))
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
        except BaseException:
            path.unlink(missing_ok=True)
            raise

    @classmethod
    def load(cls, path: Path, password: str):
        if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
            raise Denied("Device key must be a private regular file")
        try:
            key = serialization.load_pem_private_key(path.read_bytes(), password.encode())
        except (ValueError, TypeError) as exc:
            raise Denied("Device key could not be unlocked") from exc
        if not isinstance(key, Ed25519PrivateKey):
            raise Denied("Unsupported device key")
        return cls(key)


def device_login(identity, password: str, key: DeviceKey, device_id: str = "local-device") -> str:
    challenge = identity.challenge(device_id)
    return identity.authenticate(password, device_id, challenge["id"], key.sign(challenge))
