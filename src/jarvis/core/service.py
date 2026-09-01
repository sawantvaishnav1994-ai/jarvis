"""Core coordinates ports only. Providers cannot hold authoritative system state."""

import time
from uuid import uuid4

from jarvis.contracts import (
    AuditPort, ConversationStore, Denied, EventPort, IdentityPort, JarvisError, Json,
    MemoryPort, ModelExecutor, ModelProvider, ModelReply, PolicyPort, Privacy, RecordStore, Retention,
)


class Core:
    def __init__(self, store: RecordStore, identity: IdentityPort, policy: PolicyPort,
                 audit: AuditPort, memory: MemoryPort, conversations: ConversationStore,
                 events: EventPort, model: ModelProvider, executor: ModelExecutor):
        self.store, self.identity, self.policy, self.audit = store, identity, policy, audit
        self.memory, self.conversations, self.events, self.model = memory, conversations, events, model
        self.executor = executor

    def ask(self, token: str, project: str, prompt: str,
            privacy: Privacy = Privacy.LOCAL_ONLY,
            retention: Retention = Retention.PERSIST) -> Json:
        principal = self.identity.resolve(token)
        request_id = str(uuid4())
        trace = {"session_id": principal.session_id, "request_id": request_id}
        privacy, retention = Privacy(privacy), Retention(retention)
        if not project or len(project) > 100 or not isinstance(prompt, str) or len(prompt) > 10000:
            raise Denied("Invalid project or request size")
        if retention == Retention.TEMPORARY:
            raise Denied("Temporary conversation retention is not enabled; use never-store")
        self.policy.check_request()
        state = self.policy.state()
        if state["mode"] in {"safe", "private"} and retention != Retention.NEVER:
            raise Denied("Safe and Private modes require never-store for conversations")
        if not self.model.local and (privacy != Privacy.AI_ALLOW or state["disconnected"]
                                     or state["mode"] in {"safe", "private"}):
            self.audit.record(principal.owner_id, "model.request", "privacy-denied", trace)
            raise Denied("Provider is ineligible for this request")
        self.audit.record(principal.owner_id, "model.request", "started", trace)
        def cancelled():
            try:
                self.identity.resolve(token)
                self.policy.check_request()
                current = self.policy.state()
                return current["epoch"] != state["epoch"] or current["paused"]
            except Denied:
                return True
        try:
            reply = self.executor.complete(self.model, prompt, cancelled)
            if not isinstance(reply, ModelReply) or not isinstance(reply.text, str):
                raise ValueError("Invalid provider response")
            if len(reply.text) > 50000 or reply.provider != self.model.name:
                raise ValueError("Invalid provider response")
        except Denied:
            self.audit.record(principal.owner_id, "model.request", "cancelled", trace)
            raise
        except Exception as exc:
            self.audit.record(principal.owner_id, "model.request", "failed", trace)
            raise JarvisError("Model request failed; no response was stored") from exc
        with self.store.transaction():
            self.identity.resolve(token)
            self.policy.check_request()
            if self.policy.state()["epoch"] != state["epoch"]:
                raise Denied("Control state changed while the model was running")
            record = {"id": request_id, "version": 1, "owner_id": principal.owner_id,
                      "project": project, "prompt": prompt, "reply": reply.text,
                      "provider": reply.provider, "privacy": privacy.value,
                      "retention": retention.value, "created_at": time.time()}
            if retention == Retention.PERSIST:
                self.conversations.save(record)
                self.memory.remember(principal, project, prompt, "conversation", privacy, retention)
                self.events.publish({"id": str(uuid4()), "version": 1,
                                     "type": "conversation.completed", "source": "jarvis.core",
                                     "occurred_at": time.time(), "correlation_id": request_id,
                                     "owner_id": principal.owner_id})
            self.audit.record(principal.owner_id, "model.request", "success", trace)
        return {"request_id": request_id, "reply": reply.text,
                "provider": reply.provider, "stored": retention == Retention.PERSIST}

    def recall(self, token: str, project: str) -> list[Json]:
        principal = self.identity.resolve(token)
        self.policy.check_request()
        self.audit.record(principal.owner_id, "memory.recall", "success")
        return self.memory.recall(principal, project)
