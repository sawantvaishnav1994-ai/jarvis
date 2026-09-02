import {
    createHash,
    generateKeyPairSync,
    randomBytes,
    sign,
} from "node:crypto";
import { encodeCBOR, type CBORType } from "@levischuck/tiny-cbor";
import {
    IdentityEngine,
    WebAuthnPasskeys,
    emptyIdentityState,
    digest,
    type IdentityState,
    type IdentityRepository,
    type SecurityEvent,
    type IdentityAction,
    type DeviceProof,
    type SecurityCommandHandler,
} from "@jarvis/identity";
import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
export class TestIdentityRepository implements IdentityRepository {
    state: IdentityState = emptyIdentityState();
    events: SecurityEvent[] = [];
    failAudit = false;
    private queue: Promise<void> = Promise.resolve();
    async transaction<T>(
        work: (state: IdentityState, events: SecurityEvent[]) => Promise<T>,
    ): Promise<T> {
        const previous = this.queue;
        let release!: () => void;
        this.queue = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            const state = structuredClone(this.state),
                events: SecurityEvent[] = [];
            const result = await work(state, events);
            if (this.failAudit) throw new Error("AUDIT_UNAVAILABLE");
            this.state = state;
            this.events.push(...events);
            return result;
        } finally {
            release();
        }
    }
    async audit(limit: number) {
        return structuredClone(this.events.slice(-limit).reverse());
    }
}
export class TestDevice {
    readonly deviceKey = generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
    });
    readonly passkey = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    readonly credential = randomBytes(32);
    counter = 0;
    userHandle = "";
    readonly input = {
        name: "Synthetic device",
        type: "laptop" as const,
        publicKey: this.deviceKey.publicKey
            .export({ format: "der", type: "spki" })
            .toString("base64url"),
    };
    proof(c: { challengeId: string; devicePayload: string }): DeviceProof {
        return {
            challengeId: c.challengeId,
            signature: sign("sha256", Buffer.from(c.devicePayload), {
                key: this.deviceKey.privateKey,
                dsaEncoding: "ieee-p1363",
            }).toString("base64url"),
        };
    }
    registration(
        raw: unknown,
        overrides: { origin?: string; uv?: boolean; challenge?: string } = {},
    ) {
        const options = raw as PublicKeyCredentialCreationOptionsJSON;
        this.userHandle = options.user.id;
        const clientDataJSON = Buffer.from(
            JSON.stringify({
                type: "webauthn.create",
                origin: overrides.origin ?? "http://localhost:3000",
                challenge: overrides.challenge ?? options.challenge,
                crossOrigin: false,
            }),
        ).toString("base64url");
        const jwk = this.passkey.publicKey.export({ format: "jwk" });
        const cose = encodeCBOR(
            new Map<number, CBORType>([
                [1, 2],
                [3, -7],
                [-1, 1],
                [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))],
                [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))],
            ]),
        );
        const length = Buffer.alloc(2);
        length.writeUInt16BE(this.credential.length);
        const authData = Buffer.concat([
            createHash("sha256").update("localhost").digest(),
            Buffer.from([overrides.uv === false ? 65 : 69]),
            Buffer.alloc(4),
            Buffer.alloc(16),
            length,
            this.credential,
            Buffer.from(cose),
        ]);
        const attestationObject = Buffer.from(
            encodeCBOR(
                new Map<string, CBORType>([
                    ["fmt", "none"],
                    ["attStmt", new Map()],
                    ["authData", new Uint8Array(authData)],
                ]),
            ),
        ).toString("base64url");
        return {
            id: this.credential.toString("base64url"),
            rawId: this.credential.toString("base64url"),
            type: "public-key" as const,
            clientExtensionResults: {},
            response: {
                clientDataJSON,
                attestationObject,
                transports: ["internal" as const],
            },
        };
    }
    assertion(
        raw: unknown,
        overrides: {
            origin?: string;
            uv?: boolean;
            challenge?: string;
            counter?: number;
        } = {},
    ) {
        const options = raw as PublicKeyCredentialRequestOptionsJSON;
        const client = Buffer.from(
            JSON.stringify({
                type: "webauthn.get",
                origin: overrides.origin ?? "http://localhost:3000",
                challenge: overrides.challenge ?? options.challenge,
                crossOrigin: false,
            }),
        );
        const count = Buffer.alloc(4);
        count.writeUInt32BE(overrides.counter ?? ++this.counter);
        const auth = Buffer.concat([
            createHash("sha256").update("localhost").digest(),
            Buffer.from([overrides.uv === false ? 1 : 5]),
            count,
        ]);
        const signature = sign(
            "sha256",
            Buffer.concat([auth, createHash("sha256").update(client).digest()]),
            this.passkey.privateKey,
        );
        return {
            id: this.credential.toString("base64url"),
            rawId: this.credential.toString("base64url"),
            type: "public-key" as const,
            clientExtensionResults: {},
            response: {
                clientDataJSON: client.toString("base64url"),
                authenticatorData: auth.toString("base64url"),
                signature: signature.toString("base64url"),
                userHandle: this.userHandle,
            },
        };
    }
}
export function fixture(
    repository: IdentityRepository = new TestIdentityRepository(),
    securityFactory?: (clock: () => number) => SecurityCommandHandler,
) {
    let now = Date.now();
    const bootstrap = randomBytes(32).toString("hex");
    const engine = new IdentityEngine(
        repository,
        new WebAuthnPasskeys("localhost", "http://localhost:3000"),
        digest(bootstrap),
        () => now,
        securityFactory?.(() => now),
    );
    return {
        engine,
        repository,
        bootstrap,
        advance: (ms: number) => {
            now += ms;
        },
    };
}
export type Login = {
    token: string;
    deviceId: string;
    ownerId: string;
    sessionId: string;
    assurance: string;
};
export async function root(
    f: ReturnType<typeof fixture>,
    device = new TestDevice(),
): Promise<{ device: TestDevice; session: Login }> {
    const c = await f.engine.beginRoot(
        f.bootstrap,
        "Synthetic Owner",
        device.input,
    );
    const result = await f.engine.finishRegistration(
        "root",
        device.proof(c),
        device.registration(c.options),
        "test-context",
    );
    return { device, session: result as Login };
}
export async function ownerAction(
    engine: IdentityEngine,
    device: TestDevice,
    session: Login,
    action: IdentityAction,
    input: unknown,
    stepUp = true,
): Promise<unknown> {
    let approvalId: string | undefined;
    if (stepUp) {
        const challenge = await engine.beginStepUp(
            session.token,
            action,
            input,
            "test-context",
        );
        approvalId = (
            await engine.finishStepUp(
                session.token,
                device.proof(challenge),
                device.assertion(challenge.options),
                "test-context",
            )
        ).approvalId;
    }
    const c = await engine.beginAction(
        session.token,
        action,
        input,
        "test-context",
    );
    return engine.perform(
        {
            token: session.token,
            ...device.proof(c),
            ...(approvalId ? { approvalId } : {}),
        },
        action,
        input,
        "test-context",
    );
}
export async function secondDevice(
    engine: IdentityEngine,
    owner: Awaited<ReturnType<typeof root>>,
    trust: "trusted" | "temporary" | "privileged" = "trusted",
) {
    const device = new TestDevice(),
        c = await engine.beginEnrollment(device.input);
    const pending = await engine.finishRegistration(
        "enroll",
        device.proof(c),
        device.registration(c.options),
        "test-context",
    );
    await ownerAction(engine, owner.device, owner.session, "device.approve", {
        deviceId: pending.deviceId,
        trust,
    });
    const login = await engine.beginLogin(pending.deviceId);
    const session = await engine.finishLogin(
        device.proof(login),
        device.assertion(login.options),
        "test-context",
    );
    return { device, session };
}
