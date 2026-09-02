import { z } from "zod";

export const DataClassSchema = z.enum(["D0", "D1", "D2", "D3", "D4", "D5"]);
export type DataClass = z.infer<typeof DataClassSchema>;
export const DataRetentionSchema = z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("keep") }),
    z.strictObject({ mode: z.literal("until"), expiresAt: z.iso.datetime() }),
    z.strictObject({
        mode: z.literal("session"),
        sessionId: z.string().min(1).max(128),
    }),
    z.strictObject({ mode: z.literal("never-store") }),
]);
// These are independent owner decisions, not defaults inferred from a conversation.
export const DataConsentSchema = z.strictObject({
    storeConversation: z.boolean(),
    createMemory: z.boolean(),
    projectKnowledge: z.boolean(),
    keepAttachments: z.boolean(),
    personalization: z.boolean(),
    externalAI: z.boolean(),
});
export const DataPolicySchema = z
    .strictObject({
        version: z.literal(1),
        classification: DataClassSchema,
        privacy: z.enum(["local-only", "private-cloud", "ai-allow"]),
        retention: DataRetentionSchema,
        consent: DataConsentSchema,
    })
    .refine(
        (v) => v.classification !== "D5" || v.privacy === "local-only",
        "Secrets are local-only",
    );
export type DataPolicy = z.infer<typeof DataPolicySchema>;

/** Pure eligibility check. It is not identity verification or an authorization grant. */
export function isDurablyStorable(policy: DataPolicy, now: number): boolean {
    const p = DataPolicySchema.parse(policy);
    return (
        Number.isSafeInteger(now) &&
        now >= 0 &&
        p.classification !== "D5" &&
        (p.retention.mode === "keep" ||
            (p.retention.mode === "until" &&
                Date.parse(p.retention.expiresAt) > now))
    );
}
