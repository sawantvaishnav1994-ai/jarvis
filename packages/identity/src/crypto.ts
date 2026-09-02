import {
    createHash,
    createHmac,
    randomBytes,
    createPublicKey,
    verify,
    timingSafeEqual,
    createCipheriv,
    createDecipheriv,
    hkdfSync,
} from "node:crypto";
import { BoundaryError } from "@jarvis/shared";
export class IdentityFault extends BoundaryError {}
export const deny = (code: string): never => {
    throw new IdentityFault(code);
};
export const digest = (value: string): string =>
    createHash("sha256").update(value).digest("hex");
export const secret = (): string => randomBytes(32).toString("base64url");
export function constantEqual(a: string, b: string): boolean {
    const aa = Buffer.from(a),
        bb = Buffer.from(b);
    return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function canonical(value: unknown): string {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    return (
        "{" +
        Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
            .join(",") +
        "}"
    );
}
export function validateDeviceKey(value: string): void {
    try {
        const key = createPublicKey({
            key: Buffer.from(value, "base64url"),
            format: "der",
            type: "spki",
        });
        if (
            key.asymmetricKeyType !== "ec" ||
            key.asymmetricKeyDetails?.namedCurve !== "prime256v1" ||
            key
                .export({ format: "der", type: "spki" })
                .toString("base64url") !== value
        )
            deny("DEVICE_KEY_INVALID");
    } catch {
        deny("DEVICE_KEY_INVALID");
    }
}
export function verifyDevice(
    key: string,
    payload: string,
    signature: string,
): void {
    try {
        validateDeviceKey(key);
        if (
            !verify(
                "sha256",
                Buffer.from(payload),
                {
                    key: createPublicKey({
                        key: Buffer.from(key, "base64url"),
                        type: "spki",
                        format: "der",
                    }),
                    dsaEncoding: "ieee-p1363",
                },
                Buffer.from(signature, "base64url"),
            )
        )
            deny("DEVICE_PROOF_INVALID");
    } catch {
        deny("DEVICE_PROOF_INVALID");
    }
}
export function sealRecovery(value: unknown, keyText: string): string {
    const salt = randomBytes(32),
        nonce = randomBytes(12);
    const key = Buffer.from(
        hkdfSync(
            "sha256",
            Buffer.from(keyText, "base64url"),
            salt,
            "jarvis.identity.recovery.v1",
            32,
        ),
    );
    try {
        const cipher = createCipheriv("aes-256-gcm", key, nonce);
        cipher.setAAD(Buffer.from("jarvis.identity.recovery.v1"));
        const encrypted = Buffer.concat([
            cipher.update(canonical(value)),
            cipher.final(),
        ]);
        return Buffer.from(
            JSON.stringify({
                version: 1,
                salt: salt.toString("base64url"),
                nonce: nonce.toString("base64url"),
                tag: cipher.getAuthTag().toString("base64url"),
                data: encrypted.toString("base64url"),
            }),
        ).toString("base64url");
    } finally {
        key.fill(0);
    }
}
export function openRecovery(packageText: string, keyText: string): unknown {
    try {
        if (packageText.length > 16000 || !/^[A-Za-z0-9_-]{43}$/.test(keyText))
            deny("RECOVERY_INVALID");
        const b = JSON.parse(Buffer.from(packageText, "base64url").toString());
        if (b.version !== 1) deny("RECOVERY_INVALID");
        const key = Buffer.from(
            hkdfSync(
                "sha256",
                Buffer.from(keyText, "base64url"),
                Buffer.from(b.salt, "base64url"),
                "jarvis.identity.recovery.v1",
                32,
            ),
        );
        try {
            const decipher = createDecipheriv(
                "aes-256-gcm",
                key,
                Buffer.from(b.nonce, "base64url"),
            );
            decipher.setAAD(Buffer.from("jarvis.identity.recovery.v1"));
            decipher.setAuthTag(Buffer.from(b.tag, "base64url"));
            return JSON.parse(
                Buffer.concat([
                    decipher.update(Buffer.from(b.data, "base64url")),
                    decipher.final(),
                ]).toString(),
            );
        } finally {
            key.fill(0);
        }
    } catch {
        return deny("RECOVERY_INVALID");
    }
}
export type ServiceProof = {
    version: 1;
    serviceId: string;
    timestamp: number;
    nonce: string;
    signature: string;
};
export function signService(
    key: Buffer,
    serviceId: string,
    operation: string,
    body: string,
    now = Date.now(),
): ServiceProof {
    const proof = {
        version: 1 as const,
        serviceId,
        timestamp: now,
        nonce: secret(),
    };
    return {
        ...proof,
        signature: createHmac("sha256", key)
            .update(canonical({ ...proof, operation, bodyHash: digest(body) }))
            .digest("base64url"),
    };
}
export function verifyService(
    key: Buffer,
    proof: ServiceProof,
    operation: string,
    body: string,
    now = Date.now(),
): void {
    if (
        proof.version !== 1 ||
        !Number.isSafeInteger(proof.timestamp) ||
        Math.abs(now - proof.timestamp) > 30000 ||
        !/^[A-Za-z0-9_-]{43}$/.test(proof.nonce)
    )
        deny("SERVICE_PROOF_INVALID");
    const signature = createHmac("sha256", key)
        .update(
            canonical({
                version: 1,
                serviceId: proof.serviceId,
                timestamp: proof.timestamp,
                nonce: proof.nonce,
                operation,
                bodyHash: digest(body),
            }),
        )
        .digest("base64url");
    if (!constantEqual(signature, proof.signature))
        deny("SERVICE_PROOF_INVALID");
}
