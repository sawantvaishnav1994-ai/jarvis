import { ConversationConsole } from "./conversation-console";

export default function ConversationPage() {
    return (
        <main>
            <header>
                <a className="wordmark" href="/">
                    JARVIS<span>CORE + CONVERSATION</span>
                </a>
                <span className="environment">GOVERNED SECURE CHAT</span>
            </header>
            <section className="intro conversation-intro">
                <p className="eyebrow">J1.13 / SECURE IPHONE + PWA ACCESS</p>
                <h1>
                    One governed conversation.
                    <br />
                    No client-side authority.
                </h1>
                <p className="lede">
                    Your browser signs the exact turn binding with the enrolled
                    device key. Session authority remains HttpOnly and every
                    protected action stays behind JARVIS policy and approval.
                </p>
            </section>
            <ConversationConsole />
        </main>
    );
}
