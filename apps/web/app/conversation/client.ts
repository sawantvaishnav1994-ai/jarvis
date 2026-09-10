export type Challenge = {
    challengeId: string;
    devicePayload: string;
    bindingDigest: string;
};
type ResponseEvent = {
    sequence: number;
    state: string;
    kind: "state" | "content" | "terminal";
    content: string | null;
};
export type TurnResult = {
    conversationId: string;
    conversationSessionId: string;
    turnId: string;
    response: string | null;
    state: string;
    events: ResponseEvent[];
    mode: string;
    securityEpoch: number;
    privacy: {
        classification: string;
        processing: string;
        externalAI: boolean;
        stored: boolean;
    };
    source: { provider: string; provenance: string };
    approval: null | { status: string; id?: string };
    tool: null | { status: string; provenance?: string };
};

export async function rpc<T>(body: object, signal?: AbortSignal): Promise<T> {
    const response = await fetch("/api/conversation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: signal ?? null,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "CONVERSATION_DENIED");
    return data.result as T;
}
