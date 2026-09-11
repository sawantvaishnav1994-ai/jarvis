import { describe, it, expect } from "vitest";
import { HomeSession } from "../../apps/web/app/home/session";
import type { TurnResult } from "../../apps/web/app/conversation/client";
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { resolve, reject, promise };
}
const result: TurnResult = {
    conversationId: "conversation-one",
    conversationSessionId: "session-one",
    turnId: "turn-one",
    response: "Fixture answer",
    state: "COMPLETED",
    events: [],
    mode: "assistant",
    securityEpoch: 1,
    privacy: {
        classification: "D2",
        processing: "LOCAL",
        externalAI: false,
        stored: false,
    },
    source: { provider: "synthetic-ui", provenance: "test-fixture" },
    approval: null,
    tool: null,
};
describe("Personal Home request lifecycle", () => {
    it("rejects duplicate sends while preserving returned conversation binding", async () => {
        const pending = deferred<TurnResult>();
        const inputs: unknown[] = [];
        const session = new HomeSession(async (input) => {
            inputs.push(input);
            return pending.promise;
        });
        const first = session.send("first");
        await session.send("duplicate");
        expect(inputs).toHaveLength(1);
        pending.resolve(result);
        await first;
        await session.send("second");
        expect(inputs[1]).toEqual({
            message: "second",
            conversationId: "conversation-one",
            conversationSessionId: "session-one",
        });
        expect(session.getSnapshot().exchanges).toHaveLength(2);
    });
    it("cancel aborts transport and a late result cannot overwrite a replacement", async () => {
        const pending = deferred<TurnResult>();
        let firstSignal: AbortSignal | undefined;
        let count = 0;
        const session = new HomeSession(async (_input, signal) => {
            if (++count === 1) {
                firstSignal = signal;
                return pending.promise;
            }
            return { ...result, turnId: "replacement" };
        });
        const first = session.send("first");
        session.cancel();
        expect(firstSignal?.aborted).toBe(true);
        await session.send("replacement");
        pending.resolve(result);
        await first;
        expect(session.getSnapshot().exchanges[0]?.status).toBe("cancelled");
        expect(session.getSnapshot().exchanges[0]?.result).toBeNull();
        expect(session.getSnapshot().exchanges[1]?.result?.turnId).toBe(
            "replacement",
        );
    });
    it("clearing a pending request prevents late response restoration", async () => {
        const pending = deferred<TurnResult>();
        const session = new HomeSession(async () => pending.promise);
        const task = session.send("private text");
        session.clear();
        pending.resolve(result);
        await task;
        expect(session.getSnapshot()).toEqual({
            exchanges: [],
            pending: false,
            phase: "idle",
            error: null,
        });
    });
    it("late rejection does not clear a newer in-flight request", async () => {
        const first = deferred<TurnResult>(),
            second = deferred<TurnResult>();
        let calls = 0;
        const session = new HomeSession(async () =>
            ++calls === 1 ? first.promise : second.promise,
        );
        const old = session.send("old");
        session.cancel();
        const fresh = session.send("fresh");
        first.reject(new Error("SESSION_INVALID"));
        await old;
        expect(session.getSnapshot().pending).toBe(true);
        expect(session.getSnapshot().error).toBeNull();
        second.resolve(result);
        await fresh;
    });
    it("failed authorization requires a fresh conversation session on retry", async () => {
        const inputs: { conversationSessionId: string | null }[] = [];
        let calls = 0;
        const session = new HomeSession(async (input) => {
            inputs.push(input);
            if (++calls === 2) throw new Error("SESSION_INVALID");
            return result;
        });
        await session.send("one");
        await session.send("two");
        await session.send("three");
        expect(inputs[1]?.conversationSessionId).toBe("session-one");
        expect(inputs[2]?.conversationSessionId).toBeNull();
        expect(session.getSnapshot().exchanges[1]?.error).toBe(
            "SESSION_INVALID",
        );
    });
});
