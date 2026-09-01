# Observability foundation

API and worker expose liveness/readiness; the web process exposes `/api/health`.
API readiness includes database access, exact migration history, Redis reachability
and a worker heartbeat younger than 15 seconds. The status page renders these
checks without receiving database credentials.

Operational logs use allowlisted service/event labels, time, status, duration,
error code and trace identifiers. They exclude request bodies, prompts, tool
arguments and secret fields. Root child-process failures use fixed error codes.
HTTP responses include `x-jarvis-trace-id`; `@opentelemetry/api` exposes the tracer
boundary. No collector/exporter or full distributed trace pipeline is deployed.
Configure one only after choosing retention and metadata privacy policy.

Audit records use a separate storage contract and database role permissions.
Do not claim debug logs are an audit ledger or database-local append restrictions
are independently immutable retention. Alerting, external audit witnesses and
retention maintenance belong to J0.9.
