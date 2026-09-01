"""Explicit target-host acceptance probe. Writes one synthetic retained object; not run by CI."""

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from jarvis.audit.archive import load_archive


def main():
    from botocore.exceptions import ClientError
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("--write-retained-probe", action="store_true", required=True)
    args = parser.parse_args()
    archive = load_archive(args.config)
    receipt = archive.append("checkpoints", {"version": 1, "kind": "acceptance-probe", "id": str(uuid4())})
    identity = {"Bucket": archive.bucket, "Key": receipt["key"],
                "VersionId": receipt["version"], "ExpectedBucketOwner": archive.account_id}
    attempts = [
        ("delete-version", lambda: archive.client.delete_object(**identity)),
        ("shorten-retention", lambda: archive.client.put_object_retention(**identity, Retention={
            "Mode": "COMPLIANCE", "RetainUntilDate": datetime.now(timezone.utc) + timedelta(seconds=10)})),
    ]
    checks = {}
    for name, attempt in attempts:
        try:
            attempt()
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") not in {"AccessDenied", "AccessDeniedException"}:
                raise RuntimeError("Unexpected failure is not proof of enforcement") from exc
            checks[name] = "denied"
        else:
            raise RuntimeError(f"Archive acceptance FAILED: {name} was permitted")
    archive._read(receipt)
    print(json.dumps({"result": "PASS", "scope": "configured runtime principal; synthetic retained object",
                      "archive": archive.verify_configuration(), "receipt": receipt, "checks": checks}, indent=2))


if __name__ == "__main__":
    main()
