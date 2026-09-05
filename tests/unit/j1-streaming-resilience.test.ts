import { describe, expect, it } from "vitest";
import {
    J110StreamingResilienceCoordinator,
    J110StreamingResilienceError,
    type ContextAssemblyAuthority,
    type J110StreamSnapshot,
} from "@jarvis/core";

const authority: ContextAssemblyAuthority = {
    ownerId: "owner:root",
    projectId: "jarvis",
    conversationId: "conversation:1",
    sessionId: "session:1",
    turnId: "turn:1",
    securityEpoch: 9,
    operatingMode: "copilot",
};

const snapshot: J110StreamSnapshot = {
    authority,
    terminal: "COMPLETED",
    events: [
        { sequence: 0, state: "ACCEPTED", kind: "state", content: null },
        {
            sequence: 1,
            state: "RESPONSE_PROCESSING",
            kind: "content",
            content: "hello",
        },
        {
            sequence: 2,
            state: "COMPLETED",
            kind: "terminal",
            content: null,
        },
    ],
};

function coordinator(current: J110StreamSnapshot | null = snapshot) {
    return new J110StreamingResilienceCoordinator(
        { verify: async () => ({ valid: true, reason: "OK" }) },
        { read: async () => current },
    );
}

describe("J1.10 streaming cancellation resilience", () => {
    it("resumes after an exact ordered cursor without replaying protected side effects", async () => {
        const result = await coordinator().resume(
            authority,
            {
                ownerId: authority.ownerId,
                projectId: "jarvis",
                conversationId: authority.conversationId,
                sessionId: authority.sessionId,
                turnId: authority.turnId,
                securityEpoch: authority.securityEpoch,
                afterSequence: 0,
            },
            new AbortController().signal,
        );
        expect(result.events.map((event) => event.sequence)).toEqual([1, 2]);
        expect(result.nextSequence).toBe(3);
        expect(result.replayedProtectedSideEffects).toBe(false);
    });

    it("rejects cross-session and stale-epoch cursor replay", async () => {
        const base = {
            ownerId: authority.ownerId,
            projectId: "jarvis",
            conversationId: authority.conversationId,
            sessionId: authority.sessionId,
            turnId: authority.turnId,
            securityEpoch: authority.securityEpoch,
            afterSequence: -1,
        };
        await expect(
            coordinator().resume(
                authority,
                { ...base, sessionId: "session:other" },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "J110_CURSOR_BINDING_INVALID" });
        await expect(
            coordinator().resume(
                authority,
                { ...base, securityEpoch: 8 },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "J110_CURSOR_BINDING_INVALID" });
    });

    it("fails closed on cancellation before resume", async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(
            coordinator().resume(
                authority,
                {
                    ownerId: authority.ownerId,
                    projectId: "jarvis",
                    conversationId: authority.conversationId,
                    sessionId: authority.sessionId,
                    turnId: authority.turnId,
                    securityEpoch: authority.securityEpoch,
                    afterSequence: -1,
                },
                controller.signal,
            ),
        ).rejects.toBeInstanceOf(J110StreamingResilienceError);
    });

    it("rejects sequence gaps rather than inventing stream history", async () => {
        const broken: J110StreamSnapshot = {
            ...snapshot,
            events: [snapshot.events[0]!, snapshot.events[2]!],
        };
        await expect(
            coordinator(broken).resume(
                authority,
                {
                    ownerId: authority.ownerId,
                    projectId: "jarvis",
                    conversationId: authority.conversationId,
                    sessionId: authority.sessionId,
                    turnId: authority.turnId,
                    securityEpoch: authority.securityEpoch,
                    afterSequence: -1,
                },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "J110_SEQUENCE_INVALID" });
    });

    it("revalidates current authority before reading stream state", async () => {
        const blocked = new J110StreamingResilienceCoordinator(
            { verify: async () => ({ valid: false, reason: "FREEZE" }) },
            { read: async () => snapshot },
        );
        await expect(
            blocked.resume(
                authority,
                {
                    ownerId: authority.ownerId,
                    projectId: "jarvis",
                    conversationId: authority.conversationId,
                    sessionId: authority.sessionId,
                    turnId: authority.turnId,
                    securityEpoch: authority.securityEpoch,
                    afterSequence: -1,
                },
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ code: "J110_AUTHORITY_FREEZE" });
    });
});
