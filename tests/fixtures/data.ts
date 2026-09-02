import { randomUUID } from "node:crypto";
import type { DataPolicy } from "@jarvis/shared";
import type { EnvelopeBinding } from "@jarvis/security";
import type { MemoryRecordV2, ConversationRecord } from "@jarvis/memory";
export const dataNow = Date.now();
export function dataPolicy(): DataPolicy {
    return {
        version: 1,
        classification: "D2",
        privacy: "local-only",
        retention: { mode: "keep" },
        consent: {
            storeConversation: true,
            createMemory: false,
            projectKnowledge: false,
            keepAttachments: false,
            personalization: false,
            externalAI: false,
        },
    };
}
export function envelopeBinding(): EnvelopeBinding {
    return {
        version: 1,
        ownerId: "owner-test",
        environment: "development",
        domain: "memory",
        recordId: randomUUID(),
        recordVersion: 1,
        policy: dataPolicy(),
    };
}
export function dataMetadata() {
    return {
        id: randomUUID(),
        ownerId: "owner-test",
        projectId: null,
        recordVersion: 1,
        createdAt: new Date(dataNow).toISOString(),
        policy: dataPolicy(),
        derivedFrom: [],
        provenance: [
            {
                kind: "owner-stated" as const,
                source: {
                    kind: "conversation" as const,
                    id: "source-conversation",
                    version: 1,
                },
                capturedAt: new Date(dataNow).toISOString(),
                confidence: 1,
                verifiedAt: null,
            },
        ],
    };
}
export function memoryV2(): MemoryRecordV2 {
    const metadata = dataMetadata();
    metadata.policy.consent.createMemory = true;
    return {
        version: 2,
        metadata,
        kind: "preference",
        subject: "owner-test",
        content: "Synthetic preference",
        relationshipIds: [],
        embeddingIds: [],
    };
}
export function conversation(): ConversationRecord {
    return {
        version: 1,
        metadata: dataMetadata(),
        participantIds: ["owner-test"],
        messages: [
            {
                id: randomUUID(),
                authorId: "owner-test",
                role: "human",
                timestamp: new Date(dataNow).toISOString(),
                content: "Synthetic conversation",
                contentType: "text/plain",
                attachmentIds: [],
                modelUsed: null,
            },
        ],
    };
}
