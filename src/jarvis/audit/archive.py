"""S3 Object Lock adapter. A fake client can test contracts, never establish live protection."""

import base64
import hashlib
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from jarvis.contracts import IntegrityError


class S3ComplianceArchive:
    def __init__(self, client, bucket: str, prefix: str, account_id: str, retention_days: int):
        if (not bucket or not prefix or ".." in prefix.split("/") or not account_id.isdigit()
                or len(account_id) != 12 or type(retention_days) is not int or retention_days < 1):
            raise IntegrityError("Invalid independent archive configuration")
        self.client, self.bucket, self.prefix = client, bucket, prefix.rstrip("/")
        self.account_id, self.retention_days = account_id, retention_days
        self.protection_deadline = float("inf")
        self.identity = f"s3://{account_id}/{bucket}/{self.prefix}"
        self.verify_configuration()

    def verify_configuration(self) -> dict:
        args = {"Bucket": self.bucket, "ExpectedBucketOwner": self.account_id}
        versioning = self.client.get_bucket_versioning(**args)
        lock = self.client.get_object_lock_configuration(**args)["ObjectLockConfiguration"]
        public = self.client.get_public_access_block(**args)["PublicAccessBlockConfiguration"]
        default = lock.get("Rule", {}).get("DefaultRetention", {})
        days = default.get("Days", default.get("Years", 0) * 365)
        if (versioning.get("Status") != "Enabled" or lock.get("ObjectLockEnabled") != "Enabled"
                or default.get("Mode") != "COMPLIANCE" or days < self.retention_days
                or not all(public.get(key) is True for key in ["BlockPublicAcls", "IgnorePublicAcls",
                                                             "BlockPublicPolicy", "RestrictPublicBuckets"])):
            raise IntegrityError("Archive requires private, versioned COMPLIANCE retention")
        return {"identity": self.identity, "retention_days": self.retention_days,
                "protection": "COMPLIANCE", "versioning": "Enabled"}

    def append(self, kind: str, value: dict) -> dict:
        if kind not in {"audit", "deletions", "checkpoints"}:
            raise IntegrityError("Unsupported archive record")
        payload = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        if len(payload) > 1024 * 1024:
            raise IntegrityError("Archive record too large")
        key = f"{self.prefix}/{kind}/{uuid4()}.json"
        checksum = base64.b64encode(hashlib.sha256(payload).digest()).decode()
        # One-day margin keeps whole-day IAM minimum checks clear of clock/rounding boundaries.
        retain_until = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=self.retention_days + 1)
        result = self.client.put_object(
            Bucket=self.bucket, Key=key, ExpectedBucketOwner=self.account_id, Body=payload,
            ContentType="application/json", ChecksumSHA256=checksum, IfNoneMatch="*",
            ObjectLockMode="COMPLIANCE", ObjectLockRetainUntilDate=retain_until,
            ServerSideEncryption="AES256")
        version = result.get("VersionId")
        if not version or version == "null":
            raise IntegrityError("Archive did not acknowledge a versioned write")
        receipt = {"key": key, "version": version, "sha256": hashlib.sha256(payload).hexdigest()}
        if self._read(receipt, minimum_retention=retain_until) != value:
            raise IntegrityError("Archive readback differs from acknowledged write")
        return receipt

    def _read(self, receipt: dict, minimum_retention=None) -> dict:
        response = self.client.get_object(Bucket=self.bucket, Key=receipt["key"],
                                          VersionId=receipt["version"], ExpectedBucketOwner=self.account_id)
        body = response["Body"]
        try:
            payload = body.read(1024 * 1024 + 1)
        finally:
            body.close()
        retention = response.get("ObjectLockRetainUntilDate")
        floor = minimum_retention or datetime.now(timezone.utc)
        if (len(payload) > 1024 * 1024 or response.get("ObjectLockMode") != "COMPLIANCE"
                or not isinstance(retention, datetime) or retention < floor
                or (receipt.get("sha256") and hashlib.sha256(payload).hexdigest() != receipt["sha256"])):
            raise IntegrityError("Archived version lacks required retention or integrity")
        self.protection_deadline = min(self.protection_deadline, retention.timestamp())
        return json.loads(payload)

    def records(self, kind: str) -> list[dict]:
        if kind not in {"audit", "deletions", "checkpoints"}:
            raise IntegrityError("Unsupported archive record")
        paginator = self.client.get_paginator("list_object_versions")
        records = []
        for page in paginator.paginate(Bucket=self.bucket, Prefix=f"{self.prefix}/{kind}/",
                                       ExpectedBucketOwner=self.account_id):
            if page.get("DeleteMarkers"):
                raise IntegrityError("Archive has deletion markers; owner reconciliation required")
            for version in page.get("Versions", []):
                records.append(self._read({"key": version["Key"], "version": version["VersionId"]}))
                if len(records) > 100000:
                    raise IntegrityError("Archive exceeds this release's reconciliation budget")
        return records

    def deletion_ids(self, owner_id: str) -> set[str]:
        from uuid import UUID
        result = set()
        for entry in self.records("deletions"):
            if entry.get("owner_id") != owner_id:
                continue
            if entry.get("version") != 1 or not isinstance(entry.get("ids"), list):
                raise IntegrityError("Invalid deletion manifest")
            for item in entry["ids"]:
                result.add(str(UUID(item)))
        return result


def load_archive(config_path):
    """Explicit owner configuration; credentials come from the host SDK credential chain."""
    try:
        import boto3
        from botocore.config import Config
    except ImportError as exc:
        raise IntegrityError("Install the optional S3 dependencies before using an archive") from exc
    value = json.loads(config_path.read_text())
    if set(value) != {"bucket", "prefix", "account_id", "region", "retention_days"}:
        raise IntegrityError("Invalid archive configuration schema")
    client = boto3.client("s3", region_name=value["region"],
                          config=Config(connect_timeout=5, read_timeout=10,
                                        retries={"max_attempts": 2, "mode": "standard"}))
    return S3ComplianceArchive(client, value["bucket"], value["prefix"],
                               value["account_id"], value["retention_days"])


def synchronize_archive(home, key_file, password, device_key, device_id, archive) -> dict:
    """Explicit authenticated owner reconciliation after first enrollment or emergency offline stop."""
    from jarvis.audit.service import Audit
    from jarvis.devices.keys import device_login
    from jarvis.identity.service import Identity
    from jarvis.storage.crypto import Cipher, load_key
    from jarvis.storage.sqlite import SQLiteStore
    cipher = Cipher(load_key(key_file))
    store = SQLiteStore(home / "jarvis.db", cipher)
    try:
        configured = store.get("system", "independent-archive")
        if configured and configured["identity"] != archive.identity:
            raise IntegrityError("Cannot substitute an archive during reconciliation")
        local = Audit(store, cipher.derive(b"audit-v1"))
        local.verify()
        identity = Identity(store, local)
        device_login(identity, password, device_key, device_id)
        archive.verify_configuration()
        existing = {item["entry"]["hash"] for item in archive.records("audit")}
        count = 0
        for entry in store.ledger():
            if entry["hash"] not in existing:
                archive.append("audit", {"version": 1, "entry": entry})
                count += 1
        owner = store.get("identity", "owner")
        tombstones = [r["id"] for r in store.scan("tombstones") if r["owner_id"] == owner["owner_id"]]
        if tombstones:
            archive.append("deletions", {"version": 1, "owner_id": owner["owner_id"], "ids": tombstones})
        store.put("system", "independent-archive", {"identity": archive.identity})
        return {"archived_entries": count, "identity": archive.identity}
    finally:
        store.close()
