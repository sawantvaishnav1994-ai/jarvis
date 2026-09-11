import test from "node:test";
import assert from "node:assert/strict";
import { MicrophonePreview } from "./microphone.mjs";
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
function stream() {
    const listeners = [];
    const track = {
        readyState: "live",
        stops: 0,
        stop() {
            this.stops++;
        },
        addEventListener(_, callback) {
            listeners.push(callback);
        },
    };
    return {
        track,
        end: () => listeners.forEach((fn) => fn()),
        getTracks: () => [track],
        getAudioTracks: () => [track],
    };
}
function fixture(overrides = {}) {
    const permissions = [],
        errors = [],
        captured = stream();
    const context = {
        close: async () => {},
        createAnalyser: () => ({}),
        createMediaStreamSource: () => ({ connect() {} }),
    };
    const preview = new MicrophonePreview({
        permission: async (v) => {
            permissions.push(v);
            return v;
        },
        capture: async () => captured,
        createContext: () => context,
        isVisible: () => true,
        onChange() {},
        onError: () => errors.push("error"),
        ...overrides,
    });
    return { preview, permissions, errors, captured, context };
}
test("stop revokes immediately even while audio shutdown is pending", async () => {
    const closing = deferred();
    const f = fixture();
    f.context.close = () => closing.promise;
    await f.preview.start();
    const stopped = f.preview.stop();
    assert.equal(f.preview.stream, null);
    assert.equal(f.captured.track.stops, 1);
    assert.deepEqual(f.permissions, [true, false]);
    await f.preview.start();
    closing.resolve();
    await stopped;
    assert.deepEqual(f.permissions, [true, false, true]);
    assert.equal(f.preview.stream, f.captured);
});
test("late capture is stopped without clearing a newer pending request", async () => {
    const first = deferred(),
        second = deferred();
    let calls = 0;
    const f = fixture({
        capture: () => (++calls === 1 ? first.promise : second.promise),
    });
    const old = f.preview.start();
    await Promise.resolve();
    await f.preview.stop();
    const fresh = f.preview.start();
    await Promise.resolve();
    const late = stream();
    first.resolve(late);
    await old;
    assert.equal(late.track.stops, 1);
    assert.equal(f.preview.starting, true);
    const active = stream();
    second.resolve(active);
    await fresh;
    assert.equal(f.preview.stream, active);
    assert.deepEqual(f.permissions, [true, false, true]);
});
test("late rejection does not mute a newer microphone session", async () => {
    const pending = deferred();
    let calls = 0;
    const active = stream();
    const f = fixture({
        capture: () =>
            ++calls === 1 ? pending.promise : Promise.resolve(active),
    });
    const old = f.preview.start();
    await Promise.resolve();
    await f.preview.stop();
    await f.preview.start();
    pending.reject(new Error("old device request failed"));
    await old;
    assert.equal(f.preview.stream, active);
    assert.equal(active.track.stops, 0);
    assert.equal(f.errors.length, 0);
    assert.deepEqual(f.permissions, [true, false, true]);
});
test("stale track-ended callback cannot stop replacement capture", async () => {
    let current = stream();
    const f = fixture({ capture: async () => current });
    await f.preview.start();
    const old = current;
    await f.preview.stop();
    current = stream();
    await f.preview.start();
    old.end();
    assert.equal(f.preview.stream, current);
    current.end();
    assert.equal(f.preview.stream, null);
    assert.equal(current.track.stops, 1);
});
test("hiding during capture stops returned tracks and revokes permission", async () => {
    let visible = true;
    const pending = deferred();
    const f = fixture({
        capture: () => pending.promise,
        isVisible: () => visible,
    });
    const run = f.preview.start();
    await Promise.resolve();
    visible = false;
    const late = stream();
    pending.resolve(late);
    await run;
    assert.equal(late.track.stops, 1);
    assert.equal(f.preview.stream, null);
    assert.deepEqual(f.permissions, [true, false]);
});
test("audio setup failure releases captured tracks and permission", async () => {
    const f = fixture({
        createContext() {
            throw new Error("device lost");
        },
    });
    await f.preview.start();
    assert.equal(f.captured.track.stops, 1);
    assert.equal(f.preview.stream, null);
    assert.deepEqual(f.permissions, [true, false]);
    assert.equal(f.errors.length, 1);
});
