# J1 Core + Conversation Security Review

## Threat model

J1 introduces conversational state, context aggregation, model interaction, streaming, resumable approvals and tool-aware turns. The primary risks are authority confusion, context over-disclosure, cross-owner leakage, stale-session continuation, prompt/model injection into tools, replay/duplicate side effects, protected-data persistence, provider fallback that weakens privacy, and emergency-control bypass.

## Required controls

1. Every conversation and turn is owner scoped.
2. Device/session/security epoch is revalidated at protected transition points.
3. Conversation state never grants permissions.
4. Model output is untrusted content/proposal.
5. External disclosure passes classification/privacy preflight before every model request.
6. D5 is external-model ineligible.
7. NEVER_STORE is not durably persisted in messages, caches, audit, events or derived conversational indexes.
8. Context sources carry provenance, scope, classification and freshness.
9. Cross-owner/project retrieval fails closed.
10. Tool suggestions cannot execute directly.
11. Tool schema validation occurs before governance.
12. Policy/risk/approval/permit binding remains Foundation-owned.
13. Approval resumptions bind exact proposal/request/session/device/epoch/expiry.
14. Streaming output has no side-effect authority.
15. Cancellation cannot claim success for incomplete work.
16. Retry/idempotency prevents duplicate governed execution.
17. Provider fallback must preserve or strengthen privacy constraints.
18. Database/Redis/provider failure cannot create an alternate execution path.
19. Revocation and security-epoch advance invalidate stale conversations/continuations where authority is required.
20. FREEZE, SAFE MODE and SHUTDOWN override conversational autonomy.
21. Conversation history cannot resurrect deleted/expired protected data.
22. Audits/events use correlation metadata without prohibited plaintext.
23. UI state is untrusted and server authorization remains authoritative.
24. Guest/restricted actors cannot inherit Root Owner context or history by conversation reference alone.
25. Memory write candidates are not silently promoted to durable long-term memory.

## Prompt injection boundary

Prompt injection from user content, retrieved memory, external documents, tool results or model output is treated as data unless it is part of a trusted system/policy source. No content string can alter Root Owner identity, permission level, approval requirements, data classification, provider eligibility, emergency controls or tool-gateway enforcement.

## Privacy and minimization

Context assembly is purpose limited. J1 should prefer references/summaries where appropriate and disclose only the minimum data needed for the selected model capability. Provider selection happens after context classification so routing cannot decide privacy retroactively.

## Residual/deferred risks

J1.0 does not claim hostile-host isolation, production HSM/KMS, independent penetration testing, production provider credential custody, mobile security, voice biometric security, real connector security or physical-device A4 guarantees beyond Foundation v1's stated development scope.
