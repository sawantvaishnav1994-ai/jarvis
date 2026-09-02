import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
    type RegistrationResponseJSON,
    type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { deny } from "./crypto.js";
import type { PasskeyRecord, ApprovalEvidence } from "./contracts.js";
export type {
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
} from "@simplewebauthn/server";
export interface PasskeyVerifier {
    registrationOptions(ownerId: string, challenge: string): Promise<unknown>;
    authenticationOptions(
        credentialIds: string[],
        challenge: string,
    ): Promise<unknown>;
    register(
        response: unknown,
        challenge: string,
    ): Promise<Omit<PasskeyRecord, "ownerId" | "deviceId" | "revoked">>;
    authenticate(
        response: unknown,
        challenge: string,
        credential: PasskeyRecord,
    ): Promise<number>;
    readonly rpID: string;
    readonly origin: string;
}
export class WebAuthnPasskeys implements PasskeyVerifier {
    constructor(
        readonly rpID: string,
        readonly origin: string,
    ) {
        const url = new URL(origin);
        if (
            url.hostname !== rpID ||
            (url.protocol !== "https:" &&
                !(url.protocol === "http:" && rpID === "localhost"))
        )
            deny("RP_CONFIGURATION_INVALID");
    }
    registrationOptions(ownerId: string, challenge: string) {
        return generateRegistrationOptions({
            rpName: "JARVIS",
            rpID: this.rpID,
            userID: new TextEncoder().encode(ownerId),
            userName: ownerId,
            challenge: new Uint8Array(Buffer.from(challenge, "base64url")),
            attestationType: "none",
            authenticatorSelection: {
                residentKey: "required",
                userVerification: "required",
            },
            supportedAlgorithmIDs: [-7, -257],
        });
    }
    authenticationOptions(ids: string[], challenge: string) {
        return generateAuthenticationOptions({
            rpID: this.rpID,
            challenge: new Uint8Array(Buffer.from(challenge, "base64url")),
            allowCredentials: ids.map((id) => ({ id })),
            userVerification: "required",
        });
    }
    async register(response: unknown, challenge: string) {
        const result = await verifyRegistrationResponse({
            response: response as RegistrationResponseJSON,
            expectedChallenge: challenge,
            expectedOrigin: this.origin,
            expectedRPID: this.rpID,
            requireUserVerification: true,
        });
        if (!result.verified || !result.registrationInfo?.userVerified)
            return deny("PASSKEY_INVALID");
        const { credential, credentialBackedUp, credentialDeviceType } =
            result.registrationInfo;
        return {
            id: credential.id,
            publicKey: Buffer.from(credential.publicKey).toString("base64url"),
            counter: credential.counter,
            backedUp: credentialBackedUp,
            deviceType: credentialDeviceType,
        };
    }
    async authenticate(
        response: unknown,
        challenge: string,
        credential: PasskeyRecord,
    ): Promise<number> {
        const result = await verifyAuthenticationResponse({
            response: response as AuthenticationResponseJSON,
            expectedChallenge: challenge,
            expectedOrigin: this.origin,
            expectedRPID: this.rpID,
            requireUserVerification: true,
            credential: {
                id: credential.id,
                publicKey: new Uint8Array(
                    Buffer.from(credential.publicKey, "base64url"),
                ),
                counter: credential.counter,
            },
        });
        if (!result.verified || !result.authenticationInfo.userVerified)
            return deny("PASSKEY_INVALID");
        return result.authenticationInfo.newCounter;
    }
}
export async function verifyApprovalEvidence(
    evidence: ApprovalEvidence,
): Promise<boolean> {
    try {
        const expected = Buffer.from(
            await import("node:crypto").then((c) =>
                c.createHash("sha256").update(evidence.envelope).digest(),
            ),
        ).toString("base64url");
        if (expected !== evidence.challenge) return false;
        const adapter = new WebAuthnPasskeys(evidence.rpID, evidence.origin);
        await adapter.authenticate(
            {
                id: evidence.credentialId,
                rawId: evidence.credentialId,
                type: "public-key",
                clientExtensionResults: {},
                response: {
                    authenticatorData: evidence.authenticatorData,
                    clientDataJSON: evidence.clientDataJSON,
                    signature: evidence.signature,
                },
            },
            evidence.challenge,
            {
                id: evidence.credentialId,
                publicKey: evidence.credentialPublicKey,
                counter: evidence.counterBefore,
                ownerId: "evidence",
                deviceId: "evidence",
                revoked: false,
                backedUp: false,
                deviceType: "singleDevice",
            },
        );
        return true;
    } catch {
        return false;
    }
}
