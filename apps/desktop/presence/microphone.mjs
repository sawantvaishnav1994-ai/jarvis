// Owns only local amplitude-preview resources. No recording or network transport.
export class MicrophonePreview {
    constructor({
        permission,
        capture,
        createContext,
        isVisible,
        onChange,
        onError,
    }) {
        Object.assign(this, {
            permission,
            capture,
            createContext,
            isVisible,
            onChange,
            onError,
        });
        this.generation = 0;
        this.starting = false;
        this.stream = null;
        this.context = null;
        this.analyser = null;
        this.audioData = null;
    }

    async stop() {
        ++this.generation;
        this.starting = false;
        const stream = this.stream;
        const context = this.context;
        this.stream = this.context = this.analyser = this.audioData = null;
        // Revoke before waiting for AudioContext.close; an old close must never
        // revoke a subsequently approved session.
        let revoke;
        try {
            revoke = Promise.resolve(this.permission(false)).catch(() => {});
        } catch {
            revoke = Promise.resolve();
        }
        stream?.getTracks().forEach((track) => track.stop());
        this.onChange();
        await Promise.all([revoke, context?.close().catch(() => {})]);
    }

    async toggle() {
        if (this.stream || this.starting) return this.stop();
        return this.start();
    }

    async start() {
        if (this.stream || this.starting || !this.isVisible()) return;
        const generation = ++this.generation;
        this.starting = true;
        let captured;
        try {
            const allowed = await this.permission(true);
            if (generation !== this.generation) return;
            if (!allowed || !this.isVisible()) {
                await this.stop();
                return;
            }
            captured = await this.capture();
            if (generation !== this.generation || !this.isVisible()) {
                captured.getTracks().forEach((track) => track.stop());
                if (generation === this.generation) await this.stop();
                return;
            }
            this.stream = captured;
            const tracks = captured.getAudioTracks();
            if (
                !tracks.length ||
                tracks.some((track) => track.readyState === "ended")
            )
                throw new Error("Audio track unavailable");
            this.context = this.createContext();
            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = 256;
            this.context
                .createMediaStreamSource(captured)
                .connect(this.analyser);
            this.audioData = new Uint8Array(this.analyser.fftSize);
            for (const track of tracks)
                track.addEventListener(
                    "ended",
                    () => {
                        if (generation === this.generation) void this.stop();
                    },
                    { once: true },
                );
            this.onChange();
        } catch {
            if (generation === this.generation) {
                await this.stop();
                // Cleanup can overlap a new request. Do not overwrite its UI.
                if (this.generation === generation + 1) this.onError();
            } else captured?.getTracks().forEach((track) => track.stop());
        } finally {
            if (generation === this.generation) this.starting = false;
        }
    }
}
