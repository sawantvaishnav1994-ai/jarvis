"""Deterministic local test adapters. No network or provider credentials."""

from jarvis.contracts import ModelReply


class MockModel:
    local = True
    name = "mock-a"

    def complete(self, prompt: str) -> ModelReply:
        return ModelReply(text="Jarvis received: " + prompt, provider=self.name)


class AlternateMockModel:
    local = True
    name = "mock-b"

    def complete(self, prompt: str) -> ModelReply:
        return ModelReply(text="Alternate brain received: " + prompt, provider=self.name)
