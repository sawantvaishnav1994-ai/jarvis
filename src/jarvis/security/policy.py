"""Deterministic enforcement; the model has no policy mutation capability."""

from jarvis.contracts import AuditPort, Denied, IdentityPort, Json, Mode, RecordStore, ToolSpec


class Policy:
    def __init__(self, store: RecordStore, identity: IdentityPort, audit: AuditPort):
        self.store, self.identity, self.audit = store, identity, audit

    def state(self) -> Json:
        return self.store.get("system", "control") or {
            "mode": Mode.SAFE.value, "paused": False, "frozen": False,
            "disconnected": True, "shutdown": False, "epoch": 0,
        }

    def check_request(self) -> None:
        state = self.state()
        if state["shutdown"] or state["frozen"]:
            raise Denied("Runtime is stopped")

    def check_tool(self, spec: ToolSpec, approval_valid: bool) -> None:
        self.check_request()
        state = self.state()
        if state["paused"] or state["mode"] in {
                Mode.SAFE.value, Mode.ASSISTANT.value, Mode.PRIVATE.value}:
            raise Denied("Tools are disabled in this control state")
        if state["mode"] not in {Mode.COPILOT.value, Mode.AUTONOMOUS.value}:
            raise Denied("Mode has no execution policy in this release")
        if spec.external:
            raise Denied("External connectors are not enabled")
        if spec.name != "mock.echo" or spec.version != 1 or spec.permission != 3:
            raise Denied("Tool has no approved grant")
        if state["mode"] == Mode.COPILOT.value and not approval_valid:
            raise Denied("A current, exact-action owner approval is required")

    def control(self, token: str, command: str) -> Json:
        principal = self.identity.resolve(token)
        allowed = {"pause", "freeze", "disconnect", "safe", "revoke", "shutdown",
                   "copilot", "autonomous", "assistant", "private", "resume"}
        if command not in allowed:
            raise Denied("Unsupported control")
        # Emergency controls intentionally remain usable if audit is damaged.
        emergency = command in {"pause", "freeze", "disconnect", "safe", "revoke", "shutdown"}
        with self.store.transaction():
            state = self.state()
            if command in {"copilot", "autonomous", "assistant", "private", "safe"}:
                state["mode"] = command
            if command in {"pause", "freeze", "disconnect", "shutdown"}:
                state[{"pause": "paused", "freeze": "frozen", "disconnect": "disconnected",
                       "shutdown": "shutdown"}[command]] = True
            if command == "resume":
                state.update(paused=False, frozen=False, shutdown=False, mode="safe")
            state["epoch"] += 1
            if not emergency:
                self.audit.record(principal.owner_id, "control." + command, "success")
            self.store.put("system", "control", state)
        if emergency:
            try:
                self.audit.record(principal.owner_id, "control." + command, "success")
            except Exception:
                # The independent stop still took effect. Visible state reports the audit fault.
                state["audit_fault"] = True
        if command == "revoke":
            try:
                self.identity.revoke_all(token)
            except Exception:
                state["audit_fault"] = True
        return state
