"""Composition root: the only place that chooses concrete adapters."""

from dataclasses import dataclass
from pathlib import Path

from jarvis.audit.service import Audit
from jarvis.contracts import Denied, ModelExecutor, ModelProvider, RecordStore
from jarvis.core.service import Core
from jarvis.events.service import Events
from jarvis.identity.service import Identity
from jarvis.memory.service import Conversations, Memory
from jarvis.models.mock import MockModel
from jarvis.security.policy import Policy
from jarvis.runtime.supervisor import ProcessModelExecutor
from jarvis.storage.crypto import Cipher, load_key, private_directory
from jarvis.storage.portable import DataSovereignty
from jarvis.storage.sqlite import SQLiteStore
from jarvis.storage.vault import Vault
from jarvis.storage.recovery import RecoveryService
from jarvis.tools.gateway import EchoTool, Gateway


@dataclass
class Runtime:
    store: RecordStore
    identity: Identity
    policy: Policy
    audit: Audit
    core: Core
    gateway: Gateway
    data: DataSovereignty
    vault: Vault
    recovery: RecoveryService

    def close(self) -> None:
        self.store.close()


def assemble(store: RecordStore, cipher: Cipher, model: ModelProvider | None = None,
             executor: ModelExecutor | None = None, archive=None) -> Runtime:
    configured = store.get("system", "independent-archive")
    if configured and (archive is None or configured["identity"] != archive.identity):
        raise Denied("The configured independent archive cannot be omitted or replaced")
    audit = Audit(store, cipher.derive(b"audit-v1"), archive)
    audit.verify()
    if archive and not configured:
        store.put("system", "independent-archive", {"identity": archive.identity})
    identity = Identity(store, audit)
    policy = Policy(store, identity, audit)
    memory = Memory(store)
    memory.purge_expired()
    core = Core(store, identity, policy, audit, memory, Conversations(store), Events(store),
                model if model is not None else MockModel(), executor or ProcessModelExecutor())
    gateway = Gateway(store, identity, policy, audit, [EchoTool()])
    return Runtime(store, identity, policy, audit, core, gateway,
                   DataSovereignty(store, identity, audit, archive), Vault(store, identity, audit),
                   RecoveryService(store, identity, audit, cipher.recovery_material(), archive))


def open_runtime(home: Path, key_file: Path, create_key: bool = False,
                 model: ModelProvider | None = None, executor: ModelExecutor | None = None,
                 archive=None) -> Runtime:
    if create_key and (home / "jarvis.db").exists():
        raise ValueError("Initialization requires a fresh data directory")
    if key_file.resolve().is_relative_to(home.resolve()):
        raise ValueError("Key must be outside the data directory")
    private_directory(home)
    cipher = Cipher(load_key(key_file, create=create_key))
    store = SQLiteStore(home / "jarvis.db", cipher)
    try:
        return assemble(store, cipher, model, executor, archive)
    except BaseException:
        store.close()
        raise


def stop_runtime(home: Path, key_file: Path) -> dict:
    """Host-owner control path. Does not instantiate Core, any model, or authentication audit."""
    cipher = Cipher(load_key(key_file))
    store = SQLiteStore(home / "jarvis.db", cipher)
    try:
        with store.transaction():
            state = store.get("system", "control") or {"epoch": 0}
            state.update(mode="safe", paused=True, frozen=True, disconnected=True, shutdown=True,
                         epoch=state["epoch"] + 1)
            store.put("system", "control", state)
            owner = store.get("identity", "owner")
            if owner:
                owner["session_epoch"] += 1
                store.put("identity", "owner", owner)
        try:
            Audit(store, cipher.derive(b"audit-v1")).record("host-owner", "control.stop", "success")
        except Exception:
            state["audit_fault"] = True
        return state
    finally:
        store.close()
