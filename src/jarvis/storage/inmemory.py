"""Volatile reference adapter for contract/portability tests, not private storage."""

from contextlib import contextmanager
from copy import deepcopy
from threading import RLock
from typing import Iterator

from jarvis.contracts import Json


class InMemoryStore:
    def __init__(self):
        self._records: dict[tuple[str, str], Json] = {}
        self._ledger: list[Json] = []
        self._lock = RLock()

    @contextmanager
    def transaction(self) -> Iterator[None]:
        with self._lock:
            before = deepcopy((self._records, self._ledger))
            try:
                yield
            except BaseException:
                self._records, self._ledger = before
                raise

    def get(self, namespace: str, key: str) -> Json | None:
        return deepcopy(self._records.get((namespace, key)))

    def put(self, namespace: str, key: str, value: Json) -> None:
        self._records[namespace, key] = deepcopy(value)

    def remove(self, namespace: str, key: str) -> None:
        self._records.pop((namespace, key), None)

    def scan(self, namespace: str) -> list[Json]:
        return [deepcopy(v) for (ns, _), v in sorted(self._records.items()) if ns == namespace]

    def ledger(self) -> list[Json]:
        return deepcopy(self._ledger)

    def dump_records(self) -> list[Json]:
        return [{"namespace": ns, "key": key, "value": deepcopy(value)}
                for (ns, key), value in sorted(self._records.items())]

    def append_ledger(self, entry: Json) -> None:
        if entry["sequence"] != len(self._ledger) + 1:
            raise ValueError("Invalid ledger sequence")
        self._ledger.append(deepcopy(entry))

    def close(self) -> None:
        pass
