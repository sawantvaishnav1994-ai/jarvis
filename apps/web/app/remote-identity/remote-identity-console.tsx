"use client";

import { useState } from "react";
import {
    startAuthentication,
    startRegistration,
} from "@simplewebauthn/browser";
import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import {
    deviceInput,
    deviceKey,
    deviceProof,
    saveDevice,
} from "../identity/device-key";

type Challenge = {
    challengeId: string;
    devicePayload: string;
    options: unknown;
};

type Snapshot = {
    owner: { id: string; displayName: string };
    currentSession: { id: string; assurance: string };
    devices: { id: string; name: string; trust: string }[];
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

export function RemoteIdentityConsole() {
    const [claimCode, setClaimCode] = useState("");
    const [ownerName, setOwnerName] = useState("Owner");
    const [deviceName, setDeviceName] = useState("Primary iPhone");
    const [message, setMessage] = useState(
        "Ready for secure HTTPS passkey enrollment on this iPhone.",
    );
    const [busy, setBusy] = useState(false);
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

    async function run(work: () => Promise<void>) {
        setBusy(true);
        try {
            await work();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "REQUEST_DENIED");
        } finally {
            setBusy(false);
        }
    }

    async function refresh() {
        const key = await deviceKey();
        const c = await rpc<Challenge>("action.begin", {
            action: "identity.inspect",
            input: {},
        });
        const result = await rpc<Snapshot>("action.perform", {
            action: "identity.inspect",
            input: {},
            proof: await deviceProof(key, c),
        });
        setSnapshot(result);
    }

    async function createRootOwner() {
        if (!claimCode.trim()) throw new Error("INSTALLATION_CLAIM_CODE_REQUIRED");
        const key = await deviceKey();
        const device = await deviceInput(key, deviceName);
        const c = await rpc<Challenge>("root.begin", {
            bootstrap: claimCode,
            displayName: ownerName,
            device,
        });
        const response = await startRegistration({
            optionsJSON: c.options as PublicKeyCredentialCreationOptionsJSON,
        });
        const result = await rpc<{ deviceId: string; status: string }>(
            "register.finish",
            {
                kind: "root",
                proof: await deviceProof(key, c),
                response,
            },
        );
        await saveDevice(key, result.deviceId);
        setClaimCode("");
        setMessage("Root Owner created. This iPhone is now device-bound.");
        await refresh();
    }

    async function signIn() {
        const key = await deviceKey();
        const deviceId = localStorage.getItem("jarvis-device-id");
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
                {busy ? "Waiting for Face ID / passkey confirmation…" : message}
            </p>
            <section className="system">
                <h2>Remote owner setup</h2>
                <p>
                    For the first remote installation, reveal the value of
                    <code> JARVIS_REMOTE_IDENTITY_BOOTSTRAP </code>
                    in Railway on your own device, copy it into the field below,
                    and never paste it into ChatGPT, email, notes or source code.
                    JARVIS accepts it only for initial Root Owner creation.
                </p>
                <div className="identity-fields">
                    <label>
                        Owner display name
                        <input
                            value={ownerName}
                            onChange={(event) => setOwnerName(event.target.value)}
                            autoComplete="name"
                        />
                    </label>
                    <label>
                        Device name
                        <input
                            value={deviceName}
                            onChange={(event) => setDeviceName(event.target.value)}
                            autoComplete="off"
                        />
                    </label>
                    <label>
                        Installation claim code
                        <input
                            type="password"
                            value={claimCode}
                            onChange={(event) => setClaimCode(event.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </label>
                </div>
                <div className="identity-buttons">
                    <button disabled={busy} onClick={() => run(createRootOwner)}>
                        Create Root Owner on this iPhone
                    </button>
                    <button disabled={busy} onClick={() => run(signIn)}>
                        Sign in with Face ID / passkey
                    </button>
                    <a href="/conversation">Open governed conversation</a>
                </div>
            </section>
            {snapshot && (
                <section className="system">
                    <h2>{snapshot.owner.displayName}</h2>
                    <p>
                        Owner session verified · assurance{" "}
                        <strong>{snapshot.currentSession.assurance}</strong>
                    </p>
                    <h3>Devices</h3>
                    {snapshot.devices.map((device) => (
                        <article className="identity-row" key={device.id}>
                            <span>
                                {device.name} · <strong>{device.trust}</strong>
                            </span>
                            <code>{device.id}</code>
                        </article>
                    ))}
                </section>
            )}
        </div>
    );
}
