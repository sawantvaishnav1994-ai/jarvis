import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PresenceController,
    parseEvent,
    clampPosition,
    normalizePoint,
} from "./state.mjs";
const event = (sequence = 1) => ({
    version: 1,
    type: "presence.reasoning",
    runId: "run-1",
    sequence,
    at: 10000,
    amplitude: 0,
});
test("rejects malformed, future, expired and replayed events", () => {
    const c = new PresenceController();
    assert.equal(c.accept(event(), 10000), true);
    assert.equal(c.accept(event(), 10000), false);
    assert.equal(c.accept({ ...event(2), at: 30000 }, 10000), false);
    assert.equal(c.accept({ ...event(2), amplitude: 2 }, 10000), false);
    assert.equal(parseEvent({ ...event(), type: "tool.execute" }, 10000), null);
    assert.equal(c.snapshot(16000).connected, false);
    assert.equal(c.snapshot(16000).state, "idle");
});
test("presentation strips unknown payload and carries no authority", () => {
    const parsed = parseEvent(
        { ...event(), token: "secret", permissions: ["all"] },
        10000,
    );
    assert.equal("token" in parsed, false);
    assert.equal("permissions" in parsed, false);
});
test("positions survive removed monitors, negative coordinates and malformed storage", () => {
    const area = { x: -1920, y: 0, width: 1920, height: 1080 };
    assert.deepEqual(clampPosition({ x: -3000, y: 2000 }, area, 140), {
        x: -1920,
        y: 940,
    });
    assert.deepEqual(
        clampPosition(
            { x: NaN, y: Infinity },
            { x: 0, y: 0, width: 1000, height: 800 },
            140,
        ),
        { x: 836, y: 636 },
    );
});

test("invalid persisted positions never reach native display lookup", () => {
    for (const value of [
        null,
        {},
        { x: NaN, y: 0 },
        { x: 0, y: Infinity },
        { x: 1e30, y: 0 },
    ])
        assert.equal(normalizePoint(value), undefined);
    assert.deepEqual(normalizePoint({ x: -20.5, y: 10.2 }), { x: -20, y: 10 });
});
