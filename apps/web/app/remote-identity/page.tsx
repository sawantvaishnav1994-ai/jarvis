import { RemoteIdentityConsole } from "./remote-identity-console";

export default function RemoteIdentityPage() {
    return (
        <main>
            <header>
                <a className="wordmark" href="/">
                    JARVIS<span>REMOTE IDENTITY</span>
                </a>
                <span className="environment">SECURE HTTPS OWNER CONTROL</span>
            </header>
            <section className="intro">
                <p className="eyebrow">J1.13 / IPHONE &amp; DEVICE TRUST</p>
                <h1>
                    Enroll this iPhone.
                    <br />
                    Keep authority server-side.
                </h1>
                <p className="lede">
                    Face ID/passkeys verify you. A non-exportable P-256 device
                    key binds this Safari installation to JARVIS. No service,
                    database or runtime credential is placed in the browser.
                </p>
            </section>
            <RemoteIdentityConsole />
        </main>
    );
}
