# JARVIS Foundation v1 trust boundaries

Status: J0.12 qualification candidate.

| Boundary | Trusted for | Not trusted for | Authentication / authorization | Allowed data | Forbidden data / behavior | Failure posture | Compromise impact / mitigation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Root Owner | ultimate owner-controlled approvals and critical decisions | bypassing invariant enforcement | fresh owner verification, privileged-device conditions for sensitive identity actions | authorized owner data | silent second owner, self-bypass | fail closed | compromise is highest impact; device trust, fresh verification, revocation, epochs and recovery controls limit persistence |
| Trusted device | presenting device-bound proof and authorized sessions | creating owner authority itself | registered cryptographic proof plus session/passkey requirements | session-scoped authorized data | reuse after revocation/epoch invalidation | fail closed | revoke device, advance epoch, invalidate authority |
| Untrusted/candidate device | initiating bounded enrollment/auth flows | privileged action | explicit trust ceremony | minimum enrollment metadata | owner-sensitive data/action before trust | fail closed | no implicit trust |
| Guest identity | guest-scoped interaction | owner actions or owner memory | guest-specific restricted record/session | guest-authorized scope | owner/private privileged scope | fail closed | restricted permissions and no owner-sensitive delegation |
| Agent/service/integration | explicitly delegated bounded work | granting itself permissions | restricted identity/delegation plus policy | minimum task data | self-escalation, gateway bypass | fail closed | scope, expiry, budgets, audit and emergency controls |
| Tool implementation | executing a valid permitted operation | deciding whether it is authorized | Universal Tool Gateway permit validation | exact bound tool input plus secret handles where applicable | direct privileged execution, raw secrets outside executor boundary | fail closed | registry/gateway separation, one-use permit, audit/event correlation |
| Model provider | inference over approved minimized context | identity, policy, authorization, persistent ownership | provider adapter plus privacy/routing policy, not owner auth | policy-permitted minimized context | D5, unauthorized context, authority grants | fail closed on privacy/provider failure | provider is replaceable; state remains in JARVIS |
| Local model | local inference | authority | model port, same governance as external inference | locally permitted context | policy/authorization decisions by model | fail closed | local placement reduces disclosure but not governance requirements |
| Browser/web UI | presenting owner interaction and WebAuthn ceremony | server authority | server-verified session and cryptographic ceremony | UI-required data | trusting client claims without verification | fail closed | API/identity validation remains authoritative |
| API | authenticated boundary and orchestration entry | bypassing security modules | session/device/policy checks | request-scoped data | direct privileged execution without permit | fail closed | dependency readiness and governance checks |
| Worker | constrained event/background processing | new authority | event/queue contract and existing bounded worker policy | classified event metadata/payload allowed by policy | treating queue possession as permission | fail closed | idempotency, event identity, audit and emergency/shutdown controls |
| PostgreSQL/pgvector | authoritative persisted development state | plaintext secret custody outside encrypted/handle contracts | application DB credentials and schema/migration controls | allowed encrypted/classified records and operational state | NEVER_STORE/D5 general durable plaintext | not-ready/fail closed | encryption, append-only controls, backups and recovery validation |
| Redis/BullMQ | transient event transport/queue coordination | durable authority | runtime connection plus event contracts | permitted queue/event data | authority creation, prohibited plaintext | degraded/not-ready for dependent work | duplicate/idempotency controls; restart/recovery tests |
| Object/private storage | allowed classified durable objects | deciding classification | data gateway/encryption/retention controls | permitted encrypted data | prohibited plaintext/never-store | fail closed | envelope keys, deletion obligations, health controls |
| Backup media/artifact | encrypted portable recovery material | active authority until verified restore | keyed authenticity, owner/component/version checks | permitted encrypted backup state | production secret plaintext, stale authority resurrection | reject invalid restore | wrong-key/cross-owner/tamper/substitution tests |
| Recovery operator/process | performing explicitly authorized restore procedure | replacing owner or weakening restrictions | recovery key/owner binding and safe-mode rules | verified recovery components | second owner, stale sessions/delegations/approvals | fail closed | isolated restore, epoch/revocation/deletion preservation |
| Logs | operational diagnostics | secret/private data repository | application redaction conventions | non-sensitive operational metadata | protected plaintext/secrets | omit/redact | tests for protected plaintext absence |
| Audit store | accountability evidence | ordinary mutable application log | append-oriented DB controls/integrity chain | correlated metadata and permitted protected representation | silent disable, prohibited plaintext | fail closed for required evidence | tamper detection/checkpoints; independent immutable production archive remains later |
| CI environment | synthetic qualification | real owner/production secrets | repository Actions permissions and synthetic fixtures | synthetic identities/test keys | real owner data or production credentials | fail closed test gates | exact-SHA evidence; production certification not claimed |

## Boundary rules

1. Data crossing a trust boundary is minimized and classified before disclosure.
2. No data-plane component can manufacture control-plane authority.
3. Loss of a critical dependency or security material never increases capability.
4. Emergency controls override normal, model-driven and background execution.
5. Recovery re-establishes restrictions before normal capability is considered ready.
