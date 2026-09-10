// Presentation-only contract. Events convey state; they never authorize an action.
export const states = Object.freeze([
    "idle",
    "listening",
    "reasoning",
    "responding",
    "active",
    "understanding",
    "thinking",
    "memory-retrieval",
    "knowledge-retrieval",
    "tool-action",
    "needs-approval",
    "error",
    "background",
]);
export function parseEvent(value, now = Date.now()) {
    if (
        !value ||
        value.version !== 1 ||
        !states.some((s) => value.type === `presence.${s}`) ||
        !Number.isSafeInteger(value.sequence) ||
        value.sequence < 0 ||
        !Number.isFinite(value.at) ||
        Math.abs(now - value.at) > 5000 ||
        typeof value.runId !== "string" ||
        value.runId.length < 1 ||
        value.runId.length > 128 ||
        !Number.isFinite(value.amplitude) ||
        value.amplitude < 0 ||
        value.amplitude > 1
    )
        return null;
    return {
        version: 1,
        type: value.type,
        sequence: value.sequence,
        at: value.at,
        runId: value.runId,
        amplitude: value.amplitude,
    };
}
export class PresenceController {
    sequence = -1;
    state = "idle";
    amplitude = 0;
    lastEvent = 0;
    accept(value, now = Date.now()) {
        const event = parseEvent(value, now);
        if (!event || event.sequence <= this.sequence) return false;
        this.sequence = event.sequence;
        this.state = event.type.slice(9);
        this.amplitude = event.amplitude;
        this.lastEvent = now;
        return true;
    }
    snapshot(now = Date.now()) {
        const stale = now - this.lastEvent > 5000;
        return {
            state: stale ? "idle" : this.state,
            amplitude: stale ? 0 : this.amplitude,
            connected: !stale,
        };
    }
}
export function clampPosition(position, area, size) {
    const x = Number.isFinite(position?.x)
        ? position.x
        : area.x + area.width - size - 24;
    const y = Number.isFinite(position?.y)
        ? position.y
        : area.y + area.height - size - 24;
    return {
        x: Math.round(
            Math.max(
                area.x,
                Math.min(x, area.x + Math.max(0, area.width - size)),
            ),
        ),
        y: Math.round(
            Math.max(
                area.y,
                Math.min(y, area.y + Math.max(0, area.height - size)),
            ),
        ),
    };
}

export function normalizePoint(value) {
    if (
        !value ||
        !Number.isFinite(value.x) ||
        !Number.isFinite(value.y) ||
        Math.abs(value.x) > 1073741824 ||
        Math.abs(value.y) > 1073741824
    )
        return undefined;
    return { x: Math.round(value.x), y: Math.round(value.y) };
}
