import { expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { EnvelopeCipher } from "@jarvis/security";
import { ClassifiedRecordCodec } from "@jarvis/storage";
import { memoryV2, conversation, dataNow } from "../fixtures/data.js";
function codec() {
    const key = randomBytes(32);
    return new ClassifiedRecordCodec(
        new EnvelopeCipher(
            {
                activeKeyId: "synthetic-kek",
                lease: async () => {
                    const value = Buffer.from(key);
                    return {
                        value,
                        expiresAt: dataNow + 60000,
                        destroy: () => value.fill(0),
                    };
                },
            },
            () => dataNow,
        ),
        () => dataNow,
    );
}
it.each(["memory", "conversations"] as const)(
    "serializes classified %s through encryption and validates an owner-scoped reference on decode",
    async (domain) => {
        const c = codec(),
            record = domain === "memory" ? memoryV2() : conversation();
        const stored = await c.encode(domain, record, "development");
        const expected = {
            ownerId: record.metadata.ownerId,
            recordId: record.metadata.id,
            recordVersion: 1,
            domain,
            environment: "development" as const,
        };
        const serialized = JSON.stringify(stored);
        expect(serialized).not.toContain(
            domain === "memory"
                ? "Synthetic preference"
                : "Synthetic conversation",
        );
        expect(await c.decode(JSON.parse(serialized), expected)).toEqual(
            record,
        );
        await expect(
            c.decode(stored, { ...expected, ownerId: "another-owner" }),
        ).rejects.toThrow("DATA_REFERENCE_MISMATCH");
        await expect(
            c.decode(stored, { ...expected, recordVersion: 2 }),
        ).rejects.toThrow("DATA_REFERENCE_MISMATCH");
    },
);
it("does not persist candidate memories without consent or accept old v1 data as implicitly classified", async () => {
    const c = codec(),
        m = memoryV2();
    m.metadata.policy.consent.createMemory = false;
    await expect(c.encode("memory", m, "development")).rejects.toThrow(
        "Explicit memory consent required",
    );
    await expect(
        c.encode(
            "memory",
            { version: 1, content: "legacy data" },
            "development",
        ),
    ).rejects.toThrow();
});
