"""The agent boundary exists; autonomous agent execution is disabled."""

from jarvis.contracts import Denied, Json, Principal


class DisabledAgents:
    def delegate(self, parent: Principal, task: Json) -> str:
        raise Denied("Agent execution is disabled until its implementation gate passes")
