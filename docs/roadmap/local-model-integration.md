# Local model integration candidate

The authenticated conversation composition root can now select a real local
Ollama adapter. It preserves the J0 identity/device/session proof, J1 context and
model orchestration, local-only privacy and text-only result boundary. It does
not permit model-chosen tools or approve actions.

Default behavior is unchanged for existing development qualification. To opt in,
add `localOllama` under `models` in a private copy of the runtime configuration:

```json
{"model":"your-installed-model:explicit-tag","port":11434,"timeoutMs":60000}
```

The model must already be installed. No model download, server provisioning or
paid resource is triggered by JARVIS or its tests. Run the Ollama server on the
same host as the API, bind loopback, set `OLLAMA_NO_CLOUD=1` and restart it. An
owner-controlled offline/egress-restricted host is required to guarantee no
external processing; a loopback address alone is not proof of locality.

Before sending conversation content, the adapter checks `/api/show` for local
GGUF metadata and rejects remote-host/model fields. It uses direct Node HTTP to
127.0.0.1, no DNS, environment proxy or redirect following. It rejects D5, secret
context, unsupported modalities, tool calls, wrong-model responses and excessive
usage. Whole-operation timeout/cancellation and 512 KiB response limits apply.
Request metadata, owner IDs and credentials are not forwarded to the model.
The provider is reported as `local-ollama`; failures do not silently return a mock
answer or fall back to an external provider. A local daemon is a trusted adapter
component, not a hostile-process containment boundary.

10 adapter tests exercise real loopback HTTP with synthetic fixture responses:
locality preflight, minimization, D5/nonlocal rejection, model identity, token
budgets, tool rejection, cloud rejection, redirects, cancellation/timeout and
response-size bounds. These prove transport behavior, not model quality or a
successful installed-model inference. Target-host inference remains required.

The web BFF now accommodates the configured local model deadline and propagates
browser cancellation. The API cancels work when the client disconnects and
revalidates the exact owner/device/session/epoch during longer local inference
and before releasing its result. Two identity tests and two authenticated HTTP
integration tests cover these paths, including revocation during inference.
The HTTP integration uses a synthetic loopback model fixture, not downloaded weights.

Protocol sources inspected 2026-09-09:
- https://docs.ollama.com/api/chat
- https://docs.ollama.com/faq
- https://raw.githubusercontent.com/ollama/ollama/main/api/types.go
