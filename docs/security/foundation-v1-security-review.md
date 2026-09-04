# JARVIS Foundation v1 security review

Status: J0.12 qualification candidate. Acceptance is development-foundation qualification, not an independent production security certification.

## Threat model and trust assumptions

JARVIS assumes the Root Owner remains the ultimate human authority, cryptographic primitives and the host/runtime dependencies behave according to their documented interfaces, and accepted CI uses synthetic identities and credentials. Browser clients, models, agents, tools, integrations, event payloads and queue messages are not trusted to grant authority. PostgreSQL/Redis availability is required for the capabilities that depend on them; dependency loss must reduce readiness/capability rather than fail open.

## Threat review

| Threat | Current mitigation | Evidence | Residual risk / disposition |
| --- | --- | --- | --- |
| Root Owner replacement / duplicate owner | unique owner semantics, privileged sensitive identity flow, recovery owner binding | identity security/integration/browser/recovery tests | Accepted for Foundation v1 development; physical-device production ceremony remains later |
| Device compromise | independent device proof, bounded sessions, revocation, security epoch | identity tests and full browser ceremony | Device endpoint compromise remains a production endpoint-security risk |
| Session theft | device/session binding, expiry, revocation/epoch checks, fresh step-up for sensitive operations | governance + identity tests | Host/browser malware containment is not claimed |
| Approval replay | one-shot approval and permit consumption with action/session/epoch binding | governance/governed-gateway repeatability | Accepted development invariant |
| Privilege escalation | P0-P5 policy, no self/model/agent grants, deterministic authorization | governance contracts/security tests | Production connector-specific scopes remain later |
| Model manipulation / prompt injection | model output is non-authoritative; privacy preflight and Universal Tool Gateway governance | model, policy, governed-gateway tests | Semantic prompt-injection defense evolves in J1+; authority boundary is accepted |
| Tool bypass | proposal/approval/permit separation and governed gateway | gateway/governed-gateway tests and architecture boundaries | New future tools must conform to frozen gateway contract |
| Event poisoning / replay | event schemas, source/freshness checks, duplicate/idempotency controls, constrained worker | J0.8 unit/integration/queue tests | Authenticated external ingress is not claimed as a production feature |
| Audit tampering / disablement | append-oriented DB restrictions, keyed integrity chain, checkpoint verification, required control path | J0.9 tests and PG integration | Independent immutable archive/witness remains production exclusion |
| Protected plaintext leakage | classified codec, redaction, secret handles, privacy tests | J0.4/J0.9 security and integration suites | Host/process memory compromise is outside development gate |
| Backup tampering | authenticated manifest, keyed authenticity, component hashes/binding | J0.10 hardening/recovery drill | Off-site operational custody remains later |
| Cross-owner restore | owner-bound recovery validation | J0.10 adversarial tests | Accepted development invariant |
| Stale-authority restore | epochs/revocation/deletion obligations; stale session/delegation/approval clearing | recovery hardening/integration | Accepted development invariant |
| Deleted-data resurrection | deletion and backup obligations carried into restore | J0.10 recovery tests | External uncontrolled replicas are not claimed |
| Dependency failure | readiness/degraded states and failure drill | PostgreSQL/Redis outage/recovery CI | Multi-region HA is not claimed |
| Secret leakage | handles/executor boundary, encrypted storage, no real CI credentials | secret/envelope/storage tests | Production KMS/HSM custody remains later |
| Emergency-control failure | PAUSE/FREEZE/DISCONNECT/SAFE MODE/REVOKE/SHUTDOWN reduce authority | governance/recovery/shutdown acceptance | Physical kill-switch/host isolation not claimed |
| Shutdown race / orphan work | supervisor stop, new-work rejection and orphan-process verification | CI stop/check-stopped | OS hostile-process containment remains later |
| Schema tamper/future schema | migration hashes, ordered manifest, version checks and governed migrations | migration tests + real PostgreSQL | Operational release-signing remains later |

