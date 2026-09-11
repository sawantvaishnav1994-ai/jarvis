import type { TurnResult } from "../conversation/client";
export type Exchange = {
    id: number;
    input: string;
    result: TurnResult | null;
    error: string | null;
    status: "pending" | "completed" | "failed" | "cancelled";
};
export type HomeSnapshot = {
    exchanges: readonly Exchange[];
    pending: boolean;
    phase: "idle" | "authorizing" | "waiting" | "error";
    error: string | null;
};
export type ConversationInput = {
    message: string;
    conversationId: string | null;
    conversationSessionId: string | null;
};
export class HomeSession {
    private snapshot: HomeSnapshot = {
        exchanges: [],
        pending: false,
        phase: "idle",
        error: null,
    };
    private listeners = new Set<() => void>();
    private request: AbortController | null = null;
    private sequence = 0;
    private conversationId: string | null = null;
    private conversationSessionId: string | null = null;
    constructor(
        private readonly execute: (
            input: ConversationInput,
            signal: AbortSignal,
            waiting: () => void,
        ) => Promise<TurnResult>,
    ) {}
    getSnapshot = () => this.snapshot;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    private update(patch: Partial<HomeSnapshot>) {
        this.snapshot = { ...this.snapshot, ...patch };
        this.listeners.forEach((fn) => fn());
    }
    async send(message: string) {
        const input = message.trim();
        if (!input || input.length > 20_000 || this.request) return;
        const request = new AbortController();
        this.request = request;
        const id = ++this.sequence;
        this.update({
            pending: true,
            phase: "authorizing",
            error: null,
            exchanges: [
                ...this.snapshot.exchanges,
                { id, input, result: null, error: null, status: "pending" },
            ],
        });
        try {
            const result = await this.execute(
                {
                    message: input,
                    conversationId: this.conversationId,
                    conversationSessionId: this.conversationSessionId,
                },
                request.signal,
                () => {
                    if (this.request === request)
                        this.update({ phase: "waiting" });
                },
            );
            if (this.request !== request) return;
            this.conversationId = result.conversationId;
            this.conversationSessionId = result.conversationSessionId;
            this.update({
                phase: result.state === "COMPLETED" ? "idle" : "error",
                exchanges: this.snapshot.exchanges.map((e) =>
                    e.id === id
                        ? {
                              ...e,
                              result,
                              status:
                                  result.state === "COMPLETED"
                                      ? "completed"
                                      : "failed",
                          }
                        : e,
                ),
            });
        } catch (error) {
            if (this.request !== request) return;
            const code =
                error instanceof Error
                    ? error.message
                    : "CONVERSATION_UNAVAILABLE";
            // Re-authentication must start a fresh session binding. Keep previous
            // results only in this tab until the owner clears or leaves the page.
            this.conversationSessionId = null;
            this.update({
                phase: "error",
                error: code,
                exchanges: this.snapshot.exchanges.map((e) =>
                    e.id === id ? { ...e, error: code, status: "failed" } : e,
                ),
            });
        } finally {
            if (this.request === request) {
                this.request = null;
                this.update({ pending: false });
            }
        }
    }
    cancel() {
        const request = this.request;
        if (!request) return;
        this.request = null;
        request.abort();
        this.update({
            pending: false,
            phase: "idle",
            exchanges: this.snapshot.exchanges.map((e) =>
                e.status === "pending" ? { ...e, status: "cancelled" } : e,
            ),
        });
    }
    clear() {
        this.cancel();
        this.conversationId = this.conversationSessionId = null;
        this.update({ exchanges: [], phase: "idle", error: null });
    }
}
