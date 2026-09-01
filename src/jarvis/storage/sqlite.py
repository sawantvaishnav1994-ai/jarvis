"""SQLite is one RecordStore adapter, not the canonical Jarvis data format."""

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from threading import RLock
from typing import Iterator

from jarvis.contracts import IntegrityError, Json
from jarvis.storage.crypto import Cipher, canonical, private_directory

SCHEMA_VERSION = 1


class SQLiteStore:
    def __init__(self, path: Path, cipher: Cipher):
        private_directory(path.parent)
        if path.is_symlink():
            raise IntegrityError("Database symlinks are not accepted")
        self._cipher = cipher
        self._lock = RLock()
        self._depth = 0
        self._db = sqlite3.connect(path, timeout=10, isolation_level=None, check_same_thread=False)
        os.chmod(path, 0o600)
        self._db.execute("PRAGMA foreign_keys=ON")
        self._db.execute("PRAGMA secure_delete=ON")
        self._db.execute("PRAGMA journal_mode=DELETE")
        self._db.execute("PRAGMA synchronous=FULL")
        self._migrate()
        sentinel = self.get("system", "key-check")
        if sentinel is None:
            self.put("system", "key-check", {"version": 1})

    def _migrate(self) -> None:
        version = self._db.execute("PRAGMA user_version").fetchone()[0]
        if version > SCHEMA_VERSION:
            raise IntegrityError("Database schema is newer than this runtime")
        if version == 0:
            self._db.executescript("""
                BEGIN IMMEDIATE;
                CREATE TABLE records (
                    namespace TEXT NOT NULL, key TEXT NOT NULL, value BLOB NOT NULL,
                    PRIMARY KEY(namespace, key)
                );
                CREATE TABLE audit (sequence INTEGER PRIMARY KEY, entry TEXT NOT NULL);
                CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit
                    BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
                CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit
                    BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
                PRAGMA user_version=1;
                COMMIT;
            """)

    @contextmanager
    def transaction(self) -> Iterator[None]:
        with self._lock:
            outer = self._depth == 0
            if outer:
                self._db.execute("BEGIN IMMEDIATE")
            self._depth += 1
            savepoint = f"nested_{self._depth}"
            if not outer:
                self._db.execute(f"SAVEPOINT {savepoint}")
            try:
                yield
            except BaseException:
                if outer:
                    self._db.execute("ROLLBACK")
                else:
                    self._db.execute(f"ROLLBACK TO {savepoint}")
                    self._db.execute(f"RELEASE {savepoint}")
                raise
            else:
                if outer:
                    self._db.execute("COMMIT")
                else:
                    self._db.execute(f"RELEASE {savepoint}")
            finally:
                self._depth -= 1

    def get(self, namespace: str, key: str) -> Json | None:
        with self._lock:
            row = self._db.execute("SELECT value FROM records WHERE namespace=? AND key=?",
                                   (namespace, key)).fetchone()
            return self._cipher.decrypt(row[0], f"{namespace}:{key}") if row else None

    def put(self, namespace: str, key: str, value: Json) -> None:
        payload = self._cipher.encrypt(value, f"{namespace}:{key}")
        with self._lock:
            self._db.execute("INSERT INTO records VALUES (?, ?, ?) ON CONFLICT(namespace,key) "
                             "DO UPDATE SET value=excluded.value", (namespace, key, payload))

    def remove(self, namespace: str, key: str) -> None:
        with self._lock:
            self._db.execute("DELETE FROM records WHERE namespace=? AND key=?", (namespace, key))

    def scan(self, namespace: str) -> list[Json]:
        with self._lock:
            rows = self._db.execute("SELECT key,value FROM records WHERE namespace=? ORDER BY key",
                                    (namespace,)).fetchall()
            return [self._cipher.decrypt(row[1], f"{namespace}:{row[0]}") for row in rows]

    def ledger(self) -> list[Json]:
        with self._lock:
            return [json.loads(row[0]) for row in self._db.execute(
                "SELECT entry FROM audit ORDER BY sequence").fetchall()]

    def dump_records(self) -> list[Json]:
        with self._lock:
            return [{"namespace": namespace, "key": key,
                     "value": self._cipher.decrypt(value, f"{namespace}:{key}")}
                    for namespace, key, value in self._db.execute(
                        "SELECT namespace,key,value FROM records ORDER BY namespace,key").fetchall()]

    def append_ledger(self, entry: Json) -> None:
        with self._lock:
            self._db.execute("INSERT INTO audit VALUES (?,?)",
                             (entry["sequence"], canonical(entry).decode()))

    def close(self) -> None:
        self._db.close()
