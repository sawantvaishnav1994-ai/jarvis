import { describe, it, expect } from "vitest";
import {
    LocalReadAloud,
    type LocalVoice,
    type SpeechPort,
} from "../../apps/web/app/home/speech";
const local: LocalVoice = {
    voiceURI: "local:test",
    name: "Local fixture",
    lang: "en",
    localService: true,
};
const remote: LocalVoice = {
    voiceURI: "remote:test",
    name: "Remote fixture",
    lang: "en",
    localService: false,
};
function fixture() {
    let voices = [remote, local],
        cancelled = 0;
    const calls: {
        text: string;
        voice: LocalVoice;
        callbacks: Parameters<SpeechPort["speak"]>[2];
    }[] = [];
    const controller = new LocalReadAloud({
        voices: () => voices,
        speak: (text, voice, callbacks) => {
            calls.push({ text, voice, callbacks });
        },
        cancel: () => {
            cancelled++;
        },
    });
    controller.refresh();
    return {
        controller,
        calls,
        get cancelled() {
            return cancelled;
        },
        setVoices: (next: LocalVoice[]) => {
            voices = next;
        },
    };
}
describe("explicit local read-aloud privacy and lifecycle", () => {
    it("does not autoplay and filters remote voices before selection", () => {
        const f = fixture();
        expect(f.calls).toHaveLength(0);
        expect(f.controller.getSnapshot().voices).toEqual([local]);
        f.controller.speak(1, "Approved visible answer");
        expect(f.calls[0]?.voice).toEqual(local);
        expect(f.controller.getSnapshot().phase).toBe("queued");
        f.calls[0]!.callbacks.start();
        expect(f.controller.getSnapshot().phase).toBe("speaking");
    });
    it("rechecks voice locality at disclosure time and never defaults remotely", () => {
        const f = fixture();
        f.setVoices([{ ...local, localService: false }, remote]);
        f.controller.speak(1, "Private");
        expect(f.calls).toHaveLength(0);
        expect(f.controller.getSnapshot().error).toContain("No local");
    });
    it("cancels current speech and ignores its late callbacks after replacement", () => {
        const f = fixture();
        f.controller.speak(1, "one");
        f.controller.speak(2, "two");
        expect(f.cancelled).toBe(1);
        f.calls[0]!.callbacks.end();
        f.calls[0]!.callbacks.error();
        expect(f.controller.getSnapshot().activeId).toBe(2);
        f.calls[1]!.callbacks.start();
        f.controller.stop();
        expect(f.cancelled).toBe(2);
        f.calls[1]!.callbacks.start();
        expect(f.controller.getSnapshot().phase).toBe("idle");
    });
    it("voice removal stops disclosure and oversized content is rejected", () => {
        const f = fixture();
        f.controller.speak(1, "one");
        f.setVoices([remote]);
        f.controller.refresh();
        expect(f.cancelled).toBe(1);
        expect(f.controller.getSnapshot().selected).toBeNull();
        f.controller.speak(2, "x".repeat(20001));
        expect(f.calls).toHaveLength(1);
    });
});
