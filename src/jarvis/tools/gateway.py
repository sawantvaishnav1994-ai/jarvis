"""Only this gateway invokes tools; approval binds an immutable exact action."""

import hashlib
import json
import secrets
import time
from uuid import uuid4

from jarvis.contracts import (
    AuditPort, Denied, IdentityPort, Json, PolicyPort, RecordStore, ToolPort, ToolSpec,
)


class EchoTool:
    spec = ToolSpec("mock.echo", version=1, permission=3, external=False)

    def validate(self, arguments: Json) -> None:
        if (set(arguments) != {"text"} or not isinstance(arguments["text"], str)
                or len(arguments["text"]) > 1000):
            raise Denied("mock.echo accepts one text field of at most 1000 characters")

    def execute(self, arguments: Json) -> Json:
        return {"echo": arguments["text"]}


def digest(value: Json) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                    allow_nan=False).encode()).hexdigest()


class Gateway:
    def __init__(self, store: RecordStore, identity: IdentityPort, policy: PolicyPort,
                 audit: AuditPort, tools: list[ToolPort], clock=time.time):
        self.store, self.identity, self.policy = store, identity, policy
        self.audit, self.clock = audit, clock
        self._tools = {tool.spec.name: tool for tool in tools}

    def _action(self, token: str, tool: str, project: str, arguments: Json) -> Json:
        principal = self.identity.resolve(token)
        if tool not in self._tools or not project or len(project) > 100:
            raise Denied("Unknown tool or invalid project")
        self._tools[tool].validate(arguments)
        spec = self._tools[tool].spec
        return {"owner_id": principal.owner_id, "session_id": principal.session_id,
                "tool": spec.name, "version": spec.version, "permission": spec.permission,
                "project": project, "arguments": dict(arguments),
                "epoch": self.policy.state()["epoch"]}

    def prepare(self, token: str, tool: str, project: str, arguments: Json) -> str:
        action = self._action(token, tool, project, arguments)
        proposal_id = str(uuid4())
        with self.store.transaction():
            self.audit.record(action["owner_id"], "tool.prepare", "success")
            self.store.put("proposals", proposal_id, {"id": proposal_id, "action": action,
                                                       "expires_at": self.clock() + 120})
        return proposal_id

    def approve(self, token: str, proposal_id: str) -> str:
        """Trusted owner-interface operation; never exposed to models or agents."""
        principal = self.identity.resolve(token)
        with self.store.transaction():
            proposal = self.store.get("proposals", proposal_id)
            if (not proposal or proposal["expires_at"] <= self.clock()
                    or proposal["action"]["session_id"] != principal.session_id
                    or proposal["action"]["owner_id"] != principal.owner_id
                    or proposal["action"]["epoch"] != self.policy.state()["epoch"]):
                raise Denied("Proposal is expired or outside this session")
            action = proposal["action"]
            self.policy.check_tool(self._tools[action["tool"]].spec, approval_valid=True)
            token_value = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(token_value.encode()).hexdigest()
            self.store.put("approvals", token_hash, {
                "digest": digest(action), "expires_at": proposal["expires_at"],
            })
            self.store.remove("proposals", proposal_id)
            self.audit.record(principal.owner_id, "tool.approve", "success")
        return token_value

    def execute(self, token: str, tool: str, project: str, arguments: Json,
                approval: str | None = None) -> Json:
        principal = self.identity.resolve(token)
        trace = {"session_id": principal.session_id, "request_id": str(uuid4())}
        try:
            with self.store.transaction():
                action = self._action(token, tool, project, arguments)
                trace.update(tool=action["tool"], tool_version=str(action["version"]))
                approval_key = hashlib.sha256((approval or "").encode()).hexdigest()
                grant = self.store.get("approvals", approval_key) if approval else None
                valid = bool(grant and grant["expires_at"] > self.clock()
                             and grant["digest"] == digest(action))
                # Invalid submitted grants fail even if mode otherwise permits execution.
                if approval and not valid:
                    raise Denied("Approval does not match the current action")
                self.policy.check_tool(self._tools[tool].spec, approval_valid=valid)
                self.audit.record(principal.owner_id, "tool.execute", "started", trace)
                if grant:
                    self.store.remove("approvals", approval_key)
                result = self._tools[tool].execute(dict(arguments))
                self.audit.record(principal.owner_id, "tool.execute", "success", trace)
                return result
        except Denied:
            self.audit.record(principal.owner_id, "tool.execute", "denied", trace)
            raise
        except Exception:
            # Mock tools are side-effect free. Real effects need an outbox/result protocol.
            self.audit.record(principal.owner_id, "tool.execute", "failed", trace)
            raise
