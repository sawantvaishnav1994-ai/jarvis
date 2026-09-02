import { z } from "zod";
import {
    EnvironmentSchema,
    IdentifierSchema,
    BoundaryError,
    type Environment,
} from "@jarvis/shared";
import {
    MemoryRecordV2Schema,
    ConversationRecordSchema,
    assertRecordRetention,
} from "@jarvis/memory";
import {
    EnvelopeCipher,
    EnvelopeBindingSchema,
    EncryptedEnvelopeSchema,
    immutableJson,
    policyDigest,
} from "@jarvis/security";

export const ClassifiedStoredRecordSchema = z.strictObject({
    version: z.literal(1),
    binding: EnvelopeBindingSchema,
    envelope: EncryptedEnvelopeSchema,
});
export type ClassifiedStoredRecord = z.infer<
    typeof ClassifiedStoredRecordSchema
>;
const ExpectedRecordSchema = z.strictObject({
    ownerId: IdentifierSchema,
    recordId: z.uuid(),
    recordVersion: z.number().int().positive(),
    domain: z.enum(["memory", "conversations"]),
    environment: EnvironmentSchema,
});
type ExpectedRecord = z.infer<typeof ExpectedRecordSchema>;
/** Serialization only: callers must enforce authenticated policy, CAS, audit and durability. */
export class ClassifiedRecordCodec {
    constructor(
        private readonly cipher: EnvelopeCipher,
        private readonly clock: () => number = Date.now,
    ) {}
    async encode(
        domain: "memory" | "conversations",
        input: unknown,
        environment: Environment,
    ): Promise<ClassifiedStoredRecord> {
        const record =
            domain === "memory"
                ? MemoryRecordV2Schema.parse(input)
                : domain === "conversations"
                  ? ConversationRecordSchema.parse(input)
                  : null;
        if (!record) throw new BoundaryError("DATA_DOMAIN_DENIED");
        assertRecordRetention(record.metadata, this.clock());
        const { id, ownerId, recordVersion, policy } = record.metadata;
        const binding = immutableJson(
            EnvelopeBindingSchema.parse({
                version: 1,
                ownerId,
                environment,
                domain,
                recordId: id,
                recordVersion,
                policy,
            }),
        );
        return {
            version: 1,
            binding,
            envelope: await this.cipher.encrypt(record, binding),
        };
    }
    async decode(input: unknown, expected: ExpectedRecord): Promise<unknown> {
        const e = ExpectedRecordSchema.parse(expected),
            stored = ClassifiedStoredRecordSchema.parse(input);
        for (const key of [
            "ownerId",
            "recordId",
            "recordVersion",
            "domain",
            "environment",
        ] as const)
            if (stored.binding[key] !== e[key])
                throw new BoundaryError("DATA_REFERENCE_MISMATCH");
        const value = await this.cipher.decrypt(
            stored.envelope,
            stored.binding,
        );
        const record =
            e.domain === "memory"
                ? MemoryRecordV2Schema.parse(value)
                : ConversationRecordSchema.parse(value);
        const m = record.metadata;
        if (
            m.id !== e.recordId ||
            m.ownerId !== e.ownerId ||
            m.recordVersion !== e.recordVersion ||
            policyDigest(m.policy) !== policyDigest(stored.binding.policy)
        )
            throw new BoundaryError("DATA_REFERENCE_MISMATCH");
        assertRecordRetention(m, this.clock());
        return record;
    }
}
