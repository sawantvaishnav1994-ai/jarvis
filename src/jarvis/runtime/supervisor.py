"""Bounded POSIX worker lifetime with TERM/KILL escalation and process-group cleanup."""

import json
import os
import selectors
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from jarvis.contracts import Denied, JarvisError, ModelReply


class WorkerSupervisor:
    def __init__(self, timeout: float = 15, grace: float = 0.2, max_output: int = 256000):
        if not 0 < timeout <= 300 or not 0 <= grace <= 2 or not 0 < max_output <= 1048576:
            raise ValueError("Worker limits must be bounded")
        self.timeout, self.grace, self.max_output = timeout, grace, max_output
        self.last_pid = None
        self.last_returncode = None

    def _stop(self, process: subprocess.Popen) -> None:
        # The leader can exit while descendants remain; always signal its session group.
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=self.grace)
        except subprocess.TimeoutExpired:
            pass
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired as exc:
            raise JarvisError("Kernel did not confirm worker termination; supervisor escalation required") from exc
        self.last_returncode = process.returncode

    def run(self, command: list[str], payload: dict, cancelled=lambda: False) -> dict:
        if os.name != "posix":
            raise Denied("Verified worker isolation requires a POSIX host")
        content = json.dumps(payload, allow_nan=False).encode()
        if len(content) > 100000:
            raise Denied("Worker input exceeds its budget")
        if cancelled():
            raise Denied("Worker cancelled before launch")
        with tempfile.TemporaryDirectory(prefix="jarvis-worker-") as directory:
            # Pipes keep NEVER-STORE input/output out of temporary files.
            with selectors.DefaultSelector() as selector:
                process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                           stderr=subprocess.DEVNULL, cwd=directory,
                                           env={"PATH": os.defpath, "LANG": "C.UTF-8",
                                                "JARVIS_SUPERVISOR_PID": str(os.getpid())},
                                           start_new_session=True, close_fds=True)
                self.last_pid = process.pid
                deadline = time.monotonic() + self.timeout
                output = bytearray()
                offset = 0
                stopped = False
                try:
                    for stream, event in [(process.stdin, selectors.EVENT_WRITE),
                                          (process.stdout, selectors.EVENT_READ)]:
                        os.set_blocking(stream.fileno(), False)
                        selector.register(stream, event)
                    while selector.get_map() or process.poll() is None:
                        if cancelled():
                            raise Denied("Worker cancelled by owner control")
                        if time.monotonic() >= deadline:
                            raise JarvisError("Worker exceeded its deadline")
                        if process.poll() is not None and not stopped:
                            # A child must not keep an inherited output pipe alive.
                            self._stop(process)
                            stopped = True
                        for key, event in selector.select(timeout=0.02):
                            stream = key.fileobj
                            if event & selectors.EVENT_WRITE:
                                try:
                                    offset += os.write(stream.fileno(), content[offset:offset + 65536])
                                except BrokenPipeError:
                                    offset = len(content)
                                if offset == len(content):
                                    selector.unregister(stream)
                                    stream.close()
                            else:
                                chunk = os.read(stream.fileno(), 65536)
                                if not chunk:
                                    selector.unregister(stream)
                                    stream.close()
                                else:
                                    output.extend(chunk)
                                    if len(output) > self.max_output:
                                        raise JarvisError("Worker exceeded its output budget")
                    if cancelled():
                        raise Denied("Worker cancelled before result acceptance")
                    if process.returncode != 0:
                        raise JarvisError("Worker failed")
                    parsed = json.loads(output)
                    if not isinstance(parsed, dict):
                        raise JarvisError("Invalid worker output")
                    return parsed
                finally:
                    self._stop(process)
                    process.stdin.close()
                    process.stdout.close()


class ProcessModelExecutor:
    def __init__(self, supervisor: WorkerSupervisor | None = None):
        self.supervisor = supervisor or WorkerSupervisor()

    def complete(self, model, prompt: str, cancelled) -> ModelReply:
        # Registry is host-owned. Input cannot supply an import path or executable.
        if model.name not in {"mock-a", "mock-b"} or not model.local:
            raise Denied("Model has no registered isolated worker")
        worker = str(Path(__file__).with_name("worker.py").resolve())
        result = self.supervisor.run([sys.executable, "-I", worker],
                                     {"provider": model.name, "prompt": prompt}, cancelled)
        if set(result) != {"provider", "text"}:
            raise JarvisError("Invalid worker reply schema")
        return ModelReply(result["text"], result["provider"])
