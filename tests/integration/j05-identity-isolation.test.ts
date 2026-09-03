import { afterAll, beforeAll, expect, it } from "vitest";
import { isolatedMemoryDatabase } from "../fixtures/j05-database.js";

let db: Awaited<ReturnType<typeof isolatedMemoryDatabase>>;
beforeAll(async () => { db = await isolatedMemoryDatabase(); });
afterAll(async () => { await db?.close(); });

it("J0.5 fixtures use a separate database and an authenticated encrypted J0.2 owner", async () => {
    const actual = await db.pool.query<{ database: string; username: string }>(
        "SELECT current_database() AS database,current_user AS username",
    );
    expect(actual.rows[0]).toEqual({ database: db.database, username: "jarvis_development_runtime" });
    expect(db.database).toMatch(/^jarvis_memory_test_[a-f0-9]{16}$/);
    expect(db.database).not.toBe("jarvis_development");
    const owner = await db.repository.transaction(async (state) => state.owner);
    expect(owner?.id).toBe(db.ownerId);
    const payload = await db.pool.query<{ payload: string }>("SELECT payload FROM identity.root_owner");
    expect(payload.rows[0]!.payload).not.toContain("Synthetic Owner");
    expect(payload.rows[0]!.payload).not.toBe("{}");
});

it("reproduces the poisoned-owner decryption failure without contaminating the installation", async () => {
    const row = (await db.pool.query<{ payload: string }>(
        "SELECT payload FROM identity.root_owner WHERE id=$1", [db.ownerId],
    )).rows[0]!;
    // Deliberately reproduce the old J0.5 fixture's invalid ciphertext ONLY in
    // this generated database. Never repair or remove the installation owner.
    await db.pool.query("UPDATE identity.root_owner SET payload=$1 WHERE id=$2", ["{}", db.ownerId]);
    try {
        let entered = false;
        await expect(db.repository.transaction(async () => { entered = true; }))
            .rejects.toMatchObject({ code: "CIPHERTEXT_AUTHENTICATION_FAILED" });
        expect(entered).toBe(false);
    } finally {
        await db.pool.query("UPDATE identity.root_owner SET payload=$1 WHERE id=$2", [row.payload, db.ownerId]);
    }
    expect(await db.repository.transaction(async (state) => state.owner?.id)).toBe(db.ownerId);
});
