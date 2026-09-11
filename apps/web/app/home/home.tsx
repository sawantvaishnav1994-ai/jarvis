"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { rpc, type Challenge, type TurnResult } from "../conversation/client";
import { deviceKey, deviceProof } from "../identity/device-key";
import { HomeSession, type Exchange } from "./session";
import { NeuralCore } from "./core";
import { LocalReadAloud } from "./speech";
import { browserSpeech, ReadAloud } from "./read-aloud";
import "./home.css";
const states = {
    idle: "Ready when you are",
    responding: "Reading your answer aloud",
    authorizing: "Checking your device",
    waiting: "Waiting for JARVIS",
    error: "Your attention is needed",
};
function Evidence({ result }: { result: TurnResult }) {
    return (
        <details className="home-evidence">
            <summary>Source & activity</summary>
            <dl>
                <div>
                    <dt>Source</dt>
                    <dd>{result.source.provider}</dd>
                </div>
                <div>
                    <dt>Provenance</dt>
                    <dd>{result.source.provenance}</dd>
                </div>
                <div>
                    <dt>Privacy</dt>
                    <dd>
                        {result.privacy.classification} ·{" "}
                        {result.privacy.processing}
                    </dd>
                </div>
                <div>
                    <dt>External AI</dt>
                    <dd>{result.privacy.externalAI ? "Enabled" : "Off"}</dd>
                </div>
                <div>
                    <dt>Storage</dt>
                    <dd>{result.privacy.stored ? "Stored" : "Session only"}</dd>
                </div>
                <div>
                    <dt>Approval</dt>
                    <dd>{result.approval?.status ?? "Not requested"}</dd>
                </div>
                <div>
                    <dt>Tool</dt>
                    <dd>{result.tool?.status ?? "Not used"}</dd>
                </div>
            </dl>
            <p className="home-muted">
                Completed execution record. These events are not a live stream.
            </p>
            <ol>
                {result.events.map((event) => (
                    <li key={`${event.sequence}:${event.kind}`}>
                        #{event.sequence} · {event.state} · {event.kind}
                    </li>
                ))}
            </ol>
        </details>
    );
}
function Reply({
    exchange,
    speech,
}: {
    exchange: Exchange;
    speech: LocalReadAloud;
}) {
    return (
        <article className="home-exchange">
            <div className="home-question">
                <span>You</span>
                <p>{exchange.input}</p>
            </div>
            <div className="home-answer">
                <span>JARVIS</span>
                {exchange.result ? (
                    <>
                        <p>
                            {exchange.result.response ??
                                `Turn ended: ${exchange.result.state}. No answer was returned.`}
                        </p>
                        {exchange.result.source.provider === "synthetic-ui" && (
                            <p className="home-notice">
                                Development model · This is a synthetic
                                response, not an AI-generated answer.
                            </p>
                        )}
                        {exchange.result.response && (
                            <ReadAloud
                                speech={speech}
                                id={exchange.id}
                                text={exchange.result.response}
                            />
                        )}
                        <Evidence result={exchange.result} />
                    </>
                ) : exchange.status === "cancelled" ? (
                    <p className="home-muted">
                        Stopped waiting. No response is shown; this does not
                        undo any completed server work.
                    </p>
                ) : exchange.error ? (
                    <p className="home-error">
                        Unable to complete this turn.{" "}
                        <code>{exchange.error}</code>
                    </p>
                ) : (
                    <p className="home-muted">Your request is in progress…</p>
                )}
            </div>
        </article>
    );
}
export function PersonalHome({ identityHref }: { identityHref: string }) {
    const [speech] = useState(() => new LocalReadAloud(browserSpeech));
    const speechState = useSyncExternalStore(
        speech.subscribe,
        speech.getSnapshot,
        speech.getSnapshot,
    );
    const [session] = useState(
        () =>
            new HomeSession(async (request, signal, waiting) => {
                const challenge = await rpc<Challenge>(
                    { phase: "begin", request },
                    signal,
                );
                const key = await deviceKey();
                signal.throwIfAborted();
                const proof = await deviceProof(key, challenge);
                signal.throwIfAborted();
                waiting();
                return rpc<TurnResult>(
                    { phase: "turn", request, proof },
                    signal,
                );
            }),
    );
    const snapshot = useSyncExternalStore(
        session.subscribe,
        session.getSnapshot,
        session.getSnapshot,
    );
    const [view, setView] = useState<"home" | "activities" | "settings">(
        "home",
    );
    const [message, setMessage] = useState("");
    const [reduced, setReduced] = useState(false);
    const [query, setQuery] = useState("");
    const composer = useRef<HTMLTextAreaElement>(null);
    const commandMenu = useRef<HTMLDialogElement>(null);
    const clearDialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        speech.refresh();
        const voices = () => speech.refresh();
        const hidden = () => {
            if (document.hidden) speech.stop();
        };
        window.speechSynthesis?.addEventListener("voiceschanged", voices);
        document.addEventListener("visibilitychange", hidden);
        const leaving = () => speech.stop();
        window.addEventListener("pagehide", leaving);
        const media = matchMedia("(prefers-reduced-motion: reduce)");
        setReduced(media.matches);
        const change = () => setReduced(media.matches);
        media.addEventListener("change", change);
        const shortcut = (event: KeyboardEvent) => {
            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "k"
            ) {
                event.preventDefault();
                commandMenu.current?.showModal();
            }
        };
        document.addEventListener("keydown", shortcut);
        return () => {
            media.removeEventListener("change", change);
            document.removeEventListener("keydown", shortcut);
            session.cancel();
            speech.stop();
            window.speechSynthesis?.removeEventListener(
                "voiceschanged",
                voices,
            );
            document.removeEventListener("visibilitychange", hidden);
            window.removeEventListener("pagehide", leaving);
        };
    }, [session, speech]);
    function navigate(next: typeof view) {
        speech.stop();
        setView(next);
        commandMenu.current?.close();
    }
    function send() {
        if (snapshot.pending || !message.trim()) return;
        speech.stop();
        const input = message;
        setMessage("");
        void session.send(input);
    }
    const coreState =
        speechState.phase === "speaking" ? "responding" : snapshot.phase;
    const commands = [
        { name: "Home", action: () => navigate("home") },
        { name: "Activities", action: () => navigate("activities") },
        { name: "Settings", action: () => navigate("settings") },
    ].filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
    return (
        <main className="personal-home">
            <header className="home-header">
                <a href="/" className="home-wordmark">
                    JARVIS<span>PERSONAL AI</span>
                </a>
                <nav aria-label="Main navigation">
                    <button
                        aria-current={view === "home" ? "page" : undefined}
                        onClick={() => navigate("home")}
                    >
                        Home
                    </button>
                    <button
                        aria-current={
                            view === "activities" ? "page" : undefined
                        }
                        onClick={() => navigate("activities")}
                    >
                        Activities
                    </button>
                    <a href="/dashboard">Dashboard</a>
                    <button
                        aria-current={view === "settings" ? "page" : undefined}
                        onClick={() => navigate("settings")}
                    >
                        Settings
                    </button>
                </nav>
                <button
                    className="home-menu-button"
                    onClick={() => commandMenu.current?.showModal()}
                    aria-label="Open command menu"
                >
                    Menu <kbd>⌘ K</kbd>
                </button>
            </header>
            {view === "home" && (
                <section
                    className={`home-environment ${snapshot.exchanges.length ? "has-conversation" : ""}`}
                    aria-label="Personal AI Home"
                >
                    <div className="home-core-section">
                        <button
                            className="home-core-button"
                            onClick={() => composer.current?.focus()}
                            aria-label="Talk to JARVIS using text"
                        >
                            <NeuralCore
                                state={coreState}
                                reducedMotion={reduced}
                            />
                        </button>
                        <div className="home-state" role="status">
                            <span className={`home-state-mark ${coreState}`} />
                            {states[coreState]}
                        </div>
                        {!snapshot.exchanges.length && (
                            <>
                                <h1>What’s on your mind?</h1>
                                <p className="home-intro">
                                    A quiet place to think, ask and work
                                    together.
                                </p>
                            </>
                        )}
                    </div>
                    {snapshot.exchanges.length > 0 && (
                        <div
                            className="home-transcript"
                            aria-label="Current conversation"
                        >
                            {snapshot.exchanges.map((exchange) => (
                                <Reply
                                    key={exchange.id}
                                    exchange={exchange}
                                    speech={speech}
                                />
                            ))}
                        </div>
                    )}
                    {snapshot.error && (
                        <div className="home-auth-notice" role="alert">
                            {snapshot.error.includes("SESSION") ||
                            snapshot.error.includes("DEVICE") ||
                            snapshot.error.includes("AUTH") ? (
                                <>
                                    Sign in on this device to continue.{" "}
                                    <a href={identityHref}>
                                        Open account & devices
                                    </a>
                                </>
                            ) : (
                                <>
                                    JARVIS could not complete the request. Check
                                    the{" "}
                                    <a href="/dashboard">service dashboard</a>{" "}
                                    or try again.
                                </>
                            )}
                        </div>
                    )}
                    <form
                        className="home-composer"
                        onSubmit={(event) => {
                            event.preventDefault();
                            send();
                        }}
                    >
                        <label htmlFor="home-message" className="home-sr-only">
                            Message JARVIS
                        </label>
                        <textarea
                            id="home-message"
                            ref={composer}
                            value={message}
                            maxLength={20000}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Message JARVIS…"
                            rows={2}
                            disabled={snapshot.pending}
                            onKeyDown={(event) => {
                                if (
                                    event.key === "Enter" &&
                                    !event.shiftKey &&
                                    !event.nativeEvent.isComposing
                                ) {
                                    event.preventDefault();
                                    send();
                                }
                            }}
                        />
                        <div className="home-composer-footer">
                            <span>Text conversation · microphone off</span>
                            {snapshot.pending ? (
                                <button
                                    type="button"
                                    className="home-send"
                                    onClick={() => session.cancel()}
                                >
                                    Stop waiting
                                </button>
                            ) : (
                                <button
                                    className="home-send"
                                    type="submit"
                                    disabled={!message.trim()}
                                >
                                    Send <span aria-hidden="true">↑</span>
                                </button>
                            )}
                        </div>
                    </form>
                    <p className="home-session-note">
                        This conversation stays in this page. Reloading clears
                        the displayed transcript.{" "}
                        <a href={identityHref}>Account & devices</a>
                    </p>
                </section>
            )}
            {view === "activities" && (
                <section className="home-workspace">
                    <p className="home-overline">ACTIVITIES</p>
                    <h1>What happened, and why.</h1>
                    <p className="home-muted">
                        Requests and returned execution records from this page
                        session.
                    </p>
                    <div className="home-section-rule" />
                    {snapshot.exchanges.length ? (
                        snapshot.exchanges.map((exchange) => (
                            <details
                                className="home-activity"
                                key={exchange.id}
                            >
                                <summary>
                                    <span>Request {exchange.id}</span>
                                    <span
                                        className={`home-status-pill ${exchange.status}`}
                                    >
                                        {exchange.status}
                                    </span>
                                </summary>
                                <Reply exchange={exchange} speech={speech} />
                            </details>
                        ))
                    ) : (
                        <div className="home-empty">
                            <h2>No activity yet</h2>
                            <p>
                                Your conversation requests will appear here,
                                with the source and outcome returned by JARVIS.
                            </p>
                            <button onClick={() => navigate("home")}>
                                Start a conversation
                            </button>
                        </div>
                    )}
                </section>
            )}
            {view === "settings" && (
                <section className="home-workspace">
                    <p className="home-overline">SETTINGS</p>
                    <h1>Your space. Your control.</h1>
                    <div className="home-settings-row">
                        <div>
                            <h2>Reduced motion</h2>
                            <p>
                                Keep the neural field still. Your device
                                preference is used initially.
                            </p>
                        </div>
                        <input
                            aria-label="Reduced motion"
                            type="checkbox"
                            checked={reduced}
                            onChange={(e) => setReduced(e.target.checked)}
                        />
                    </div>
                    <div className="home-settings-row">
                        <div>
                            <h2>Account & trusted devices</h2>
                            <p>
                                Sign in, manage device trust and review security
                                controls.
                            </p>
                        </div>
                        <a href={identityHref}>Manage</a>
                    </div>
                    <div className="home-settings-row">
                        <div>
                            <h2>Current conversation</h2>
                            <p>
                                Clear the transcript held in this page. This
                                does not delete server audit records or stored
                                data.
                            </p>
                        </div>
                        <button
                            onClick={() => clearDialog.current?.showModal()}
                            disabled={!snapshot.exchanges.length}
                        >
                            Clear page
                        </button>
                    </div>
                    <div className="home-settings-row">
                        <div>
                            <h2>Memory, knowledge & connected tools</h2>
                            <p>
                                Their full product interfaces are not connected
                                yet. No files or memories are added by this Home
                                screen.
                            </p>
                        </div>
                    </div>
                    <div className="home-settings-row">
                        <div>
                            <h2>Voice</h2>
                            <p>
                                Voice input is not connected. Read-aloud starts
                                only when you request it. The desktop microphone
                                preview measures volume only.
                            </p>
                        </div>
                    </div>
                    <div className="home-settings-row">
                        <div>
                            <h2>Read-aloud voice</h2>
                            <p>
                                Audio is audible to people nearby. No remote
                                voice fallback is allowed. Availability depends
                                on your browser and installed voices.
                            </p>
                        </div>
                        <select
                            aria-label="Read-aloud voice"
                            value={speechState.selected ?? ""}
                            disabled={!speechState.voices.length}
                            onChange={(e) => speech.select(e.target.value)}
                        >
                            {!speechState.voices.length && (
                                <option value="">
                                    No local voices available
                                </option>
                            )}
                            {speechState.voices.map((voice) => (
                                <option
                                    value={voice.voiceURI}
                                    key={voice.voiceURI}
                                >
                                    {voice.name} · {voice.lang}
                                </option>
                            ))}
                        </select>
                    </div>
                    <a href="/dashboard">Open service dashboard</a>
                </section>
            )}
            <footer className="home-footer">
                <span>OWNER-CONTROLLED · DEVELOPMENT</span>
                <a href="/conversation">Conversation diagnostics</a>
            </footer>
            <dialog
                ref={commandMenu}
                className="home-dialog"
                aria-labelledby="command-title"
                onClose={() => setQuery("")}
            >
                <div className="home-dialog-heading">
                    <h2 id="command-title">Go to</h2>
                    <button
                        onClick={() => commandMenu.current?.close()}
                        aria-label="Close menu"
                    >
                        ✕
                    </button>
                </div>
                <label className="home-sr-only" htmlFor="command-search">
                    Search destinations
                </label>
                <input
                    id="command-search"
                    placeholder="Find a destination…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                <div className="home-command-results">
                    {commands.map((item) => (
                        <button key={item.name} onClick={item.action}>
                            {item.name}
                            <span aria-hidden="true">↵</span>
                        </button>
                    ))}
                    {["Dashboard", "Account & devices"]
                        .filter((name) =>
                            name.toLowerCase().includes(query.toLowerCase()),
                        )
                        .map((name) => (
                            <a
                                key={name}
                                href={
                                    name === "Dashboard"
                                        ? "/dashboard"
                                        : identityHref
                                }
                            >
                                {name}
                            </a>
                        ))}
                    {!commands.length &&
                        !["Dashboard", "Account & devices"].some((name) =>
                            name.toLowerCase().includes(query.toLowerCase()),
                        ) && <p>No matching destination.</p>}
                </div>
            </dialog>
            <dialog
                ref={clearDialog}
                className="home-dialog"
                aria-labelledby="clear-title"
            >
                <h2 id="clear-title">Clear this page’s conversation?</h2>
                <p>
                    This removes the visible transcript and stops waiting for an
                    active request. It does not delete server records.
                </p>
                <div className="home-dialog-actions">
                    <button onClick={() => clearDialog.current?.close()}>
                        Keep conversation
                    </button>
                    <button
                        onClick={() => {
                            session.clear();
                            clearDialog.current?.close();
                            navigate("home");
                        }}
                    >
                        Clear page
                    </button>
                </div>
            </dialog>
        </main>
    );
}
