"""One local enrollment record. Cryptographic device attestation is a later gate."""

from jarvis.contracts import Principal, RecordStore


class Devices:
    def __init__(self, store: RecordStore):
        self.store = store

    def registered(self, principal: Principal) -> bool:
        device = self.store.get("devices", principal.device_id)
        return bool(device and device["owner_id"] == principal.owner_id and not device["revoked"])
