"""Version 0.1 contracts: no provider SDK, database, transport, or UI imports."""

from contextlib import AbstractContextManager
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol

Json = dict[str, Any]
CONTRACT_VERSION = 1


class JarvisError(Exception):
    """An expected, safe-to-display application failure."""


class Denied(JarvisError):
    pass


class IntegrityError(JarvisError):
    pass


class Privacy(StrEnum):
    LOCAL_ONLY = "local-only"
    PRIVATE_CLOUD = "private-cloud"
    AI_ALLOW = "ai-allow"


class Retention(StrEnum):
    PERSIST = "persist"
    TEMPORARY = "temporary"
    NEVER = "never-store"


class Mode(StrEnum):
    ASSISTANT = "assistant"
    COPILOT = "copilot"
    AUTONOMOUS = "autonomous"
    FOCUS = "focus"
    PRIVATE = "private"
    GUEST = "guest"
    SAFE = "safe"
    EMERGENCY = "emergency"


MEMORY_KINDS = frozenset({
    "working", "conversation", "personal", "preference", "project", "semantic",
    "episodic", "procedural", "relationship", "device",
})


@dataclass(frozen=True)
class Principal:
    owner_id: str
    device_id: str
    session_id: str


@dataclass(frozen=True)
class ModelReply:
    text: str
    provider: str


@dataclass(frozen=True)
class ToolSpec:
    name: str
    version: int
    permission: int
    external: bool = False


class RecordStore(Protocol):
    def transaction(self) -> AbstractContextManager[None]: ...
    def get(self, namespace: str, key: str) -> Json | None: ...
    def put(self, namespace: str, key: str, value: Json) -> None: ...
    def remove(self, namespace: str, key: str) -> None: ...
    def scan(self, namespace: str) -> list[Json]: ...
    def ledger(self) -> list[Json]: ...
    def append_ledger(self, entry: Json) -> None: ...
    def dump_records(self) -> list[Json]: ...
    def close(self) -> None: ...


class IdentityPort(Protocol):
    def challenge(self, device_id: str) -> Json: ...
    def authenticate(self, password: str, device_id: str,
                     challenge_id: str, signature: str) -> str: ...
    def resolve(self, token: str) -> Principal: ...
    def revoke_all(self, token: str) -> None: ...


class ModelProvider(Protocol):
    name: str
    local: bool
    def complete(self, prompt: str) -> ModelReply: ...


class ModelExecutor(Protocol):
    def complete(self, model: ModelProvider, prompt: str, cancelled) -> ModelReply: ...


class AuditPort(Protocol):
    def record(self, actor: str, operation: str, result: str, metadata: Json | None = None) -> None: ...
    def verify(self, checkpoint: Json | None = None) -> Json: ...


class MemoryPort(Protocol):
    def remember(self, principal: Principal, project: str, text: str, kind: str,
                 privacy: Privacy, retention: Retention, ttl: float | None = None) -> str | None: ...
    def recall(self, principal: Principal, project: str) -> list[Json]: ...


class PolicyPort(Protocol):
    def state(self) -> Json: ...
    def check_request(self) -> None: ...
    def check_tool(self, spec: ToolSpec, approval_valid: bool) -> None: ...


class ToolPort(Protocol):
    spec: ToolSpec
    def validate(self, arguments: Json) -> None: ...
    def execute(self, arguments: Json) -> Json: ...


class EventPort(Protocol):
    def publish(self, event: Json) -> bool: ...


class AgentPort(Protocol):
    def delegate(self, parent: Principal, task: Json) -> str: ...


class KnowledgePort(Protocol):
    def related(self, principal: Principal, project: str, entity_id: str) -> list[Json]: ...


class DevicePort(Protocol):
    def registered(self, principal: Principal) -> bool: ...


class GatewayPort(Protocol):
    def prepare(self, token: str, tool: str, project: str, arguments: Json) -> str: ...
    def approve(self, token: str, proposal_id: str) -> str: ...
    def execute(self, token: str, tool: str, project: str, arguments: Json,
                approval: str | None = None) -> Json: ...


class ConversationStore(Protocol):
    def save(self, record: Json) -> None: ...
    def list_for(self, principal: Principal, project: str) -> list[Json]: ...
