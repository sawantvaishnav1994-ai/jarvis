"use client";

import { useState } from "react";
import { deviceKey, deviceProof } from "../identity/device-key";

type Challenge = {
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
type TurnResult = {
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

async function rpc<T>(body: object): Promise<T> {
    const response = await fetch("/api/conversation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "CONVERSATION_DENIED");
    return data.result as T;
}

export function ConversationConsole() {
    const [message, setMessage] = useState("");
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [conversationSessionId, setConversationSessionId] = useState<
        string | null
    >(null);
    const [turn, setTurn] = useState<TurnResult | null>(null);
    const [status, setStatus] = useState(
        "Ready. Authenticate in Identity first, then send a local development turn.",
    );
    const [busy, setBusy] = useState(false);

    async function send() {
        const text = message.trim();
        if (!text || busy) return;
        setBusy(true);
        setStatus("Binding this turn to your authenticated device…");
        try {
            const request = {
                message: text,
                conversationId,
                conversationSessionId,
            };
            const challenge = await rpc<Challenge>({ phase: "begin", request });
            const key = await deviceKey();
            const proof = await deviceProof(key, challenge);
            setStatus(
                "Device proof verified. Running governed conversation pipeline…",
            );
            const result = await rpc<TurnResult>({
                phase: "turn",
                request,
                proof,
            });
            setConversationId(result.conversationId);
            setConversationSessionId(result.conversationSessionId);
            setTurn(result);
            setMessage("");
            setStatus(
                result.state === "COMPLETED"
                    ? "Turn completed through the authenticated J1 pipeline."
                    : `Turn ended in ${result.state}.`,
            );
        } catch (error) {
            const code =
                error instanceof Error ? error.message : "CONVERSATION_DENIED";
            if (
                [
                    "SESSION_INVALID",
                    "SESSION_EXPIRED",
                    "DEVICE_NOT_TRUSTED",
                    "CONVERSATION_SESSION_BINDING_INVALID",
                    "CONVERSATION_AUTHORITY_INVALID",
                ].includes(code)
            ) {
                setConversationSessionId(null);
                setStatus(`${code}. Re-authenticate in Identity.`);
            } else if (
                [
                    "SAFE_MODE",
                    "FREEZE",
                    "SHUTDOWN",
                    "SECURITY_LOCKDOWN",
                ].includes(code)
            )
                setStatus(
                    `${code}. Conversation authority is restricted by emergency control.`,
                );
            else setStatus(code);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section
            className="conversation-console"
            aria-label="JARVIS conversation"
        >
            <div
                className="conversation-status"
                role="status"
                aria-live="polite"
            >
                {status}
            </div>
            <div
                className="conversation-meta"
                aria-label="Conversation authority indicators"
            >
                <span>Mode: {turn?.mode ?? "assistant"}</span>
                <span>Privacy: {turn?.privacy.classification ?? "D2"}</span>
                <span>Processing: {turn?.privacy.processing ?? "LOCAL"}</span>
                <span>
                    External AI: {turn?.privacy.externalAI ? "enabled" : "off"}
                </span>
                <span>
                    Storage: {turn?.privacy.stored ? "stored" : "session-only"}
                </span>
            </div>

            <div className="conversation-transcript" aria-live="polite">
                {turn ? (
                    <article>
                        <p className="eyebrow">JARVIS / {turn.state}</p>
                        <p className="conversation-response">
                            {turn.response ??
                                "No response content was committed."}
                        </p>
                        <dl className="conversation-details">
                            <div>
                                <dt>Source</dt>
                                <dd>{turn.source.provider}</dd>
                            </div>
                            <div>
                                <dt>Provenance</dt>
                                <dd>{turn.source.provenance}</dd>
                            </div>
                            <div>
                                <dt>Security epoch</dt>
                                <dd>{turn.securityEpoch}</dd>
                            </div>
                            <div>
                                <dt>Approval</dt>
                                <dd>
                                    {turn.approval?.status ?? "not requested"}
                                </dd>
                            </div>
                            <div>
                                <dt>Tool</dt>
                                <dd>{turn.tool?.status ?? "not executed"}</dd>
                            </div>
                        </dl>
                        <details>
                            <summary>Ordered stream events</summary>
                            <ol className="conversation-events">
                                {turn.events.map((event) => (
                                    <li key={`${event.sequence}:${event.kind}`}>
                                        <code>#{event.sequence}</code>{" "}
                                        {event.state} / {event.kind}
                                        {event.content
                                            ? ` — ${event.content}`
                                            : ""}
                                    </li>
                                ))}
                            </ol>
                        </details>
                    </article>
                ) : (
                    <p className="conversation-empty">
                        No turn yet. JARVIS will show response provenance,
                        privacy, approval/tool state and ordered events here.
                    </p>
                )}
            </div>

            <label className="conversation-composer">
                <span>Message</span>
                <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    maxLength={20_000}
                    disabled={busy}
                    placeholder="Ask JARVIS…"
                />
            </label>
            <div className="conversation-actions">
                <button
                    type="button"
                    onClick={() => void send()}
                    disabled={busy || !message.trim()}
                >
                    {busy ? "Running…" : "Send governed turn"}
                </button>
                <a href="/identity">Identity & device trust</a>
            </div>
            <p className="conversation-boundary">
                J1.12 now binds browser continuity to a server-verified J1
                conversation session. Persistence, governed memory, tool,
                approval and audit composition remain release-gated until the
                complete J1.12 qualification passes.
            </p>
        </section>
    );
}
