"""The knowledge boundary exists; no fabricated graph results."""

from jarvis.contracts import Denied, Json, Principal


class PendingKnowledge:
    def related(self, principal: Principal, project: str, entity_id: str) -> list[Json]:
        raise Denied("Knowledge graph traversal is not implemented in the J0 reference slice")
