import { it, expect } from "vitest";
import { fixture, root, TestIdentityRepository } from "../fixtures/identity.js";
it("revalidates bound inference sessions and rejects revocation or rebinding", async () => {
    const repo = new TestIdentityRepository();
    const f = fixture(repo);
    const owner = await root(f);
    const session = Object.values(repo.state.sessions).find(
        (s) => s.deviceId === owner.session.deviceId,
    )!;
    const binding = {
        ownerId: session.ownerId,
        deviceId: session.deviceId,
        sessionId: session.id,
        epoch: session.epoch,
    };
    await expect(
        f.engine.assertLiveSession(
            owner.session.token,
            "test-context",
            binding,
        ),
    ).resolves.toBeUndefined();
    await expect(
        f.engine.assertLiveSession(owner.session.token, "test-context", {
            ...binding,
            sessionId: "other",
        }),
    ).rejects.toThrow("SESSION_INVALID");
    repo.state.sessions[session.tokenHash]!.revoked = true;
    await expect(
        f.engine.assertLiveSession(
            owner.session.token,
            "test-context",
            binding,
        ),
    ).rejects.toThrow("SESSION_INVALID");
});
it("does not accept suspicious context for an already started inference", async () => {
    const repo = new TestIdentityRepository();
    const f = fixture(repo);
    const owner = await root(f);
    const s = Object.values(repo.state.sessions)[0]!;
    await expect(
        f.engine.assertLiveSession(owner.session.token, "different-context", {
            ownerId: s.ownerId,
            deviceId: s.deviceId,
            sessionId: s.id,
            epoch: s.epoch,
        }),
    ).rejects.toThrow("SESSION_INVALID");
});
