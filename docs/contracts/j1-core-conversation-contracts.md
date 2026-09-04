# J1 Core + Conversation Contract Freeze

All J1 contracts are version 1 unless a later owner-approved migration changes them. They compose Foundation v1 contracts and do not replace them.

## Conversation
Fields: conversationId, ownerId, optional projectId, createdAt, updatedAt, retentionMode, classificationCeiling, status. Ownership is immutable except through an explicit future governed migration.

## Conversation Session
Fields: conversationId, foundationSessionId, deviceId, securityEpoch, operatingMode, createdAt, expiresAt. This object binds conversational continuity to Foundation authority but is not itself an authorization permit.

## Message
Fields: messageId, conversationId, turnId, role, content envelope/reference, classification, provenance, createdAt, retentionMode, storeEligibility. Message storage must honor NEVER_STORE and classification rules.

## Turn
Fields: turnId, conversationId, requestId, idempotencyKey, state, actor binding, correlationId, createdAt, completedAt, failure code. A turn must have exactly one terminal state: completed, failed or cancelled.

## Context Envelope
Fields: turnId, purpose, source list, disclosure target, token/size budget, classification ceiling, generatedAt. It is deterministic for the same allowed source snapshot and policy inputs.

## Context Source
Fields: sourceType, sourceId/reference, ownerId, optional projectId, provenance, classification, freshness, retention, disclosureEligibility, digest. Sources without adequate provenance or scope are excluded or explicitly marked untrusted.

## Memory Request
Fields: ownerId, optional projectId, query/purpose, allowed kinds, classification ceiling, freshness, result budget. It reuses J0.5 semantics and cannot bypass memory disclosure rules.

## Model Request / Response
Model requests use J0.6 provider-neutral semantics plus conversation correlation, purpose and disclosure metadata. Model responses contain content/tool suggestions/usage/failure metadata but no authority.

## Tool Proposal
Fields: proposalId, originating turn, tool contract/version, arguments digest, purpose, requested permission class. It must enter J0.7 governance before execution.

## Approval Continuation
Fields: turnId, proposalId, exact request digest, Foundation approval/permit references, session/device/security-epoch binding and expiry. Stale or mismatched continuations fail closed.

## Stream Event
Types include turn_started, content_delta, content_completed, approval_required, tool_started, tool_result, warning, cancelled, failed and turn_completed. Ordering is monotonic per turn. Stream events cannot authorize side effects.

## Cancellation
Cancellation is idempotent. It stops future generation/work where possible, marks the turn terminal when appropriate, and never fabricates a successful completion. Already committed governed side effects remain auditable and are not silently rolled back.

## Conversation Retention
Conversation/message retention composes J0.4/J0.5 deletion, expiry, export and NEVER_STORE semantics. Deletion cannot be defeated by replay, restore, cached context or derived conversational indexes.

## Conversation Audit
Every turn has a correlationId spanning request, context build, model call, approval wait, tool execution, persistence and terminal outcome. Audit metadata excludes protected plaintext where Foundation rules prohibit it.

## Conversation Error
Errors are structured into validation, unauthenticated, unauthorized, revoked, stale_epoch, privacy_denied, provider_unavailable, dependency_unavailable, approval_required, approval_expired, tool_failed, cancelled and internal_safe_failure classes. Failures do not silently downgrade policy or privacy.

## Compatibility rule
J1 implementations may extend optional fields only when old readers fail safely. Any change to identity, permissions, classification, model-provider authority, tool execution authority, emergency controls or NEVER_STORE semantics requires an explicit Foundation-compatible design review rather than a conversation-local override.
