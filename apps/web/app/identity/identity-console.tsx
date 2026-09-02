"use client";
import { useState } from "react";
import {
    startRegistration,
    startAuthentication,
} from "@simplewebauthn/browser";
import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import {
    deviceKey,
    deviceInput,
    deviceProof,
    saveDevice,
    type BrowserDevice,
} from "./device-key";
type Challenge = {
    challengeId: string;
    devicePayload: string;
    options: unknown;
};
type Device = { id: string; name: string; trust: string };
type Snapshot = {
    owner: { id: string; displayName: string };
    currentSession: { id: string; assurance: string };
    devices: Device[];
    sessions: { id: string; deviceId: string; revoked: boolean }[];
    audit: {
        id: string;
        type: string;
        operation: string;
        outcome: string;
        code: string;
    }[];
};
type SecuritySnapshot = {
    controls: { flags: string[]; epoch: number };
    approvals: Record<
        string,
        {
            id: string;
            status: string;
            requestHash: string;
            request: object;
            risk: { level: string };
            explanation: {
                action: string;
                requestedBy: string;
                target: string;
                changes: string;
                why: string;
                reversibility: string;
                impact: string;
                capability: string;
                zone: string;
                authenticationRequired: string;
                expiresAt: number;
            };
        }
    >;
};
async function rpc<T>(method: string, params: object): Promise<T> {
    const response = await fetch("/api/identity", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method, params }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "REQUEST_DENIED");
    return data.result as T;
}
export function IdentityConsole() {
    const [bootstrap, setBootstrap] = useState(""),
        [name, setName] = useState("Owner"),
        [deviceName, setDeviceName] = useState("Primary browser"),
        [message, setMessage] = useState(
            "Locked. Use localhost, not the IP address, for passkeys.",
        ),
        [busy, setBusy] = useState(false),
        [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [agent, setAgent] = useState<{
            key: BrowserDevice;
            subjectId: string;
            capability?: string;
        } | null>(null),
        [kit, setKit] = useState<{
            package: string;
            recoveryKey: string;
            ownerId: string;
        } | null>(null);
    const [recoveryPackage, setRecoveryPackage] = useState(""),
        [recoveryKey, setRecoveryKey] = useState(""),
        [recoveryOwner, setRecoveryOwner] = useState("");
    const [security, setSecurity] = useState<SecuritySnapshot | null>(null),
        [securityCommand, setSecurityCommand] = useState(
            '{"command":"inspect","data":{}}',
        ),
        [agentCommand, setAgentCommand] = useState(
            '{"command":"request","data":{}}',
        ),
        [securityResult, setSecurityResult] = useState("");
    const [securityAgent, setSecurityAgent] = useState<{
        key: BrowserDevice;
        subjectId: string;
    } | null>(null);
    async function run(work: () => Promise<void>) {
        setBusy(true);
        try {
            await work();
        } catch (error) {
            if (
                error instanceof Error &&
                [
                    "SESSION_INVALID",
                    "SESSION_EXPIRED",
                    "DEVICE_NOT_TRUSTED",
                    "REAUTHENTICATION_REQUIRED",
                ].includes(error.message)
            ) {
                setSnapshot(null);
                setKit(null);
                setAgent(null);
                setSecurity(null);
                setSecurityResult("");
                setSecurityAgent(null);
            }
            setMessage(
                error instanceof Error ? error.message : "REQUEST_DENIED",
            );
        } finally {
            setBusy(false);
        }
    }
    async function action<T>(
        operation: string,
        input: object,
        stepUp = true,
    ): Promise<T> {
        const key = await deviceKey();
        let approvalId: string | undefined;
        if (stepUp) {
            const c = await rpc<Challenge>("stepup.begin", {
                action: operation,
                input,
            });
            const response = await startAuthentication({
                optionsJSON: c.options as PublicKeyCredentialRequestOptionsJSON,
            });
            approvalId = (
                await rpc<{ approvalId: string }>("stepup.finish", {
                    proof: await deviceProof(key, c),
                    response,
                })
            ).approvalId;
        }
        const c = await rpc<Challenge>("action.begin", {
            action: operation,
            input,
        });
        return rpc<T>("action.perform", {
            action: operation,
            input,
            proof: await deviceProof(key, c),
            ...(approvalId ? { approvalId } : {}),
        });
    }
    async function refresh() {
        setSnapshot(await action<Snapshot>("identity.inspect", {}, false));
    }
    async function refreshSecurity() {
        setSecurity(
            await action<SecuritySnapshot>("security.inspect", {}, false),
        );
    }
    async function register(kind: "root" | "enroll" | "recovery") {
        const key = await deviceKey(kind === "recovery"),
            device = await deviceInput(key, deviceName);
        const c = await rpc<Challenge>(
            kind === "root"
                ? "root.begin"
                : kind === "enroll"
                  ? "enroll.begin"
                  : "recovery.begin",
            kind === "root"
                ? { bootstrap, displayName: name, device }
                : kind === "enroll"
                  ? { device }
                  : {
                        package: recoveryPackage,
                        recoveryKey,
                        ownerId: recoveryOwner,
                        bootstrap,
                        device,
                    },
        );
        const response = await startRegistration({
            optionsJSON: c.options as PublicKeyCredentialCreationOptionsJSON,
        });
        const result = await rpc<{ deviceId: string; status: string }>(
            "register.finish",
            { kind, proof: await deviceProof(key, c), response },
        );
        await saveDevice(key, result.deviceId);
        setBootstrap("");
        setRecoveryKey("");
        if (result.status === "approval-required")
            setMessage(
                "Enrollment requested: approve this device from an existing owner session.",
            );
        else {
            setMessage(
                kind === "recovery"
                    ? "Owner recovered; previous device authority revoked."
                    : "Root Owner created.",
            );
            await refresh();
        }
    }
    async function login() {
        const key = await deviceKey(),
            deviceId = localStorage.getItem("jarvis-device-id");
        if (!deviceId) throw new Error("ENROLL_DEVICE_FIRST");
        const c = await rpc<Challenge>("login.begin", { deviceId });
        const response = await startAuthentication({
            optionsJSON: c.options as PublicKeyCredentialRequestOptionsJSON,
        });
        await rpc("login.finish", {
            proof: await deviceProof(key, c),
            response,
        });
        setMessage("Authenticated with passkey and device proof.");
        await refresh();
    }
    return (
        <div className="identity-console">
            <p role="status" aria-live="polite">
                {busy ? "Waiting for secure confirmation…" : message}
            </p>
            <section className="system">
                <h2>Owner access</h2>
                <p>
                    First installation: run{" "}
                    <code>npm run identity:bootstrap</code> in your local
                    terminal. Never share its claim code.
                </p>
                <div className="identity-fields">
                    <label>
                        Owner display name
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </label>
                    <label>
                        Device name
                        <input
                            value={deviceName}
                            onChange={(e) => setDeviceName(e.target.value)}
                        />
                    </label>
                    <label>
                        Installation claim code
                        <input
                            type="password"
                            autoComplete="off"
                            value={bootstrap}
                            onChange={(e) => setBootstrap(e.target.value)}
                        />
                    </label>
                </div>
                <div className="identity-buttons">
                    <button
                        disabled={busy}
                        onClick={() => run(() => register("root"))}
                    >
                        Create Root Owner
                    </button>
                    <button disabled={busy} onClick={() => run(login)}>
                        Sign in with passkey
                    </button>
                    <button
                        disabled={busy}
                        onClick={() => run(() => register("enroll"))}
                    >
                        Request device enrollment
                    </button>
                    <button
                        disabled={busy}
                        onClick={() =>
                            run(async () => {
                                await refresh();
                                setMessage("Owner session verified.");
                            })
                        }
                    >
                        Refresh owner session
                    </button>
                </div>
            </section>
            {snapshot && (
                <>
                    <section className="system">
                        <h2>{snapshot.owner.displayName}</h2>
                        <p>
                            Owner ID:{" "}
                            <code data-testid="owner-id">
                                {snapshot.owner.id}
                            </code>{" "}
                            · Assurance {snapshot.currentSession.assurance}
                        </p>
                        <h3>Devices</h3>
                        {snapshot.devices.map((d) => (
                            <article className="identity-row" key={d.id}>
                                <span>
                                    {d.name} · <strong>{d.trust}</strong>
                                </span>
                                <code>{d.id}</code>
                                {d.trust === "unknown" && (
                                    <button
                                        disabled={busy}
                                        onClick={() =>
                                            run(async () => {
                                                await action("device.approve", {
                                                    deviceId: d.id,
                                                    trust: "trusted",
                                                });
                                                await refresh();
                                                setMessage("Device approved.");
                                            })
                                        }
                                    >
                                        Approve {d.name}
                                    </button>
                                )}
                                {!["unknown", "revoked"].includes(d.trust) && (
                                    <button
                                        disabled={busy}
                                        onClick={() =>
                                            run(async () => {
                                                await action("device.revoke", {
                                                    deviceId: d.id,
                                                });
                                                setMessage("Device revoked.");
                                                await refresh();
                                            })
                                        }
                                    >
                                        Revoke {d.name}
                                    </button>
                                )}
                                {d.trust === "unknown" && (
                                    <button
                                        disabled={busy}
                                        onClick={() =>
                                            run(async () => {
                                                await action("device.approve", {
                                                    deviceId: d.id,
                                                    trust: "privileged",
                                                });
                                                await refresh();
                                                setMessage(
                                                    "Privileged device approved; it can manage identity after fresh passkey confirmation.",
                                                );
                                            })
                                        }
                                    >
                                        Approve privileged {d.name}
                                    </button>
                                )}
                            </article>
                        ))}
                        <p>
                            {snapshot.sessions.filter((s) => !s.revoked).length}{" "}
                            non-revoked sessions
                        </p>
                        <button
                            disabled={busy}
                            onClick={() =>
                                run(async () => {
                                    await action("session.revoke", {
                                        exceptCurrent: true,
                                    });
                                    await refresh();
                                    setMessage("Other sessions revoked.");
                                })
                            }
                        >
                            Log out all other sessions
                        </button>
                    </section>
                    <section className="system">
                        <h2>Restricted agent demonstration</h2>
                        <p>
                            Separate ephemeral agent key. One synthetic
                            repository; no real files or external tools.
                        </p>
                        <div className="identity-buttons">
                            <button
                                disabled={busy}
                                onClick={() =>
                                    run(async () => {
                                        const key = await deviceKey(true),
                                            publicKey = (
                                                await deviceInput(key, "Agent")
                                            ).publicKey;
                                        const result = await action<{
                                            subjectId: string;
                                        }>("subject.create", {
                                            name: "Developer mock",
                                            kind: "agent",
                                            publicKey,
                                            scopes: ["mock.read"],
                                            resources: ["repository-x"],
                                        });
                                        setAgent({
                                            key,
                                            subjectId: result.subjectId,
                                        });
                                        setMessage(
                                            "Restricted agent created; no delegated token yet.",
                                        );
                                        await refresh();
                                    })
                                }
                            >
                                Create restricted mock agent
                            </button>
                            <button
                                disabled={busy || !agent}
                                onClick={() =>
                                    run(async () => {
                                        const cap = await action<{
                                            token: string;
                                        }>("delegation.issue", {
                                            subjectId: agent!.subjectId,
                                            scope: "mock.read",
                                            resource: "repository-x",
                                            ttlSeconds: 60,
                                        });
                                        setAgent({
                                            ...agent!,
                                            capability: cap.token,
                                        });
                                        setMessage(
                                            "One mock-read permission delegated for at most 60 seconds.",
                                        );
                                        await refresh();
                                    })
                                }
                            >
                                Delegate mock read
                            </button>
                            {["mock.read", "mock.write"].map((scope) => (
                                <button
                                    key={scope}
                                    disabled={busy || !agent?.capability}
                                    onClick={() =>
                                        run(async () => {
                                            const params = {
                                                capability: agent!.capability,
                                                scope,
                                                resource: "repository-x",
                                            };
                                            const c = await rpc<Challenge>(
                                                "delegated.begin",
                                                params,
                                            );
                                            await rpc("delegated.perform", {
                                                ...params,
                                                proof: await deviceProof(
                                                    agent!.key,
                                                    c,
                                                ),
                                            });
                                            setMessage(
                                                "Permitted mock action completed.",
                                            );
                                            await refresh();
                                        })
                                    }
                                >
                                    {scope === "mock.read"
                                        ? "Run permitted mock read"
                                        : "Attempt forbidden mock write"}
                                </button>
                            ))}
                            <button
                                disabled={busy}
                                onClick={() =>
                                    run(async () => {
                                        await action(
                                            "critical.confirm",
                                            {},
                                            false,
                                        );
                                    })
                                }
                            >
                                Test critical-action denial
                            </button>
                        </div>
                    </section>
                    <section className="system">
                        <h2>J0.3 Security control</h2>
                        <p>
                            Deterministic development controls. All tools here
                            are synthetic; no real deployment or financial
                            integration is connected.
                        </p>
                        <button
                            disabled={busy}
                            onClick={() =>
                                run(async () => {
                                    await refreshSecurity();
                                    setMessage("Security state loaded.");
                                })
                            }
                        >
                            Refresh security state
                        </button>
                        <button
                            disabled={busy}
                            onClick={() =>
                                run(async () => {
                                    const key = await deviceKey(true),
                                        publicKey = (
                                            await deviceInput(
                                                key,
                                                "J0.3 Developer",
                                            )
                                        ).publicKey;
                                    const result = await action<{
                                        subjectId: string;
                                    }>("subject.create", {
                                        name: "J0.3 Developer",
                                        kind: "agent",
                                        publicKey,
                                        scopes: [],
                                        resources: [],
                                    });
                                    setSecurityAgent({
                                        key,
                                        subjectId: result.subjectId,
                                    });
                                    setMessage(
                                        "J0.3 Developer created without permissions.",
                                    );
                                })
                            }
                        >
                            Create J0.3 Developer
                        </button>
                        {securityAgent && (
                            <p>
                                Developer identity:{" "}
                                <code data-testid="developer-id">
                                    {securityAgent.subjectId}
                                </code>
                            </p>
                        )}
                        <label>
                            Owner security command (JSON)
                            <textarea
                                value={securityCommand}
                                onChange={(e) =>
                                    setSecurityCommand(e.target.value)
                                }
                            />
                        </label>
                        <button
                            disabled={busy}
                            onClick={() =>
                                run(async () => {
                                    const result = await action(
                                        "security.command",
                                        JSON.parse(securityCommand),
                                    );
                                    setSecurityResult(JSON.stringify(result));
                                    await refreshSecurity();
                                    await refresh();
                                    setMessage("Security command completed.");
                                })
                            }
                        >
                            Run owner security command
                        </button>
                        <label>
                            Governed agent command (JSON)
                            <textarea
                                value={agentCommand}
                                onChange={(e) =>
                                    setAgentCommand(e.target.value)
                                }
                            />
                        </label>
                        <button
                            disabled={busy || !securityAgent}
                            onClick={() =>
                                run(async () => {
                                    const input = JSON.parse(agentCommand),
                                        params = {
                                            subjectId: securityAgent!.subjectId,
                                            input,
                                        };
                                    const c = await rpc<Challenge>(
                                        "security.subject.begin",
                                        params,
                                    );
                                    const result = await rpc(
                                        "security.subject.perform",
                                        {
                                            ...params,
                                            proof: await deviceProof(
                                                securityAgent!.key,
                                                c,
                                            ),
                                        },
                                    );
                                    setSecurityResult(JSON.stringify(result));
                                    await refreshSecurity();
                                    await refresh();
                                    setMessage(
                                        "Governed agent command completed.",
                                    );
                                })
                            }
                        >
                            Run governed agent command
                        </button>
                        <pre data-testid="security-result">
                            {securityResult}
                        </pre>
                        {security && (
                            <>
                                <p data-testid="security-flags">
                                    {security.controls.flags.join(", ") ||
                                        "NORMAL"}
                                </p>
                                {[true, false].map((active) => (
                                    <button
                                        key={String(active)}
                                        disabled={busy}
                                        onClick={() =>
                                            run(async () => {
                                                await action(
                                                    "security.command",
                                                    {
                                                        command: "controls.set",
                                                        data: {
                                                            flag: "SECURITY_LOCKDOWN",
                                                            active,
                                                        },
                                                    },
                                                );
                                                await refreshSecurity();
                                                await refresh();
                                                setMessage(
                                                    active
                                                        ? "Security lockdown activated."
                                                        : "Security lockdown released.",
                                                );
                                            })
                                        }
                                    >
                                        {active
                                            ? "Activate security lockdown"
                                            : "Release security lockdown"}
                                    </button>
                                ))}
                                {Object.values(security.approvals)
                                    .filter((a) => a.status === "pending")
                                    .map((a) => (
                                        <article
                                            key={a.id}
                                            data-testid={`approval-${a.id}`}
                                        >
                                            <h3>
                                                {a.explanation.action} —{" "}
                                                {a.risk.level}
                                            </h3>
                                            <dl>
                                                {Object.entries(
                                                    a.explanation,
                                                ).map(([key, value]) => (
                                                    <div key={key}>
                                                        <dt>{key}</dt>
                                                        <dd>{String(value)}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                            <details>
                                                <summary>
                                                    View exact action details
                                                </summary>
                                                <pre>
                                                    {JSON.stringify(
                                                        a.request,
                                                        null,
                                                        2,
                                                    )}
                                                </pre>
                                            </details>
                                            {(["approve", "deny"] as const).map(
                                                (decision) => (
                                                    <button
                                                        key={decision}
                                                        disabled={busy}
                                                        onClick={() =>
                                                            run(async () => {
                                                                await action(
                                                                    "security.command",
                                                                    {
                                                                        command:
                                                                            "approval.decide",
                                                                        data: {
                                                                            version: 1,
                                                                            approvalId:
                                                                                a.id,
                                                                            requestHash:
                                                                                a.requestHash,
                                                                            decision,
                                                                        },
                                                                    },
                                                                );
                                                                await refreshSecurity();
                                                                await refresh();
                                                                setMessage(
                                                                    decision ===
                                                                        "approve"
                                                                        ? "Exact action approved."
                                                                        : "Action denied.",
                                                                );
                                                            })
                                                        }
                                                    >
                                                        {decision === "approve"
                                                            ? "Approve exact action with passkey"
                                                            : "Deny exact action"}
                                                    </button>
                                                ),
                                            )}
                                        </article>
                                    ))}
                            </>
                        )}
                    </section>
                    <section className="system">
                        <h2>Offline identity recovery kit</h2>
                        <p>
                            This restores identity authority only, not your data
                            or encryption vault. Keep the package and recovery
                            key in separate offline locations.
                        </p>
                        <button
                            disabled={busy}
                            onClick={() =>
                                run(async () => {
                                    setKit(
                                        await action("recovery.prepare", {}),
                                    );
                                    setMessage(
                                        "Recovery kit created. Store both parts separately; a new kit invalidates older ones.",
                                    );
                                    await refresh();
                                })
                            }
                        >
                            Create recovery kit
                        </button>
                        {kit && (
                            <div className="identity-fields">
                                <label>
                                    Encrypted recovery package
                                    <textarea
                                        aria-label="Encrypted recovery package"
                                        readOnly
                                        value={kit.package}
                                    />
                                </label>
                                <label>
                                    Offline recovery key
                                    <input
                                        aria-label="Offline recovery key"
                                        readOnly
                                        type="password"
                                        value={kit.recoveryKey}
                                    />
                                </label>
                                <label>
                                    Recovery owner ID
                                    <input readOnly value={kit.ownerId} />
                                </label>
                                <button
                                    onClick={() => {
                                        const blob = new Blob(
                                            [
                                                JSON.stringify({
                                                    ownerId: kit.ownerId,
                                                    package: kit.package,
                                                }),
                                            ],
                                            { type: "application/json" },
                                        );
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download =
                                            "jarvis-identity-recovery.json";
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                >
                                    Download encrypted package
                                </button>
                                <button
                                    onClick={() =>
                                        navigator.clipboard.writeText(
                                            kit.recoveryKey,
                                        )
                                    }
                                >
                                    Copy separate recovery key
                                </button>
                                <button onClick={() => setKit(null)}>
                                    Hide recovery material
                                </button>
                            </div>
                        )}
                    </section>
                    <section className="system">
                        <h2>Security audit</h2>
                        <div className="identity-audit">
                            {snapshot.audit.map((e) => (
                                <p key={e.id}>
                                    {e.type} · {e.operation} · {e.outcome}
                                    {e.outcome === "denied"
                                        ? " · " + e.code
                                        : ""}
                                </p>
                            ))}
                        </div>
                    </section>
                </>
            )}
            <details className="system">
                <summary>Recover owner authority</summary>
                <p>
                    Explicit recovery revokes old devices, passkeys, sessions,
                    subjects and delegations. You must register a fresh passkey
                    and device key. A clean installation also requires its local
                    claim code.
                </p>
                <div className="identity-fields">
                    <label>
                        Recovery package
                        <textarea
                            value={recoveryPackage}
                            onChange={(e) => setRecoveryPackage(e.target.value)}
                        />
                    </label>
                    <label>
                        Recovery key
                        <input
                            type="password"
                            autoComplete="off"
                            value={recoveryKey}
                            onChange={(e) => setRecoveryKey(e.target.value)}
                        />
                    </label>
                    <label>
                        Expected owner ID
                        <input
                            value={recoveryOwner}
                            onChange={(e) => setRecoveryOwner(e.target.value)}
                        />
                    </label>
                </div>
                <button
                    disabled={busy}
                    onClick={() => run(() => register("recovery"))}
                >
                    Recover owner with new device key
                </button>
            </details>
        </div>
    );
}
