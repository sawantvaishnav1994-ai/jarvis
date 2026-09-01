import { HealthSchema, type Health } from "@jarvis/shared";
import { resolve } from "node:path";
import { loadConfig, requireDevelopment } from "@jarvis/config";
export const dynamic = "force-dynamic";
async function status(): Promise<Health | null> {
    try {
        const config = await loadConfig(
            process.env.JARVIS_CONFIG ??
                resolve(process.cwd(), "../../config/development.json"),
        );
        requireDevelopment(config);
        const response = await fetch(
            `http://${config.api.host}:${config.api.port}/health/ready`,
            { cache: "no-store", signal: AbortSignal.timeout(2000) },
        );
        const parsed = HealthSchema.safeParse(await response.json());
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}
export default async function Page() {
    const health = await status();
    const ready = health?.status === "ok";
    return (
        <main>
            <header>
                <a className="wordmark" href="/">
                    JARVIS<span>FOUNDATION</span>
                </a>
                <span className="environment">LOCAL DEVELOPMENT</span>
            </header>
            <section className="intro">
                <p className="eyebrow">J0.1 / ENGINEERING FOUNDATION</p>
                <h1>
                    A permanent home
                    <br />
                    for your intelligence.
                </h1>
                <p className="lede">
                    One owner-controlled core. Replaceable models, storage and
                    interfaces.
                </p>
            </section>
            <section className="system" aria-labelledby="system-title">
                <div className="section-heading">
                    <h2 id="system-title">System status</h2>
                    <span className={ready ? "status good" : "status waiting"}>
                        {ready
                            ? "Foundation services ready"
                            : "Waiting for services"}
                    </span>
                </div>
                <div className="grid">
                    {[
                        ["API", "api"],
                        ["Database", "database"],
                        ["Event queue", "queue"],
                        ["Worker", "worker"],
                    ].map(([label, key]) => {
                        const ok =
                            key === "api"
                                ? health !== null
                                : health?.checks[key ?? ""] === true;
                        return (
                            <article key={key}>
                                <span className={ok ? "dot online" : "dot"} />
                                <h3>{label}</h3>
                                <p>{ok ? "Available" : "Unavailable"}</p>
                            </article>
                        );
                    })}
                </div>
            </section>
            <section className="next">
                <div>
                    <p className="eyebrow">NEXT MILESTONE</p>
                    <h2>Owner identity &amp; device trust</h2>
                    <p>
                        Authentication comes before personal memory or powerful
                        tools.
                    </p>
                </div>
                <span className="tag">J0.2</span>
            </section>
            <footer>
                <span>Interface skeleton · v0.3.0</span>
                <span>Personal data and external actions are disabled.</span>
            </footer>
        </main>
    );
}
