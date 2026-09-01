"""Local encrypted secret records. No model-facing secret retrieval method."""

from jarvis.contracts import AuditPort, Denied, IdentityPort, RecordStore


class Vault:
    def __init__(self, store: RecordStore, identity: IdentityPort, audit: AuditPort):
        self.store, self.identity, self.audit = store, identity, audit

    def put(self, token: str, name: str, secret: str) -> None:
        principal = self.identity.resolve(token)
        if not name or len(name) > 100 or not secret or len(secret) > 10000:
            raise Denied("Invalid secret record")
        with self.store.transaction():
            self.store.put("vault", name, {"owner_id": principal.owner_id, "secret": secret})
            self.audit.record(principal.owner_id, "vault.write", "success")

    def delete(self, token: str, name: str) -> None:
        principal = self.identity.resolve(token)
        with self.store.transaction():
            self.store.remove("vault", name)
            self.audit.record(principal.owner_id, "vault.delete", "success")
