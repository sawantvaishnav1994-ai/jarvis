"""Real local crypto/process/recovery checks; S3 is explicitly a contract simulator."""

import io
import os
import signal
import sys
import tempfile
import time
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from jarvis.audit.archive import S3ComplianceArchive
from jarvis.bootstrap import open_runtime, stop_runtime
from jarvis.contracts import Denied, IntegrityError, JarvisError
from jarvis.devices.keys import DeviceKey, device_login
from jarvis.runtime.supervisor import ProcessModelExecutor, WorkerSupervisor
from jarvis.storage.portable import open_backup, seal_backup
from jarvis.storage.recovery import recover_system

PASSWORD = "synthetic-hardening-password"
NEW_PASSWORD = "synthetic-recovered-password"


class S3ContractSimulator:
    """Deterministic AWS response simulator; this does not prove deployed S3 immutability."""
    def __init__(self):
        self.versions = []
        self.mode = "COMPLIANCE"
        self.versioning = "Enabled"
        self.available = True
        self.requests = []

    def get_bucket_versioning(self, **kwargs):
        return {"Status": self.versioning}

    def get_object_lock_configuration(self, **kwargs):
        return {"ObjectLockConfiguration": {"ObjectLockEnabled": "Enabled", "Rule": {
            "DefaultRetention": {"Mode": self.mode, "Days": 30}}}}

    def get_public_access_block(self, **kwargs):
        return {"PublicAccessBlockConfiguration": {key: True for key in
                ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"]}}

    def put_object(self, **kwargs):
        if not self.available:
            raise OSError("simulated archive outage")
        self.requests.append(kwargs)
        version = str(len(self.versions) + 1)
        self.versions.append(dict(kwargs, VersionId=version))
        return {"VersionId": version}

    def get_object(self, **kwargs):
        if not self.available:
            raise OSError("simulated archive outage")
        row = next(v for v in self.versions if v["Key"] == kwargs["Key"] and v["VersionId"] == kwargs["VersionId"])
        return {"Body": io.BytesIO(row["Body"]), "ObjectLockMode": row["ObjectLockMode"],
                "ObjectLockRetainUntilDate": row["ObjectLockRetainUntilDate"]}

    def get_paginator(self, name):
        if name != "list_object_versions":
            raise AssertionError(name)
        return self

    def paginate(self, **kwargs):
        if not self.available:
            raise OSError("simulated archive outage")
        rows = [{"Key": row["Key"], "VersionId": row["VersionId"]} for row in self.versions
                if row["Key"].startswith(kwargs["Prefix"])]
        # Exercise actual pagination instead of assuming one page.
        for start in range(0, len(rows), 2):
            yield {"Versions": rows[start:start + 2]}


def archive_for(client):
    return S3ComplianceArchive(client, "test-bucket", "jarvis/test-owner", "123456789012", 30)


class HardeningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.home, self.key_file = self.base / "data", self.base / "keys/master.key"
        self.key = DeviceKey.generate()
        self.client = S3ContractSimulator()
        self.archive = archive_for(self.client)
        self.runtime = open_runtime(self.home, self.key_file, create_key=True, archive=self.archive)
        self.owner = self.runtime.identity.bootstrap(PASSWORD, device_public_key=self.key.public_key)
        self.token = device_login(self.runtime.identity, PASSWORD, self.key)
        self.runtime.policy.control(self.token, "copilot")

    def tearDown(self):
        self.runtime.close()
        self.temp.cleanup()

    def ask(self, project="alpha", text="retained owner data"):
        return self.runtime.core.ask(self.token, project, text)

    def test_password_without_device_proof_is_rejected(self):
        with self.assertRaises(Denied):
            self.runtime.identity.authenticate(PASSWORD)

    def test_wrong_device_signature_and_challenge_replay(self):
        identity = self.runtime.identity
        challenge = identity.challenge("local-device")
        with self.assertRaises(Denied):
            identity.authenticate(PASSWORD, "local-device", challenge["id"], DeviceKey.generate().sign(challenge))
        with self.assertRaises(Denied):
            identity.authenticate(PASSWORD, "local-device", challenge["id"], self.key.sign(challenge))

    def test_successful_challenge_is_single_use(self):
        identity = self.runtime.identity
        challenge = identity.challenge("local-device")
        signature = self.key.sign(challenge)
        identity.authenticate(PASSWORD, "local-device", challenge["id"], signature)
        with self.assertRaises(Denied):
            identity.authenticate(PASSWORD, "local-device", challenge["id"], signature)

    def test_expired_and_modified_challenges_are_rejected(self):
        identity = self.runtime.identity
        challenge = identity.challenge("local-device")
        altered = challenge | {"purpose": "grant-admin"}
        with self.assertRaises(Denied):
            identity.authenticate(PASSWORD, "local-device", challenge["id"], self.key.sign(altered))
        challenge = identity.challenge("local-device")
        identity.clock = lambda: time.time() + 61
        with self.assertRaises(Denied):
            identity.authenticate(PASSWORD, "local-device", challenge["id"], self.key.sign(challenge))

    def test_device_revocation_invalidates_existing_sessions(self):
        other_key = DeviceKey.generate()
        self.runtime.identity.enroll_device(self.token, "second", other_key.public_key)
        second = device_login(self.runtime.identity, PASSWORD, other_key, "second")
        self.runtime.identity.revoke_device(self.token, "second")
        with self.assertRaises(Denied):
            self.runtime.identity.resolve(second)
        with self.assertRaises(Denied):
            device_login(self.runtime.identity, PASSWORD, other_key, "second")

    def test_private_device_key_is_encrypted_and_wrong_password_fails(self):
        path = self.base / "device/device.pem"
        self.key.save(path, PASSWORD)
        self.assertIn(b"ENCRYPTED PRIVATE KEY", path.read_bytes())
        self.assertEqual(DeviceKey.load(path, PASSWORD).public_key, self.key.public_key)
        with self.assertRaises(Denied):
            DeviceKey.load(path, NEW_PASSWORD)

    def test_default_core_uses_a_separate_process(self):
        self.assertIsInstance(self.runtime.core.executor, ProcessModelExecutor)
        answer = self.ask()
        pid = self.runtime.core.executor.supervisor.last_pid
        self.assertTrue(answer["stored"])
        self.assertNotEqual(pid, os.getpid())
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)

    def test_archive_writes_pin_version_and_compliance_retention(self):
        self.ask()
        for request in self.client.requests:
            self.assertEqual(request["ObjectLockMode"], "COMPLIANCE")
            self.assertEqual(request["ExpectedBucketOwner"], "123456789012")
            self.assertEqual(request["IfNoneMatch"], "*")
            self.assertIn("ChecksumSHA256", request)
        self.assertEqual(len(self.archive.records("audit")), len(self.runtime.store.ledger()))

    def test_host_stop_terminates_worker_before_any_response_can_commit(self):
        runner = WorkerSupervisor(timeout=5, grace=0.1)
        errors = []

        class BlockingExecutor:
            def complete(inner, model, prompt, cancelled):
                return runner.run([sys.executable, "-I", "-c",
                                   "import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(60)"],
                                  {}, cancelled)

        self.runtime.core.executor = BlockingExecutor()

        def request():
            try:
                self.ask()
            except Exception as exc:
                errors.append(exc)

        thread = threading.Thread(target=request)
        thread.start()
        deadline = time.monotonic() + 2
        while runner.last_pid is None and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertIsNotNone(runner.last_pid)
        started = time.monotonic()
        stop_runtime(self.home, self.key_file)
        thread.join(timeout=3)
        self.assertFalse(thread.is_alive())
        self.assertLess(time.monotonic() - started, 3)
        self.assertTrue(errors)
        self.assertEqual(self.runtime.store.scan("conversations"), [])
        with self.assertRaises(ProcessLookupError):
            os.kill(runner.last_pid, 0)

    def test_archive_rejects_removed_retention(self):
        self.client.versions[0]["ObjectLockMode"] = "GOVERNANCE"
        with self.assertRaises(IntegrityError):
            self.runtime.audit.verify()

    def test_recovery_refuses_archive_outage_without_creating_destinations(self):
        backup = self.runtime.recovery.backup(self.token, PASSWORD)
        self.client.available = False
        with self.assertRaises(OSError):
            recover_system(backup, PASSWORD, self.base / "invalid", self.base / "bad/key",
                           NEW_PASSWORD, DeviceKey.generate(), self.base / "bad/device.pem", self.archive)
        self.assertFalse((self.base / "invalid").exists())

    def test_offline_stop_requires_explicit_owner_archive_reconciliation(self):
        from jarvis.audit.archive import synchronize_archive
        stop_runtime(self.home, self.key_file)
        with self.assertRaises(IntegrityError):
            open_runtime(self.home, self.key_file, archive=self.archive)
        result = synchronize_archive(self.home, self.key_file, PASSWORD, self.key,
                                     "local-device", self.archive)
        self.assertGreater(result["archived_entries"], 0)
        reopened = open_runtime(self.home, self.key_file, archive=self.archive)
        try:
            self.assertTrue(reopened.policy.state()["shutdown"])
        finally:
            reopened.close()

    def test_governance_or_unversioned_archive_is_rejected(self):
        for field, value in [("mode", "GOVERNANCE"), ("versioning", "Suspended")]:
            client = S3ContractSimulator()
            setattr(client, field, value)
            with self.assertRaises(IntegrityError):
                archive_for(client)

    def test_configured_archive_cannot_be_omitted(self):
        with self.assertRaises(Denied):
            open_runtime(self.home, self.key_file)

    def test_archive_failure_blocks_action_and_preserves_data_on_failed_delete(self):
        self.ask()
        self.client.available = False
        with self.assertRaises(OSError):
            self.runtime.data.delete_project(self.token, "alpha")
        self.assertEqual(len(self.runtime.store.scan("conversations")), 1)
        with self.assertRaises(OSError):
            self.ask(text="must not be committed")
        self.assertEqual(len(self.runtime.store.scan("conversations")), 1)

    def test_full_recovery_preserves_vault_owner_and_suppresses_later_deletions(self):
        self.ask("alpha", "delete this after snapshot")
        self.ask("beta", "keep this after snapshot")
        self.runtime.vault.put(self.token, "service", "RESTORE-SECRET-MARKER")
        backup = self.runtime.recovery.backup(self.token, PASSWORD)
        self.assertNotIn(b"RESTORE-SECRET-MARKER", backup)
        self.runtime.data.delete_project(self.token, "alpha")
        recovered_key = DeviceKey.generate()
        target, key = self.base / "restored", self.base / "restored-keys/master.key"
        result = recover_system(backup, PASSWORD, target, key, NEW_PASSWORD, recovered_key,
                                self.base / "restored-keys/device.pem", self.archive)
        self.assertEqual(result["owner_id"], self.owner)
        self.assertEqual(result["suppressed_deletions"], 3)
        recovered = open_runtime(target, key, archive=self.archive)
        try:
            token = device_login(recovered.identity, NEW_PASSWORD, recovered_key, result["device_id"])
            self.assertEqual(recovered.core.recall(token, "alpha"), [])
            self.assertEqual(len(recovered.core.recall(token, "beta")), 1)
            self.assertEqual(recovered.store.get("vault", "service")["secret"], "RESTORE-SECRET-MARKER")
            self.assertEqual(recovered.policy.state()["mode"], "safe")
            self.assertEqual(recovered.store.scan("approvals"), [])
            with self.assertRaises(Denied):
                device_login(recovered.identity, PASSWORD, self.key)
        finally:
            recovered.close()

    def test_recovery_requires_original_archive_and_unexpired_backup(self):
        backup = self.runtime.recovery.backup(self.token, PASSWORD)
        bundle = open_backup(backup, PASSWORD)
        for change in [{"expires_at": 0}, {"archive_identity": "s3://wrong-owner/bucket/prefix"}]:
            altered = seal_backup(bundle | change, PASSWORD)
            with self.assertRaises(Denied):
                recover_system(altered, PASSWORD, self.base / "invalid", self.base / "bad/key",
                               NEW_PASSWORD, DeviceKey.generate(), self.base / "bad/device.pem", self.archive)
            self.assertFalse((self.base / "invalid").exists())

    def test_backup_expiry_cannot_outlive_oldest_archive_protection(self):
        deadline = datetime.now(timezone.utc) + timedelta(days=1)
        self.client.versions[0]["ObjectLockRetainUntilDate"] = deadline
        bundle = open_backup(self.runtime.recovery.backup(self.token, PASSWORD), PASSWORD)
        self.assertLessEqual(bundle["expires_at"], deadline.timestamp())

    def test_legacy_device_migration_is_explicit_authenticated_and_one_time(self):
        from jarvis.audit.archive import synchronize_archive
        from jarvis.storage.recovery import migrate_legacy_device
        # Simulate the old 0.1.0 owner record, which had no cryptographic device record.
        self.runtime.store.remove("devices", "local-device")
        key = DeviceKey.generate()
        with self.assertRaises(Denied):
            migrate_legacy_device(self.home, self.key_file, NEW_PASSWORD, "migrated", key.public_key)
        self.assertEqual(self.runtime.store.scan("devices"), [])
        migrate_legacy_device(self.home, self.key_file, PASSWORD, "migrated", key.public_key)
        synchronize_archive(self.home, self.key_file, PASSWORD, key, "migrated", self.archive)
        token = device_login(self.runtime.identity, PASSWORD, key, "migrated")
        self.assertEqual(self.runtime.identity.resolve(token).owner_id, self.owner)
        with self.assertRaises(Denied):
            migrate_legacy_device(self.home, self.key_file, PASSWORD, "another", key.public_key)

    def test_invalid_recovery_audit_leaves_no_published_files(self):
        bundle = open_backup(self.runtime.recovery.backup(self.token, PASSWORD), PASSWORD)
        bundle["audit"][0]["result"] = "forged"
        with self.assertRaises(IntegrityError):
            recover_system(seal_backup(bundle, PASSWORD), PASSWORD, self.base / "invalid",
                           self.base / "bad/key", NEW_PASSWORD, DeviceKey.generate(),
                           self.base / "bad/device.pem", self.archive)
        self.assertFalse((self.base / "invalid").exists())
        self.assertFalse((self.base / "bad/key").exists())


class ProcessTerminationTests(unittest.TestCase):
    def test_sigterm_ignoring_worker_is_killed_and_reaped(self):
        runner = WorkerSupervisor(timeout=0.25, grace=0.1)
        script = "import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(60)"
        started = time.monotonic()
        with self.assertRaises(JarvisError):
            runner.run([sys.executable, "-I", "-c", script], {})
        self.assertLess(time.monotonic() - started, 3)
        self.assertEqual(runner.last_returncode, -signal.SIGKILL)
        with self.assertRaises(ProcessLookupError):
            os.kill(runner.last_pid, 0)

    def test_owner_cancellation_terminates_real_worker(self):
        runner = WorkerSupervisor(timeout=5, grace=0.1)
        started = time.monotonic()
        with self.assertRaises(Denied):
            runner.run([sys.executable, "-I", "-c", "import time; time.sleep(60)"], {},
                       lambda: time.monotonic() - started > 0.15)
        self.assertLess(time.monotonic() - started, 3)
        with self.assertRaises(ProcessLookupError):
            os.kill(runner.last_pid, 0)

    def test_descendant_cannot_continue_after_leader_exits(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "child-marker"
            runner = WorkerSupervisor(timeout=2, grace=0.1)
            # Child would create a marker after the leader's successful result.
            script = ("import os,time,json; pid=os.fork(); "
                      "\nif pid==0:\n time.sleep(0.5); open(" + repr(str(marker)) + ", 'w').write('escaped')"
                      "\nelse:\n print(json.dumps({'ok': True}))")
            self.assertEqual(runner.run([sys.executable, "-I", "-c", script], {}), {"ok": True})
            time.sleep(0.7)
            self.assertFalse(marker.exists())

    def test_output_budget_is_enforced(self):
        runner = WorkerSupervisor(timeout=2, max_output=100)
        with self.assertRaises(JarvisError):
            runner.run([sys.executable, "-I", "-c", "print('x'*1000)"], {})


if __name__ == "__main__":
    unittest.main()
