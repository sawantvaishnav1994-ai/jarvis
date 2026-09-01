"""Local command interface. Passwords and request text are not command-line arguments."""

import argparse
import getpass
import json
import os
import tempfile
from pathlib import Path

from jarvis.bootstrap import open_runtime, stop_runtime
from jarvis.contracts import JarvisError, Retention
from jarvis.devices.keys import DeviceKey, device_login
from jarvis.models.mock import AlternateMockModel, MockModel
from jarvis.storage.portable import open_backup, seal_backup
from jarvis.storage.recovery import migrate_legacy_device, recover_system


def output(value) -> None:
    print(json.dumps(value, indent=2))


def write_private(path: Path, payload: bytes) -> None:
    # Never replace an existing export; the owner selects a new destination.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())


def demo() -> dict:
    password = "synthetic-demo-password-only"
    with tempfile.TemporaryDirectory(prefix="jarvis-demo-") as directory:
        base = Path(directory)
        runtime = open_runtime(base / "data", base / "keys" / "master.key", create_key=True)
        try:
            device_key = DeviceKey.generate()
            runtime.identity.bootstrap(password, device_public_key=device_key.public_key)
            token = device_login(runtime.identity, password, device_key)
            runtime.policy.control(token, "copilot")
            first = runtime.core.ask(token, "demo", "Remember the Jarvis foundation")
            arguments = {"text": "harmless mock operation"}
            proposal = runtime.gateway.prepare(token, "mock.echo", "demo", arguments)
            approval = runtime.gateway.approve(token, proposal)
            tool = runtime.gateway.execute(token, "mock.echo", "demo", arguments, approval)
            runtime.core.model = AlternateMockModel()
            second = runtime.core.ask(token, "demo", "Use the alternate brain")
            remembered = len(runtime.core.recall(token, "demo"))
            bundle = runtime.data.export(token)
            sealed = seal_backup(bundle, password)
            backup_ok = open_backup(sealed, password) == bundle
            deleted = runtime.data.delete_project(token, "demo")
            restored = runtime.data.restore(token, bundle)
            return {"result": "PASS", "providers": [first["provider"], second["provider"]],
                    "memories_before_delete": remembered, "tool_result": tool,
                    "encrypted_backup_roundtrip": backup_ok, "deleted_records": deleted,
                    "deleted_records_resurrected": restored,
                    "audit_entries": runtime.audit.verify()["sequence"],
                    "scope": "Synthetic local reference slice; Foundation v1 GO remains blocked"}
        finally:
            runtime.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="JARVIS J0 local reference foundation")
    parser.add_argument("--home", type=Path, default=Path.home() / ".local/share/jarvis")
    parser.add_argument("--key-file", type=Path, default=Path.home() / ".config/jarvis/master.key")
    parser.add_argument("--device-key", type=Path)
    parser.add_argument("--device-id", default="local-device")
    parser.add_argument("--archive-config", type=Path)
    parser.add_argument("--provider", choices=["mock-a", "mock-b"], default="mock-a")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    sub.add_parser("demo")
    sub.add_parser("status")
    sub.add_parser("audit")
    sub.add_parser("stop")
    sub.add_parser("archive-verify")
    sub.add_parser("archive-sync")
    sub.add_parser("audit-archive")
    sub.add_parser("migrate-device")
    control = sub.add_parser("control")
    control.add_argument("action", choices=["pause", "freeze", "disconnect", "safe", "revoke",
                                           "shutdown", "resume", "copilot", "autonomous",
                                           "assistant", "private"])
    for command in ["ask", "recall", "tool", "delete"]:
        child = sub.add_parser(command)
        child.add_argument("--project", default="jarvis")
        if command == "ask":
            child.add_argument("--never-store", action="store_true")
    for command in ["export", "backup", "restore", "recover", "full-backup", "full-recover"]:
        child = sub.add_parser(command)
        child.add_argument("path", type=Path)
    args = parser.parse_args()
    runtime = None
    try:
        if args.command == "demo":
            output(demo())
            return
        if args.command == "stop":
            output(stop_runtime(args.home, args.key_file))
            return
        archive = None
        if args.archive_config:
            from jarvis.audit.archive import load_archive
            archive = load_archive(args.archive_config)
        if args.command == "archive-verify":
            if archive is None:
                raise JarvisError("An archive configuration is required")
            output(archive.verify_configuration())
            return
        if args.command == "full-recover":
            passphrase = getpass.getpass("System backup passphrase: ")
            password = getpass.getpass("New owner/device password: ")
            if password != getpass.getpass("Confirm new password: "):
                raise JarvisError("Passwords do not match")
            output(recover_system(args.path.read_bytes(), passphrase, args.home, args.key_file,
                                  password, DeviceKey.generate(),
                                  args.device_key or args.key_file.parent / "device.pem", archive))
            return
        if args.command == "migrate-device":
            password = getpass.getpass("Legacy owner password: ")
            device_key = DeviceKey.generate()
            destination = args.device_key or args.key_file.parent / "device.pem"
            device_key.save(destination, password)
            try:
                migrate_legacy_device(args.home, args.key_file, password, args.device_id, device_key.public_key)
            except BaseException:
                destination.unlink(missing_ok=True)
                raise
            output({"device_id": args.device_id, "migrated": True})
            return
        if args.command == "archive-sync":
            from jarvis.audit.archive import synchronize_archive
            if archive is None:
                raise JarvisError("An archive configuration is required")
            password = getpass.getpass("Owner/device password: ")
            device_key = DeviceKey.load(args.device_key or args.key_file.parent / "device.pem", password)
            output(synchronize_archive(args.home, args.key_file, password, device_key, args.device_id, archive))
            return
        initial = args.command in {"init", "recover"}
        bundle = None
        if args.command == "recover":
            bundle = open_backup(args.path.read_bytes(), getpass.getpass("Backup passphrase: "))
        password = getpass.getpass("New owner password: " if initial else "Owner password: ")
        if initial and not 16 <= len(password) <= 1024:
            raise JarvisError("Owner password must be 16–1024 characters")
        if initial and password != getpass.getpass("Confirm new owner password: "):
            raise JarvisError("Passwords do not match")
        if initial:
            destination = args.device_key or args.key_file.parent / "device.pem"
            if destination.exists() or destination.is_symlink():
                raise JarvisError("Initialization requires a fresh device-key path")
            if destination.resolve().is_relative_to(args.home.resolve()):
                raise JarvisError("Device key must be outside the data directory")
        model = MockModel() if args.provider == "mock-a" else AlternateMockModel()
        runtime = open_runtime(args.home, args.key_file, create_key=initial, model=model, archive=archive)
        if initial:
            device_key = DeviceKey.generate()
            device_key.save(args.device_key or args.key_file.parent / "device.pem", password)
            owner_id = runtime.identity.bootstrap(password, args.device_id,
                                                  owner_id=bundle["owner_id"] if bundle else None,
                                                  device_public_key=device_key.public_key)
            token = device_login(runtime.identity, password, device_key, args.device_id)
            if bundle:
                runtime.data.restore(token, bundle)
            output({"owner_id": owner_id, "mode": "safe", "initialized": True})
            return
        device_key = DeviceKey.load(args.device_key or args.key_file.parent / "device.pem", password)
        token = device_login(runtime.identity, password, device_key, args.device_id)
        if args.command == "status":
            output(runtime.policy.state())
        elif args.command == "audit":
            output(runtime.audit.verify())
        elif args.command == "audit-archive":
            if archive is None:
                raise JarvisError("An archive configuration is required")
            output(archive.records("audit"))
        elif args.command == "control":
            output(runtime.policy.control(token, args.action))
        elif args.command == "ask":
            prompt = input("Request: ")
            output(runtime.core.ask(token, args.project, prompt,
                                   retention=Retention.NEVER if args.never_store else Retention.PERSIST))
        elif args.command == "recall":
            output(runtime.core.recall(token, args.project))
        elif args.command == "tool":
            arguments = {"text": input("Text for mock.echo: ")}
            proposal = runtime.gateway.prepare(token, "mock.echo", args.project, arguments)
            output({"tool": "mock.echo", "project": args.project, "arguments": arguments})
            if input("Type APPROVE to execute this exact mock operation: ") != "APPROVE":
                raise JarvisError("Operation not approved")
            approval = runtime.gateway.approve(token, proposal)
            output(runtime.gateway.execute(token, "mock.echo", args.project, arguments, approval))
        elif args.command == "delete":
            if input(f"Type DELETE to delete retained project data for {args.project}: ") != "DELETE":
                raise JarvisError("Deletion not confirmed")
            output({"deleted_records": runtime.data.delete_project(token, args.project)})
        elif args.command == "export":
            write_private(args.path, json.dumps(runtime.data.export(token), indent=2).encode())
            output({"exported": str(args.path), "encrypted": False})
        elif args.command in {"backup", "full-backup"}:
            passphrase = getpass.getpass("New backup passphrase: ")
            if passphrase != getpass.getpass("Confirm backup passphrase: "):
                raise JarvisError("Backup passphrases do not match")
            content = (runtime.recovery.backup(token, passphrase) if args.command == "full-backup"
                       else seal_backup(runtime.data.export(token), passphrase))
            write_private(args.path, content)
            output({"backup": str(args.path), "encrypted": True})
        elif args.command == "restore":
            bundle = open_backup(args.path.read_bytes(), getpass.getpass("Backup passphrase: "))
            output({"restored": runtime.data.restore(token, bundle)})
    except (JarvisError, ValueError, OSError, KeyError) as exc:
        # Internal/provider tracebacks are never part of normal CLI error output.
        parser.exit(1, f"Jarvis could not complete this operation ({type(exc).__name__}).\n")
    finally:
        if runtime:
            runtime.close()


if __name__ == "__main__":
    main()
