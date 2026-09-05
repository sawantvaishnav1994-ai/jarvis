import { IdentityConsole } from "./identity-console";

export default function IdentityPage() {
    return (
        <main>
            <header>
                <a className="wordmark" href="/">
                    JARVIS<span>IDENTITY FOUNDATION</span>
                </a>
                <span className="environment">OWNER CONTROL</span>
            </header>
            <section className="intro">
                <p className="eyebrow">J0.2 / IDENTITY &amp; DEVICE TRUST</p>
                <h1>
                    Your authority.
                    <br />
                    Cryptographically verified.
                </h1>
                <p className="lede">
                    Passkeys verify you. Device keys bind each request to this
                    browser. Powerful tools and private memory remain disabled.
                </p>
                <p>
                    After authentication, return directly to the governed JARVIS
                    conversation on this same browser.
                </p>
                <p>
                    <a href="/conversation">Open governed conversation</a>
                </p>
            </section>
            <IdentityConsole />
        </main>
    );
}
