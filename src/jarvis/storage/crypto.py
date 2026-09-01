"""Authenticated record encryption; key custody is separate from the data store."""

import json
import os
import stat
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from jarvis.contracts import IntegrityError, Json


def canonical(value: Json) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def private_directory(path: Path) -> None:
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.is_symlink() or (os.name == "posix" and path.stat().st_mode & 0o077):
        raise IntegrityError("Directory must be private (0700) and not a symlink")


def load_key(path: Path, create: bool = False) -> bytes:
    private_directory(path.parent)
    if create:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(os.urandom(32))
            handle.flush()
            os.fsync(handle.fileno())
    if path.is_symlink() or not stat.S_ISREG(path.stat().st_mode):
        raise IntegrityError("Key must be a regular file")
    if os.name == "posix" and path.stat().st_mode & 0o077:
        raise IntegrityError("Key permissions must be 0600")
    key = path.read_bytes()
    if len(key) != 32:
        raise IntegrityError("Invalid master key length")
    return key


class Cipher:
    def __init__(self, master_key: bytes):
        self._master = master_key
        self._aead = AESGCM(self.derive(b"records-v1"))

    def derive(self, purpose: bytes) -> bytes:
        return HKDF(algorithm=hashes.SHA256(), length=32,
                    salt=b"jarvis-foundation-v1", info=purpose).derive(self._master)

    def recovery_material(self) -> bytes:
        """Composition-root access for passphrase-encrypted recovery; never a model capability."""
        return self._master

    def encrypt(self, value: Json, context: str) -> bytes:
        nonce = os.urandom(12)
        return nonce + self._aead.encrypt(nonce, canonical(value), context.encode())

    def decrypt(self, value: bytes, context: str) -> Json:
        try:
            return json.loads(self._aead.decrypt(value[:12], value[12:], context.encode()))
        except (InvalidTag, ValueError, TypeError) as exc:
            raise IntegrityError("Record authentication failed") from exc
