"""Minimal isolated reference-model worker; no Jarvis data/key/session handles."""

import ctypes
import json
import os
import resource
import signal
import sys


def main():
    parent = os.getppid()
    if parent != int(os.environ["JARVIS_SUPERVISOR_PID"]):
        raise RuntimeError("Supervisor exited before worker initialization")
    if sys.platform == "linux":
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:  # PR_SET_PDEATHSIG
            raise RuntimeError("Cannot install parent-death control")
        if os.getppid() != parent or parent == 1:
            return 1
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
    resource.setrlimit(resource.RLIMIT_FSIZE, (256000, 256000))
    value = json.loads(sys.stdin.buffer.read(100001))
    if set(value) != {"provider", "prompt"} or not isinstance(value["prompt"], str):
        return 1
    prefixes = {"mock-a": "Jarvis received: ", "mock-b": "Alternate brain received: "}
    if value["provider"] not in prefixes or len(value["prompt"]) > 10000:
        return 1
    print(json.dumps({"provider": value["provider"],
                      "text": prefixes[value["provider"]] + value["prompt"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
