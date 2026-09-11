"use client";
import { useSyncExternalStore } from "react";
import { LocalReadAloud, type SpeechPort } from "./speech";
export const browserSpeech: SpeechPort = {
    voices: () =>
        typeof window !== "undefined" && "speechSynthesis" in window
            ? window.speechSynthesis.getVoices()
            : [],
    speak: (text, voice, callbacks) => {
        const local = window.speechSynthesis
            .getVoices()
            .find(
                (v) => v.localService === true && v.voiceURI === voice.voiceURI,
            );
        if (!local) throw new Error("LOCAL_VOICE_UNAVAILABLE");
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = local;
        utterance.lang = local.lang;
        utterance.onstart = callbacks.start;
        utterance.onend = callbacks.end;
        utterance.onerror = callbacks.error;
        window.speechSynthesis.speak(utterance);
    },
    cancel: () => window.speechSynthesis.cancel(),
};
export function ReadAloud({
    speech,
    id,
    text,
}: {
    speech: LocalReadAloud;
    id: number;
    text: string;
}) {
    const state = useSyncExternalStore(
        speech.subscribe,
        speech.getSnapshot,
        speech.getSnapshot,
    );
    const active = state.activeId === id;
    return (
        <div className="home-read-aloud">
            <button
                type="button"
                disabled={!active && !state.voices.length}
                onClick={() =>
                    active ? speech.stop() : speech.speak(id, text)
                }
            >
                {active ? "Stop reading" : "Read aloud"}
            </button>
            <span>
                {active
                    ? state.phase === "speaking"
                        ? "Speaking on this device"
                        : "Preparing device voice…"
                    : state.voices.length
                      ? "Uses your selected local device voice"
                      : "No local device voice available"}
            </span>
            {state.error && <p role="status">{state.error}</p>}
        </div>
    );
}
