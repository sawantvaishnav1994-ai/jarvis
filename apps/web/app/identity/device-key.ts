"use client";
export type BrowserDevice = { privateKey: CryptoKey; publicKey: CryptoKey };
export function base64url(value: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(value)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}
function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const r = indexedDB.open("jarvis-device-v1", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("keys");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
export async function deviceKey(fresh = false): Promise<BrowserDevice> {
    const db = await database();
    try {
        if (!fresh) {
            const old = await new Promise<BrowserDevice | undefined>(
                (resolve, reject) => {
                    const r = db
                        .transaction("keys")
                        .objectStore("keys")
                        .get("active");
                    r.onsuccess = () => resolve(r.result);
                    r.onerror = () => reject(r.error);
                },
            );
            if (old) return old;
        }
        return (await crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-256" },
            false,
            ["sign", "verify"],
        )) as BrowserDevice;
    } finally {
        db.close();
    }
}
export async function saveDevice(
    key: BrowserDevice,
    id: string,
): Promise<void> {
    const db = await database();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction("keys", "readwrite");
            tx.objectStore("keys").put(key, "active");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        localStorage.setItem("jarvis-device-id", id);
    } finally {
        db.close();
    }
}
export async function deviceInput(key: BrowserDevice, name: string) {
    return {
        name,
        type: "browser",
        publicKey: base64url(
            await crypto.subtle.exportKey("spki", key.publicKey),
        ),
    };
}
export async function deviceProof(
    key: BrowserDevice,
    c: { challengeId: string; devicePayload: string },
) {
    return {
        challengeId: c.challengeId,
        signature: base64url(
            await crypto.subtle.sign(
                { name: "ECDSA", hash: "SHA-256" },
                key.privateKey,
                new TextEncoder().encode(c.devicePayload),
            ),
        ),
    };
}
