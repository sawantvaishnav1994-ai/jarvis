import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { RetentionCleanupPlanSchema, RetentionChangeSchema, StorageRecordSchema } from "@jarvis/shared";
import { PrivateRecords, validateRecordRetention, validateRetentionUpdate } from "@jarvis/storage";
import type { AuthorizationV3 } from "@jarvis/security";
import { dataPolicy } from "../fixtures/data.js";

const now = Date.now();
function record() {
    return StorageRecordSchema.parse({
        version: 1, id: randomUUID(), ownerId: "owner-test", actorId: "service-test",
        domain: "conversation", revision: 1, previousRevision: null, projectId: null,
        createdAt: now - 1000, updatedAt: now - 1000, reason: "test",
        policy: dataPolicy(),
        retention: { version: 1, id: randomUUID(), revision: 1, mode: "KEEP_FOREVER",
            expiresAt: null, durationMs: null, sessionId: null },
        external: { version: 1, mode: "NEVER_EXTERNAL", providers: [], regions: [], fields: [], maximumCharacters: 0 },
        provenance: [{ kind: "owner-input", sourceId: "fixture", sourceVersion: 1,
            actorId: "owner-test", capturedAt: now, confidence: 1 }],
        sources: [], payload: { title: "Synthetic private text", participants: ["owner-test"], archived: false },
    });
}
// These helpers are additional consistency checks, not authentication or permit issuers.
function auth(overrides: Record<string, unknown> = {}): AuthorizationV3 {
    return { capability: "data.retention.modify", approvalId: "approval-test", assurance: "A3",
        zone: "Z4", environment: "development", ...overrides } as AuthorizationV3;
}
function change(previous = record()) {
    const next = structuredClone(previous);
    next.retention = { ...next.retention, revision: 2, mode: "KEEP_UNTIL_DATE", expiresAt: now + 60000 };
    next.policy.retention = { mode: "until", expiresAt: new Date(now + 60000).toISOString() };
    return { previous, next };
}
function plan() {
    const id = randomUUID();
    return { version: 1, ownerId: "owner-test", recordId: id, recordRevision: 1,
        retentionId: randomUUID(), retentionRevision: 1, expiresAt: now - 1,
        plannedAt: now, validUntil: now + 300000,
        affected: [{ id, domain: "memory", revision: 1, classification: "D3" }],
        objectIds: [], backupExpiryRequired: true };
}
it("accepts matching boundaries and an exact next retention revision", () => {
    const { previous, next } = change();
    expect(() => validateRecordRetention(previous)).not.toThrow();
    expect(() => validateRecordRetention(next)).not.toThrow();
    expect(() => validateRetentionUpdate(previous, next, auth(), now)).not.toThrow();
});
it.each([
    { capability: "data.write" }, { approvalId: null }, { assurance: "A1" },
    { zone: "Z2" }, { environment: "production" },
])("denies unapproved retention changes %#", (overrides) => {
    const { previous, next } = change();
    expect(() => validateRetentionUpdate(previous, next, auth(overrides), now))
        .toThrow("RETENTION_OWNER_APPROVAL_REQUIRED");
});
it("permits unchanged retention on an ordinary content edit", () => {
    const previous = record(), next = structuredClone(previous);
    next.payload.title = "Updated ordinary content";
    expect(() => validateRetentionUpdate(previous, next, auth({ capability: "data.write", approvalId: null }), now)).not.toThrow();
});
it("rejects expiry bypass through the other retention representation", () => {
    const v = record();
    v.policy.retention = { mode: "until", expiresAt: new Date(now - 1).toISOString() };
    expect(() => validateRecordRetention(v)).toThrow("RETENTION_BOUNDARY_MISMATCH");
});
it("rejects inconsistent NEVER_STORE and session boundaries", () => {
    const v = record();
    v.retention.mode = "NEVER_STORE";
    expect(() => validateRecordRetention(v)).toThrow("RETENTION_BOUNDARY_MISMATCH");
    v.retention.mode = "DELETE_AFTER_SESSION";
    v.retention.sessionId = "session-a";
    v.policy.retention = { mode: "session", sessionId: "session-b" };
    expect(() => validateRecordRetention(v)).toThrow("RETENTION_BOUNDARY_MISMATCH");
});
it("rejects duration or creation-time changes that reset expiry", () => {
    const { previous, next } = change();
    next.retention.mode = "KEEP_FOR_DURATION";
    next.retention.durationMs = 1;
    expect(() => validateRecordRetention(next)).toThrow("RETENTION_DURATION_MISMATCH");
    next.retention.durationMs = next.retention.expiresAt! - next.createdAt;
    expect(() => validateRecordRetention(next)).not.toThrow();
    const edited = structuredClone(previous);
    edited.createdAt++;
    expect(() => validateRetentionUpdate(previous, edited, auth(), now)).toThrow("DATA_CREATED_TIME_IMMUTABLE");
});
it("cannot extend expired content even with otherwise strong approval", () => {
    const { next: previous } = change();
    const next = structuredClone(previous);
    next.retention = { ...next.retention, mode: "KEEP_FOREVER", revision: 3, expiresAt: null };
    next.policy.retention = { mode: "keep" };
    expect(() => validateRetentionUpdate(previous, next, auth(), now + 60000)).toThrow("DATA_EXPIRED");
});
it.each(["id", "revision"] as const)("requires exact retention %s progression", (field) => {
    const { previous, next } = change();
    if (field === "id") next.retention.id = randomUUID();
    else next.retention.revision = 9;
    expect(() => validateRetentionUpdate(previous, next, auth(), now)).toThrow("RETENTION_VERSION_CONFLICT");
});
it("validates payload-free plans and strict change input", () => {
    expect(RetentionCleanupPlanSchema.parse(plan()).affected).toHaveLength(1);
    expect(() => RetentionCleanupPlanSchema.parse({ ...plan(), content: "forbidden" })).toThrow();
    expect(() => RetentionChangeSchema.parse({ version: 1, expectedRevision: 1,
        retention: record().retention, payload: { title: "unauthorized" } })).toThrow();
});
it.each(["future-expiry", "long-ttl", "duplicate", "missing-root", "secret"])(
    "rejects malformed cleanup plan: %s", (kind) => {
        const p = plan();
        if (kind === "future-expiry") p.expiresAt = now + 1;
        if (kind === "long-ttl") p.validUntil++;
        if (kind === "duplicate") p.affected.push({ ...p.affected[0]! });
        if (kind === "missing-root") p.affected[0]!.id = randomUUID();
        if (kind === "secret") p.affected[0]!.classification = "D5";
        expect(() => RetentionCleanupPlanSchema.parse(p)).toThrow();
    },
);
it.each(["changeRetention", "planRetention", "executeRetention"] as const)(
    "rejects insufficient authority before touching storage: %s", async (method) => {
        const records = new PrivateRecords(async () => { throw new Error("must not decrypt"); });
        await expect(records[method](auth({ approvalId: null }), randomUUID(), {}))
            .rejects.toThrow("RETENTION_OWNER_APPROVAL_REQUIRED");
    },
);
