import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
    DataPolicySchema,
    isDurablyStorable,
} from "@jarvis/shared";
import { permitsModelDisclosure } from "@jarvis/security";
import {
    ConversationRecordSchema,
    MemoryRecordV2Schema,
    assertRecordRetention,
} from "@jarvis/memory";
import {
    conversation,
    memoryV2,
    dataPolicy,
    dataNow,
} from "../fixtures/data.js";
it.each(["D0", "D1", "D2", "D3", "D4", "D5"] as const)(
    "classifies %s independently from retention and blocks ordinary D5 persistence",
    (classification) => {
        expect(
            isDurablyStorable({ ...dataPolicy(), classification }, dataNow),
        ).toBe(classification !== "D5");
    },
);
it("fails on absent classification/consent, invalid expiry and unknown schema fields", () => {
    const p = dataPolicy();
    for (const input of [
        { ...p, classification: undefined },
        { ...p, consent: {} },
        { ...p, unexpected: true },
        { ...p, retention: { mode: "until" } },
        { ...p, version: 99 },
    ])
        expect(() => DataPolicySchema.parse(input)).toThrow();
});
it("stores a conversation without turning its sentences into memories or attachments", () => {
    const c = conversation();
    expect(
        ConversationRecordSchema.parse(c).metadata.policy.consent.createMemory,
    ).toBe(false);
    const m = memoryV2();
    m.metadata.policy = c.metadata.policy;
    expect(() => MemoryRecordV2Schema.parse(m)).toThrow(
        "Explicit memory consent required",
    );
    c.messages[0]!.attachmentIds = [randomUUID()];
    expect(() => ConversationRecordSchema.parse(c)).toThrow(
        "Attachment retention consent required",
    );
    c.metadata.policy.consent.keepAttachments = true;
    expect(() => ConversationRecordSchema.parse(c)).not.toThrow();
});
it("requires source and uncertainty metadata and rejects self-derived memories", () => {
    const m = memoryV2();
    m.metadata.provenance[0]!.kind = "model-inferred";
    m.metadata.provenance[0]!.confidence = 0.4;
    expect(MemoryRecordV2Schema.parse(m).metadata.provenance[0]?.kind).toBe(
        "model-inferred",
    );
    m.metadata.provenance[0]!.confidence = 1.1;
    expect(() => MemoryRecordV2Schema.parse(m)).toThrow();
    m.metadata.provenance = [];
    expect(() => MemoryRecordV2Schema.parse(m)).toThrow();
    const self = memoryV2();
    self.metadata.derivedFrom = [self.metadata.id];
    expect(() => MemoryRecordV2Schema.parse(self)).toThrow(
        "Self-derived record",
    );
});
it("rejects unconsented conversations, duplicate messages and nonparticipant authors", () => {
    const c = conversation();
    c.metadata.policy.consent.storeConversation = false;
    expect(() => ConversationRecordSchema.parse(c)).toThrow();
    c.metadata.policy.consent.storeConversation = true;
    c.messages.push(c.messages[0]!);
    expect(() => ConversationRecordSchema.parse(c)).toThrow(
        "Duplicate message ID",
    );
    c.messages.pop();
    c.messages[0]!.authorId = "unrelated-identity";
    expect(() => ConversationRecordSchema.parse(c)).toThrow(
        "Message author must be a participant",
    );
});
it("denies expired, session-only, never-store and future-dated records", () => {
    const m = memoryV2().metadata;
    assertRecordRetention(m, dataNow);
    for (const retention of [
        { mode: "never-store" },
        { mode: "session", sessionId: "s1" },
        { mode: "until", expiresAt: new Date(dataNow).toISOString() },
    ] as const) {
        m.policy.retention = retention;
        expect(() => assertRecordRetention(m, dataNow)).toThrow(
            "DATA_RETENTION_DENIED",
        );
    }
    m.policy.retention = { mode: "keep" };
    m.createdAt = new Date(dataNow + 1).toISOString();
    expect(() => assertRecordRetention(m, dataNow)).toThrow(
        "DATA_RETENTION_DENIED",
    );
});
it("blocks D5 in conversation and memory contracts even when consent is supplied", () => {
    const c = conversation(),
        m = memoryV2();
    c.metadata.policy.classification = "D5";
    m.metadata.policy.classification = "D5";
    expect(() => ConversationRecordSchema.parse(c)).toThrow(
        "Secrets require the vault",
    );
    expect(() => MemoryRecordV2Schema.parse(m)).toThrow(
        "Secrets require the vault",
    );
});
it("requires explicit cloud consent, eligible class and exact provider/region allowlisting", () => {
    const p = dataPolicy(),
        destination = {
            kind: "cloud" as const,
            provider: "approved-provider",
            region: "eu-test",
        },
        allow = { providers: ["approved-provider"], regions: ["eu-test"] };
    expect(permitsModelDisclosure(p, destination, allow)).toBe(false);
    p.privacy = "ai-allow";
    expect(permitsModelDisclosure(p, destination, allow)).toBe(false);
    p.consent.externalAI = true;
    expect(permitsModelDisclosure(p, destination, allow)).toBe(true);
    expect(
        permitsModelDisclosure(p, destination, { providers: [], regions: [] }),
    ).toBe(false);
    expect(
        permitsModelDisclosure(
            p,
            { ...destination, region: "other-region" },
            allow,
        ),
    ).toBe(false);
    for (const classification of ["D3", "D4"] as const) {
        p.classification = classification;
        expect(permitsModelDisclosure(p, destination, allow)).toBe(false);
    }
    p.classification = "D5";
    p.privacy = "local-only";
    expect(permitsModelDisclosure(p, { kind: "local" }, allow)).toBe(false);
});