No unresolved blocking foundation-level defect was identified during the pre-change J0.12 audit; J0.12 therefore adds freeze/evidence artifacts rather than redesigning accepted runtime architecture. This conclusion remains conditional on the final exact-SHA J0.12 qualification run.

## Foundation v1 security invariants

J0.12 machine/unit acceptance binds the following 55 required invariants to the existing J0.1-J0.11 regression evidence and the freeze artifacts:

1. Root Owner cannot be silently replaced.
2. A second Root Owner cannot be silently created.
3. JARVIS cannot self-grant authority.
4. Models cannot grant authority.
5. Agents cannot grant authority.
6. Tools cannot bypass the Universal Tool Gateway.
7. Model output is not an authorization decision.
8. Sensitive actions require correct authentication/approval.
9. Approval cannot be replayed after consumption.
10. Permit cannot be reused outside its binding.
11. Expired authorization fails closed.
12. Revoked device remains revoked.
13. Revocation survives backup/restore.
14. Security epoch invalidates stale authority.
15. Deleted data is not resurrected after restore.
16. NEVER_STORE data is never persisted in prohibited stores.
17. Protected plaintext is absent from audit/log/event payloads.
18. Audit cannot be silently disabled.
19. Model/provider replacement does not replace JARVIS identity.
20. Model/provider replacement does not erase JARVIS memory/state.
21. External AI receives only allowed/minimized context.
22. Dependency failure never causes authorization fail-open.
23. Database failure does not silently permit action.
24. Redis/queue failure does not silently permit action.
25. Missing security material causes not-ready/fail-closed.
26. Future unsupported schema/version fails closed.
27. Wrong recovery key fails closed.
28. Cross-owner recovery fails closed.
29. Component-substituted backup fails closed.
30. Recovery preserves policy restrictions.
31. Recovery preserves revocations.
32. Recovery preserves deletion obligations.
33. Stale sessions are not restored to authority.
34. Stale delegations are not restored to authority.
35. Consumed approvals are not restored to authority.
36. Emergency controls override autonomous execution.
37. PAUSE stops new autonomous execution.
38. FREEZE blocks mutating activity according to policy.
39. DISCONNECT disables prohibited external connectivity.
40. SAFE MODE reduces capability rather than increasing it.
41. REVOKE immediately removes targeted authority.
42. SHUTDOWN rejects new governed work and stops background processing.
43. Shutdown does not leave orphan workers capable of action.
44. Startup does not claim ready if critical dependencies are unusable.
45. Identity recovery does not expose data-vault authority unless separately permitted.
46. Backup does not contain unapproved plaintext secrets.
47. Export remains provider-neutral.
48. Secret handles do not expose secret values.
49. Data classification cannot be silently downgraded by model/tool input.
50. Policy cannot be bypassed by direct internal method invocation.
51. Tool proposal and tool execution remain distinct.
52. Events cannot directly create privileged authority.
53. Queue replay cannot duplicate a protected side effect.
54. Audit correlation survives cross-system lifecycle.
55. Foundation configuration cannot silently override Root Owner restrictions.

## Emergency-control interpretation

PAUSE stops new autonomous/background execution while preserving inspection and owner control as allowed. FREEZE blocks mutation according to policy. DISCONNECT prevents prohibited external connectivity. SAFE MODE reduces capability. REVOKE invalidates targeted authority and relevant sessions/delegations. SHUTDOWN rejects new governed work and stops supervised background processing. None of these controls is permitted to increase effective authority.

## Development acceptance versus production certification

Foundation v1 does not claim production HSM/KMS custody, hardware-backed A4 across real physical devices, geographically separated DR, independently administered immutable audit archival, hostile-host containment, production connector credential rotation, independently managed offline backups, full production PITR, regulated compliance certification, independent penetration testing, complete mobile security or J1+ product capability. These exclusions are explicit and do not become silently satisfied by a green development CI run.
