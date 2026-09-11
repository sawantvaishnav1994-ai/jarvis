export type LocalVoice = {
    voiceURI: string;
    name: string;
    lang: string;
    localService: boolean;
};
export interface SpeechPort {
    voices(): LocalVoice[];
    speak(
        text: string,
        voice: LocalVoice,
        callbacks: { start(): void; end(): void; error(): void },
    ): void;
    cancel(): void;
}
export type SpeechSnapshot = {
    voices: readonly LocalVoice[];
    selected: string | null;
    activeId: number | null;
    phase: "idle" | "queued" | "speaking";
    error: string | null;
};
export class LocalReadAloud {
    private snapshot: SpeechSnapshot = {
        voices: [],
        selected: null,
        activeId: null,
        phase: "idle",
        error: null,
    };
    private generation = 0;
    private listeners = new Set<() => void>();
    constructor(private readonly port: SpeechPort) {}
    getSnapshot = () => this.snapshot;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    private update(patch: Partial<SpeechSnapshot>) {
        this.snapshot = { ...this.snapshot, ...patch };
        this.listeners.forEach((fn) => fn());
    }
    refresh() {
        let voices: LocalVoice[] = [];
        try {
            voices = this.port.voices().filter((v) => v.localService === true);
        } catch {
            /* unavailable fails closed */
        }
        const selected = voices.some(
            (v) => v.voiceURI === this.snapshot.selected,
        )
            ? this.snapshot.selected
            : (voices[0]?.voiceURI ?? null);
        if (
            this.snapshot.activeId !== null &&
            !voices.some((v) => v.voiceURI === this.snapshot.selected)
        )
            this.stop();
        this.update({ voices, selected });
    }
    select(voiceURI: string) {
        this.stop();
        if (
            this.snapshot.voices.some(
                (v) => v.voiceURI === voiceURI && v.localService,
            )
        )
            this.update({ selected: voiceURI });
    }
    speak(id: number, text: string) {
        this.stop();
        if (!text.trim() || text.length > 20_000) {
            this.update({ error: "This answer cannot be read aloud." });
            return;
        }
        const selected = this.snapshot.selected;
        // Re-read live voice metadata at every disclosure; never fall back to a
        // browser default, which may be a remote synthesizer.
        let voice: LocalVoice | undefined;
        try {
            voice = this.port
                .voices()
                .find(
                    (v) => v.localService === true && v.voiceURI === selected,
                );
        } catch {
            /* unavailable */
        }
        if (!voice) {
            this.update({ error: "No local device voice is available." });
            return;
        }
        const generation = ++this.generation;
        this.update({ activeId: id, phase: "queued", error: null });
        try {
            this.port.speak(text, voice, {
                start: () => {
                    if (generation === this.generation)
                        this.update({ phase: "speaking" });
                },
                end: () => {
                    if (generation === this.generation) {
                        ++this.generation;
                        this.update({ activeId: null, phase: "idle" });
                    }
                },
                error: () => {
                    if (generation === this.generation) {
                        this.stop();
                        this.update({
                            error: "Device speech is unavailable. No remote voice was used.",
                        });
                    }
                },
            });
        } catch {
            if (generation === this.generation) {
                this.stop();
                this.update({
                    error: "Device speech is unavailable. No remote voice was used.",
                });
            }
        }
    }
    stop() {
        ++this.generation;
        const active = this.snapshot.activeId !== null;
        this.update({ activeId: null, phase: "idle", error: null });
        if (active) {
            try {
                this.port.cancel();
            } catch {
                /* hide/dispose must finish */
            }
        }
    }
}
