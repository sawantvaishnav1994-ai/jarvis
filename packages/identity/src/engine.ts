import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { IdentifierSchema } from "@jarvis/shared";
import {
    ActionSchema,
    ActionInputSchemas,
    DeviceInputSchema,
    type IdentityRepository,
    type IdentityState,
    type SecurityEvent,
    type ChallengeRecord,
    type DeviceInput,
    type SessionRecord,
    type SessionProof,
    type DeviceProof,
    type IdentityAction,
    type ApprovalEvidence,
    type SubjectRecord,
    type OwnerProfile,
    type SecurityCommandHandler,
} from "./contracts.js";
import {
    canonical,
    digest,
    secret,
    constantEqual,
    validateDeviceKey,
    verifyDevice,
    deny,
    IdentityFault,
    sealRecovery,
    openRecovery,
    verifyService,
    type ServiceProof,
} from "./crypto.js";
import type {
    PasskeyVerifier,
    AuthenticationResponseJSON,
} from "./passkeys.js";

const RecoverySchema = z.strictObject({
    version: z.literal(1),
    owner: z.strictObject({
        id: z.string().regex(/^owner_[a-f0-9-]{36}$/),
        displayName: z.string().min(1).max(80),
        createdAt: z.number(),
        ownershipVersion: z.literal(1),
        epoch: z.number().int().positive(),
        recoveryHash: z.string(),
        recoveryGeneration: z.number().int().positive(),
    }),
    rpID: z.string(),
    origin: z.string(),
});
const sensitive = new Set<IdentityAction>([
    "device.approve",
    "device.revoke",
    "session.revoke",
    "subject.create",
    "delegation.issue",
    "recovery.prepare",
    "security.command",
]);
type Transaction = {
    state: IdentityState;
    events: SecurityEvent[];
    actorId: string;
    deviceId: string | null;
    assurance: "A0" | "A1" | "A2";
};
export class IdentityEngine {
    constructor(
        readonly repository: IdentityRepository,
        readonly passkeys: PasskeyVerifier,
        private readonly bootstrapHash: string,
        private readonly clock: () => number = Date.now,
        private readonly securityCommands?: SecurityCommandHandler,
    ) {}
    private event(
        tx: Transaction,
        type: string,
        operation: string,
        subjectId: string | null = null,
        approval: ApprovalEvidence | null = null,
    ): void {
        tx.events.push({
            version: 1,
            id: randomUUID(),
            type,
            timestamp: this.clock(),
            actorId: tx.actorId,
            deviceId: tx.deviceId,
            subjectId,
            operation,
            outcome: "success",
            code: "OK",
            assurance: approval ? "A3" : tx.assurance,
            approval,
        });
    }
    private async run<T>(
        operation: string,
        work: (tx: Transaction) => Promise<T>,
    ): Promise<T> {
        const result = await this.repository.transaction(
            async (state, events) => {
                for (const name of [
                    "devices",
                    "passkeys",
                    "sessions",
                    "subjects",
                    "delegations",
                    "challenges",
                    "approvals",
                    "replays",
                ] as const)
                    Object.assign(state, {
                        [name]: Object.assign(Object.create(null), state[name]),
                    });
                const tx: Transaction = {
                    state,
                    events,
                    actorId: "anonymous",
                    deviceId: null,
                    assurance: "A0",
                };
                // Bounded ephemeral state; revocation tombstones are not silently removed.
                for (const [id, c] of Object.entries(state.challenges))
                    if (c.expiresAt < this.clock() - 60000)
                        delete state.challenges[id];
                for (const [id, c] of Object.entries(state.replays))
                    if (c.expiresAt < this.clock()) delete state.replays[id];
                // Unapproved enrollment is temporary, not a permanent slot claim.
                // Trusted/revoked device tombstones and their audit are retained.
                for (const [id, device] of Object.entries(state.devices)) {
                    if (
                        device.trust !== "unknown" ||
                        device.expiresAt === null ||
                        device.expiresAt > this.clock()
                    )
                        continue;
                    delete state.devices[id];
                    for (const [credentialId, credential] of Object.entries(
                        state.passkeys,
                    ))
                        if (credential.deviceId === id)
                            delete state.passkeys[credentialId];
                }
                try {
                    return { ok: true as const, value: await work(tx) };
                } catch (error) {
                    const code =
                        error instanceof IdentityFault
                            ? error.code
                            : error instanceof z.ZodError
                              ? "IDENTITY_INPUT_INVALID"
                              : "AUTHENTICATION_FAILED";
                    events.push({
                        version: 1,
                        id: randomUUID(),
                        type: operation.includes("login")
                            ? "authentication.failed"
                            : "security.denied",
                        timestamp: this.clock(),
                        actorId: tx.actorId,
                        deviceId: tx.deviceId,
                        subjectId: null,
                        operation,
                        outcome: "denied",
                        code,
                        assurance: "A0",
                        approval: null,
                    });
                    return { ok: false as const, code };
                }
            },
        );
        if (!result.ok) return deny(result.code);
        return result.value;
    }
    private challenge(
        tx: Transaction,
        values: Partial<ChallengeRecord> & Pick<ChallengeRecord, "kind">,
    ): ChallengeRecord {
        if (
            Object.values(tx.state.challenges).filter(
                (c) => !c.consumed && c.expiresAt > this.clock(),
            ).length >= 128
        )
            return deny("CHALLENGE_LIMIT");
        const c: ChallengeRecord = {
            id: randomUUID(),
            payload: "",
            webChallenge: "",
            expiresAt: this.clock() + 120000,
            consumed: false,
            ownerId: "",
            deviceId: "",
            sessionId: "",
            operation: "",
            inputHash: "",
            device: null,
            recoveryOwner: null,
            ...values,
        };
        c.payload = canonical({
            version: 1,
            domain: "jarvis.identity.development",
            id: c.id,
            kind: c.kind,
            ownerId: c.ownerId,
            deviceId: c.deviceId,
            sessionId: c.sessionId,
            operation: c.operation,
            inputHash: c.inputHash,
            expiresAt: c.expiresAt,
            nonce: secret(),
        });
        c.webChallenge = createHash("sha256")
            .update(c.payload)
            .digest("base64url");
        tx.state.challenges[c.id] = c;
        return c;
    }
    private consume(
        tx: Transaction,
        id: string,
        kind: ChallengeRecord["kind"],
    ): ChallengeRecord {
        const c = tx.state.challenges[IdentifierSchema.parse(id)];
        if (!c || c.consumed) return deny("CHALLENGE_REPLAY");
        c.consumed = true;
        if (c.expiresAt <= this.clock() || c.kind !== kind)
            return deny("CHALLENGE_INVALID");
        return c;
    }
    private device(tx: Transaction, id: string) {
        const d = tx.state.devices[id];
        if (
            !d ||
            d.revokedAt !== null ||
            d.trust === "revoked" ||
            d.trust === "unknown" ||
            (d.expiresAt !== null && d.expiresAt <= this.clock())
        )
            return deny("DEVICE_NOT_TRUSTED");
        if (d.ownerId !== tx.state.owner?.id)
            return deny("DEVICE_OWNER_MISMATCH");
        return d;
    }
    private session(
        tx: Transaction,
        token: string,
        contextHash?: string,
    ): SessionRecord {
        if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
            return deny("SESSION_INVALID");
        const s = tx.state.sessions[digest(token)];
        if (
            !s ||
            s.revoked ||
            s.ownerId !== tx.state.owner?.id ||
            s.epoch !== tx.state.owner.epoch
        )
            return deny("SESSION_INVALID");
        tx.actorId = s.ownerId;
        tx.deviceId = s.deviceId;
        if (
            s.expiresAt <= this.clock() ||
            s.lastActivity + 300000 <= this.clock()
        ) {
            s.revoked = true;
            this.event(tx, "session.expired", "session.validate", s.id);
            return deny("SESSION_EXPIRED");
        }
        const d = this.device(tx, s.deviceId);
        if (
            (contextHash !== undefined && s.contextHash !== contextHash) ||
            d.posture === "suspicious"
        ) {
            s.risk = "restricted";
            s.assurance = "A1";
            this.event(
                tx,
                "security.suspicious_session",
                "session.validate",
                s.id,
            );
        }
        return s;
    }
    private newSession(tx: Transaction, deviceId: string, contextHash: string) {
        const d = this.device(tx, deviceId),
            owner = tx.state.owner!;
        if (
            Object.values(tx.state.sessions).filter(
                (s) => !s.revoked && s.expiresAt > this.clock(),
            ).length >= 64
        )
            return deny("SESSION_LIMIT");
        const token = secret();
        const s: SessionRecord = {
            id: randomUUID(),
            tokenHash: digest(token),
            ownerId: owner.id,
            deviceId,
            assurance: d.trust === "temporary" ? "A1" : "A2",
            createdAt: this.clock(),
            lastActivity: this.clock(),
            expiresAt: Math.min(this.clock() + 900000, d.expiresAt ?? Infinity),
            epoch: owner.epoch,
            revoked: false,
            risk: "normal",
            contextHash,
            scopes: ["identity.self", "mock.read"],
        };
        tx.state.sessions[s.tokenHash] = s;
        tx.actorId = owner.id;
        tx.deviceId = deviceId;
        tx.assurance = s.assurance;
        d.lastSeen = this.clock();
        this.event(tx, "authentication.succeeded", "session.create", owner.id);
        this.event(tx, "session.created", "session.create", s.id);
        return {
            token,
            sessionId: s.id,
            ownerId: owner.id,
            deviceId,
            assurance: s.assurance,
            expiresAt: s.expiresAt,
        };
    }
    private keyInput(tx: Transaction, input: unknown): DeviceInput {
        const d = DeviceInputSchema.parse(input);
        validateDeviceKey(d.publicKey);
        if (
            Object.values(tx.state.devices).some(
                (v) => v.publicKey === d.publicKey,
            )
        )
            return deny("DEVICE_KEY_REUSED");
        if (Object.keys(tx.state.devices).length >= 100)
            return deny("DEVICE_LIMIT");
        return d;
    }
    beginRoot(bootstrapToken: string, displayName: string, input: unknown) {
        return this.run("owner.begin", async (tx) => {
            if (tx.state.owner) return deny("OWNER_ALREADY_EXISTS");
            if (!constantEqual(digest(bootstrapToken), this.bootstrapHash))
                return deny("BOOTSTRAP_DENIED");
            const device = this.keyInput(tx, input),
                name = z.string().trim().min(1).max(80).parse(displayName);
            const owner: OwnerProfile = {
                id: "owner_" + randomUUID(),
                displayName: name,
                createdAt: this.clock(),
                ownershipVersion: 1,
                epoch: 1,
                recoveryHash: null,
                recoveryGeneration: 0,
            };
            const c = this.challenge(tx, {
                kind: "root",
                ownerId: owner.id,
                deviceId: "device_" + randomUUID(),
                device,
                recoveryOwner: owner,
            });
            return {
                challengeId: c.id,
                devicePayload: c.payload,
                options: await this.passkeys.registrationOptions(
                    owner.id,
                    c.webChallenge,
                ),
            };
        });
    }
    beginEnrollment(input: unknown) {
        return this.run("device.enrollment.begin", async (tx) => {
            if (!tx.state.owner) return deny("OWNER_REQUIRED");
            const device = this.keyInput(tx, input),
                c = this.challenge(tx, {
                    kind: "enroll",
                    ownerId: tx.state.owner.id,
                    deviceId: "device_" + randomUUID(),
                    device,
                });
            return {
                challengeId: c.id,
                devicePayload: c.payload,
                options: await this.passkeys.registrationOptions(
                    c.ownerId,
                    c.webChallenge,
                ),
            };
        });
    }
    finishRegistration(
        kind: "root" | "enroll" | "recovery",
        proof: DeviceProof,
        response: unknown,
        contextHash: string,
    ) {
        return this.run("device.registration.finish", async (tx) => {
            const c = this.consume(tx, proof.challengeId, kind);
            if (!c.device) return deny("DEVICE_INVALID");
            if (kind === "root" && tx.state.owner)
                return deny("OWNER_ALREADY_EXISTS");
            if (kind === "enroll" && c.ownerId !== tx.state.owner?.id)
                return deny("OWNER_INVALID");
            if (Object.keys(tx.state.devices).length >= 100)
                return deny("DEVICE_LIMIT");
            verifyDevice(c.device.publicKey, c.payload, proof.signature);
            const credential = await this.passkeys.register(
                response,
                c.webChallenge,
            );
            if (tx.state.passkeys[credential.id])
                return deny("PASSKEY_ALREADY_REGISTERED");
            if (
                Object.values(tx.state.devices).some(
                    (d) => d.publicKey === c.device!.publicKey,
                )
            )
                return deny("DEVICE_KEY_REUSED");
            if (kind === "recovery") {
                if (
                    !c.recoveryOwner ||
                    (tx.state.owner &&
                        (tx.state.owner.id !== c.ownerId ||
                            tx.state.owner.recoveryGeneration !==
                                c.recoveryOwner.recoveryGeneration ||
                            tx.state.owner.recoveryHash !==
                                c.recoveryOwner.recoveryHash))
                )
                    return deny("RECOVERY_STALE");
                for (const d of Object.values(tx.state.devices)) {
                    d.trust = "revoked";
                    d.revokedAt = this.clock();
                }
                for (const p of Object.values(tx.state.passkeys))
                    p.revoked = true;
                for (const s of Object.values(tx.state.sessions))
                    s.revoked = true;
                for (const d of Object.values(tx.state.delegations))
                    d.revoked = true;
                for (const s of Object.values(tx.state.subjects))
                    s.revoked = true;
                for (const a of Object.values(tx.state.approvals))
                    a.consumed = true;
                for (const ch of Object.values(tx.state.challenges))
                    ch.consumed = true;
            }
            if (kind !== "enroll") {
                tx.state.owner = {
                    ...c.recoveryOwner!,
                    recoveryHash: null,
                    epoch: kind === "recovery" ? c.recoveryOwner!.epoch + 1 : 1,
                    recoveryGeneration:
                        kind === "recovery"
                            ? c.recoveryOwner!.recoveryGeneration + 1
                            : 0,
                };
            }
            tx.state.devices[c.deviceId] = {
                ...c.device,
                id: c.deviceId,
                ownerId: c.ownerId,
                enrolledAt: this.clock(),
                lastSeen: this.clock(),
                trust: kind === "enroll" ? "unknown" : "privileged",
                posture: "unknown",
                revokedAt: null,
                expiresAt: kind === "enroll" ? this.clock() + 600000 : null,
            };
            tx.state.passkeys[credential.id] = {
                ...credential,
                ownerId: c.ownerId,
                deviceId: c.deviceId,
                revoked: false,
            };
            tx.actorId = kind === "enroll" ? "pending-device" : c.ownerId;
            tx.deviceId = c.deviceId;
            this.event(
                tx,
                kind === "root"
                    ? "identity.created"
                    : kind === "recovery"
                      ? "security.owner_recovery_completed"
                      : "device.enrollment_requested",
                "device.registration",
                c.deviceId,
            );
            if (kind === "enroll")
                return { deviceId: c.deviceId, status: "approval-required" };
            this.event(
                tx,
                "device.enrolled",
                "device.registration",
                c.deviceId,
            );
            return {
                status: "authenticated",
                ...this.newSession(tx, c.deviceId, contextHash),
            };
        });
    }
    beginLogin(deviceId: string) {
        return this.run("login.begin", async (tx) => {
            const d = this.device(tx, IdentifierSchema.parse(deviceId));
            const c = this.challenge(tx, {
                kind: "login",
                ownerId: d.ownerId,
                deviceId: d.id,
            });
            return {
                challengeId: c.id,
                devicePayload: c.payload,
                options: await this.passkeys.authenticationOptions(
                    Object.values(tx.state.passkeys)
                        .filter((p) => p.deviceId === d.id && !p.revoked)
                        .map((p) => p.id),
                    c.webChallenge,
                ),
            };
        });
    }
    private async assertion(
        tx: Transaction,
        c: ChallengeRecord,
        proof: DeviceProof,
        response: unknown,
    ) {
        const d = this.device(tx, c.deviceId);
        verifyDevice(d.publicKey, c.payload, proof.signature);
        const r = response as AuthenticationResponseJSON,
            p = tx.state.passkeys[r?.id];
        if (
            !p ||
            p.revoked ||
            p.ownerId !== tx.state.owner?.id ||
            p.deviceId !== d.id
        )
            return deny("PASSKEY_IDENTITY_MISMATCH");
        if (
            r.response.userHandle &&
            r.response.userHandle !==
                Buffer.from(p.ownerId).toString("base64url")
        )
            return deny("PASSKEY_USER_MISMATCH");
        const counterBefore = p.counter;
        p.counter = await this.passkeys.authenticate(
            response,
            c.webChallenge,
            p,
        );
        return { p, r, counterBefore };
    }
    finishLogin(proof: DeviceProof, response: unknown, contextHash: string) {
        return this.run("login.finish", async (tx) => {
            const c = this.consume(tx, proof.challengeId, "login");
            await this.assertion(tx, c, proof, response);
            return this.newSession(tx, c.deviceId, contextHash);
        });
    }
    beginAction(
        token: string,
        operation: unknown,
        input: unknown,
        contextHash?: string,
    ) {
        return this.run("action.challenge", async (tx) => {
            const s = this.session(tx, token, contextHash),
                action = ActionSchema.parse(operation),
                value = ActionInputSchemas[action].parse(input);
            const c = this.challenge(tx, {
                kind: "action",
                ownerId: s.ownerId,
                deviceId: s.deviceId,
                sessionId: s.id,
                operation: action,
                inputHash: digest(canonical(value)),
            });
            return { challengeId: c.id, devicePayload: c.payload };
        });
    }
    beginStepUp(
        token: string,
        operation: unknown,
        input: unknown,
        contextHash?: string,
    ) {
        return this.run("step-up.begin", async (tx) => {
            const s = this.session(tx, token, contextHash),
                action = ActionSchema.parse(operation),
                value = ActionInputSchemas[action].parse(input);
            if (s.risk !== "normal" || s.assurance !== "A2")
                return deny("REAUTHENTICATION_REQUIRED");
            if (!sensitive.has(action)) return deny("STEP_UP_ACTION_INVALID");
            if (this.device(tx, s.deviceId).trust !== "privileged")
                return deny("DEVICE_PRIVILEGE_REQUIRED");
            const c = this.challenge(tx, {
                kind: "step-up",
                ownerId: s.ownerId,
                deviceId: s.deviceId,
                sessionId: s.id,
                operation: action,
                inputHash: digest(canonical(value)),
            });
            return {
                challengeId: c.id,
                devicePayload: c.payload,
                options: await this.passkeys.authenticationOptions(
                    Object.values(tx.state.passkeys)
                        .filter((p) => p.deviceId === s.deviceId && !p.revoked)
                        .map((p) => p.id),
                    c.webChallenge,
                ),
            };
        });
    }
    finishStepUp(
        token: string,
        proof: DeviceProof,
        response: unknown,
        contextHash?: string,
    ) {
        return this.run("step-up.finish", async (tx) => {
            const s = this.session(tx, token, contextHash),
                c = this.consume(tx, proof.challengeId, "step-up");
            if (
                c.sessionId !== s.id ||
                c.deviceId !== s.deviceId ||
                s.risk !== "normal"
            )
                return deny("APPROVAL_CONTEXT_MISMATCH");
            const { p, r, counterBefore } = await this.assertion(
                tx,
                c,
                proof,
                response,
            );
            const evidence: ApprovalEvidence = {
                envelope: c.payload,
                challenge: c.webChallenge,
                credentialId: p.id,
                credentialPublicKey: p.publicKey,
                authenticatorData: r.response.authenticatorData,
                clientDataJSON: r.response.clientDataJSON,
                signature: r.response.signature,
                origin: this.passkeys.origin,
                rpID: this.passkeys.rpID,
                counterBefore,
            };
            const id = randomUUID();
            tx.state.approvals[id] = {
                id,
                ownerId: s.ownerId,
                deviceId: s.deviceId,
                sessionId: s.id,
                operation: c.operation,
                inputHash: c.inputHash,
                expiresAt: this.clock() + 90000,
                consumed: false,
                evidence,
            };
            this.event(tx, "authentication.succeeded", "step-up", id, evidence);
            return {
                approvalId: id,
                assurance: "A3",
                expiresAt: this.clock() + 90000,
            };
        });
    }
    perform(
        proof: SessionProof,
        operation: unknown,
        input: unknown,
        contextHash?: string,
    ): Promise<unknown> {
        return this.run("owner.action", async (tx) => {
            const s = this.session(tx, proof.token, contextHash),
                c = this.consume(tx, proof.challengeId, "action"),
                action = ActionSchema.parse(operation),
                value = ActionInputSchemas[action].parse(input);
            if (
                c.sessionId !== s.id ||
                c.deviceId !== s.deviceId ||
                c.operation !== action ||
                c.inputHash !== digest(canonical(value))
            )
                return deny("ACTION_BINDING_MISMATCH");
            verifyDevice(
                this.device(tx, s.deviceId).publicKey,
                c.payload,
                proof.signature,
            );
            tx.assurance = s.assurance;
            if (s.risk !== "normal" || s.assurance !== "A2")
                return deny("REAUTHENTICATION_REQUIRED");
            if (action === "owner.transfer") return deny("OWNER_LOCKED");
            if (action === "critical.confirm")
                return deny("A4_NOT_ESTABLISHED");
            let evidence: ApprovalEvidence | null = null;
            if (sensitive.has(action)) {
                if (this.device(tx, s.deviceId).trust !== "privileged")
                    return deny("DEVICE_PRIVILEGE_REQUIRED");
                const a = proof.approvalId
                    ? tx.state.approvals[proof.approvalId]
                    : undefined;
                if (
                    !a ||
                    a.consumed ||
                    a.expiresAt <= this.clock() ||
                    a.sessionId !== s.id ||
                    a.deviceId !== s.deviceId ||
                    a.ownerId !== s.ownerId ||
                    a.operation !== action ||
                    a.inputHash !== c.inputHash
                ) {
                    this.event(tx, "authentication.step_up_required", action);
                    return deny("STEP_UP_REQUIRED");
                }
                a.consumed = true;
                evidence = a.evidence;
            }
            s.lastActivity = this.clock();
            let result: unknown;
            switch (action) {
                case "security.command":
                case "security.inspect":
                    if (!this.securityCommands)
                        return deny("SECURITY_UNAVAILABLE");
                    result = await this.securityCommands(
                        tx.state,
                        tx.events,
                        {
                            actorId: s.ownerId,
                            ownerId: s.ownerId,
                            kind: "owner",
                            sessionId: s.id,
                            deviceId: s.deviceId,
                            assurance: evidence ? "A3" : "A2",
                            evidence,
                        },
                        action === "security.inspect"
                            ? { command: "inspect", data: {} }
                            : value,
                    );
                    break;
                case "identity.inspect":
                    result = {
                        owner: {
                            id: tx.state.owner!.id,
                            displayName: tx.state.owner!.displayName,
                            ownershipVersion: 1,
                        },
                        currentSession: {
                            id: s.id,
                            deviceId: s.deviceId,
                            assurance: s.assurance,
                            expiresAt: s.expiresAt,
                        },
                        devices: Object.values(tx.state.devices).map(
                            ({ publicKey: _key, ...d }) => d,
                        ),
                        sessions: Object.values(tx.state.sessions).map(
                            ({
                                tokenHash: _hash,
                                contextHash: _context,
                                ...session
                            }) => session,
                        ),
                        subjects: Object.values(tx.state.subjects).map(
                            ({ publicKey: _key, ...subject }) => subject,
                        ),
                        audit: await this.repository.audit(100),
                    };
                    break;
                case "privacy.inspect":
                    result = {
                        revealPrivateData: false,
                        reason: ActionInputSchemas[action].parse(value)
                            .sharedDisplay
                            ? "shared-display-confirmation-required"
                            : "private-memory-disabled",
                    };
                    break;
                case "device.approve": {
                    const v = ActionInputSchemas[action].parse(value),
                        d = tx.state.devices[v.deviceId];
                    if (
                        !d ||
                        d.ownerId !== s.ownerId ||
                        d.trust !== "unknown" ||
                        d.expiresAt! <= this.clock()
                    )
                        return deny("ENROLLMENT_INVALID");
                    d.trust = v.trust;
                    d.expiresAt =
                        v.trust === "temporary" ? this.clock() + 900000 : null;
                    this.event(tx, "device.enrolled", action, d.id, evidence);
                    result = { deviceId: d.id, trust: d.trust };
                    break;
                }
                case "device.revoke": {
                    const id = ActionInputSchemas[action].parse(value).deviceId,
                        d = tx.state.devices[id];
                    if (!d || d.ownerId !== s.ownerId)
                        return deny("DEVICE_INVALID");
                    d.trust = "revoked";
                    d.revokedAt = this.clock();
                    for (const p of Object.values(tx.state.passkeys))
                        if (p.deviceId === id) p.revoked = true;
                    for (const session of Object.values(tx.state.sessions))
                        if (session.deviceId === id) session.revoked = true;
                    for (const cap of Object.values(tx.state.delegations))
                        if (cap.deviceId === id) cap.revoked = true;
                    for (const a of Object.values(tx.state.approvals))
                        if (a.deviceId === id) a.consumed = true;
                    this.event(tx, "device.revoked", action, id, evidence);
                    result = { revoked: true, deviceId: id };
                    break;
                }
                case "session.revoke": {
                    const v = ActionInputSchemas[action].parse(value);
                    if (
                        (v.exceptCurrent === true) ===
                        (v.sessionId !== undefined)
                    )
                        return deny("SESSION_SELECTION_INVALID");
                    for (const session of Object.values(tx.state.sessions))
                        if (
                            v.exceptCurrent
                                ? session.id !== s.id
                                : session.id === v.sessionId
                        ) {
                            session.revoked = true;
                            this.event(
                                tx,
                                "session.revoked",
                                action,
                                session.id,
                                evidence,
                            );
                        }
                    result = { revoked: true };
                    break;
                }
                case "subject.create": {
                    const v = ActionInputSchemas[action].parse(value);
                    validateDeviceKey(v.publicKey);
                    if (Object.keys(tx.state.subjects).length >= 100)
                        return deny("SUBJECT_LIMIT");
                    const id = v.kind + "_" + randomUUID();
                    const subject: SubjectRecord = {
                        ...v,
                        id,
                        ownerId: s.ownerId,
                        role: v.kind === "human" ? "guest" : "restricted",
                        revoked: false,
                        createdAt: this.clock(),
                    };
                    tx.state.subjects[id] = subject;
                    this.event(
                        tx,
                        v.kind === "agent"
                            ? "agent.identity_created"
                            : "identity.created",
                        action,
                        id,
                        evidence,
                    );
                    result = { subjectId: id, scopes: v.scopes };
                    break;
                }
                case "delegation.issue": {
                    const v = ActionInputSchemas[action].parse(value),
                        subject = tx.state.subjects[v.subjectId];
                    if (
                        !subject ||
                        subject.revoked ||
                        subject.ownerId !== s.ownerId ||
                        !subject.scopes.includes(v.scope) ||
                        !subject.resources.includes(v.resource)
                    )
                        return deny("DELEGATION_SCOPE_DENIED");
                    const token = secret(),
                        id = randomUUID();
                    tx.state.delegations[digest(token)] = {
                        id,
                        tokenHash: digest(token),
                        subjectId: subject.id,
                        ownerId: s.ownerId,
                        deviceId: s.deviceId,
                        sessionId: s.id,
                        scope: v.scope,
                        resource: v.resource,
                        expiresAt: Math.min(
                            this.clock() + v.ttlSeconds * 1000,
                            s.expiresAt,
                        ),
                        epoch: s.epoch,
                        revoked: false,
                        audience: "jarvis.mock",
                    };
                    this.event(
                        tx,
                        "permission.delegated",
                        action,
                        id,
                        evidence,
                    );
                    result = {
                        token,
                        delegationId: id,
                        expiresAt:
                            tx.state.delegations[digest(token)]!.expiresAt,
                    };
                    break;
                }
                case "recovery.prepare": {
                    const key = secret(),
                        owner = tx.state.owner!;
                    owner.recoveryGeneration += 1;
                    owner.recoveryHash = digest(key);
                    const kit = sealRecovery(
                        {
                            version: 1,
                            owner,
                            rpID: this.passkeys.rpID,
                            origin: this.passkeys.origin,
                        },
                        key,
                    );
                    this.event(
                        tx,
                        "identity.updated",
                        action,
                        owner.id,
                        evidence,
                    );
                    result = {
                        package: kit,
                        recoveryKey: key,
                        ownerId: owner.id,
                        warning:
                            "Store package and recovery key separately offline. This identity kit does not back up personal data or vault keys.",
                    };
                    break;
                }
            }
            this.event(tx, "identity.action_completed", action, null, evidence);
            return result;
        });
    }
    beginRecovery(
        packageText: string,
        recoveryKey: string,
        expectedOwnerId: string,
        input: unknown,
        bootstrapToken = "",
    ) {
        return this.run("owner.recovery.begin", async (tx) => {
            const kit = RecoverySchema.parse(
                openRecovery(packageText, recoveryKey),
            );
            if (
                kit.owner.id !== expectedOwnerId ||
                kit.rpID !== this.passkeys.rpID ||
                kit.origin !== this.passkeys.origin ||
                !constantEqual(kit.owner.recoveryHash, digest(recoveryKey))
            )
                return deny("RECOVERY_INVALID");
            if (tx.state.owner) {
                if (
                    tx.state.owner.id !== kit.owner.id ||
                    tx.state.owner.recoveryGeneration !==
                        kit.owner.recoveryGeneration ||
                    !constantEqual(
                        tx.state.owner.recoveryHash ?? "",
                        digest(recoveryKey),
                    )
                )
                    return deny("RECOVERY_STALE");
            } else if (
                !constantEqual(digest(bootstrapToken), this.bootstrapHash)
            )
                return deny("BOOTSTRAP_DENIED");
            const device = this.keyInput(tx, input),
                c = this.challenge(tx, {
                    kind: "recovery",
                    ownerId: kit.owner.id,
                    deviceId: "device_" + randomUUID(),
                    device,
                    recoveryOwner: kit.owner,
                });
            this.event(
                tx,
                "security.owner_recovery_started",
                "owner.recovery",
                kit.owner.id,
            );
            return {
                challengeId: c.id,
                devicePayload: c.payload,
                options: await this.passkeys.registrationOptions(
                    kit.owner.id,
                    c.webChallenge,
                ),
            };
        });
    }
    private capability(tx: Transaction, token: string) {
        const cap =
            tx.state.delegations[digest(z.string().max(128).parse(token))];
        if (
            !cap ||
            cap.revoked ||
            cap.epoch !== tx.state.owner?.epoch ||
            cap.ownerId !== tx.state.owner.id ||
            cap.audience !== "jarvis.mock"
        )
            return deny("DELEGATION_INVALID");
        if (cap.expiresAt <= this.clock()) {
            cap.revoked = true;
            this.event(tx, "permission.expired", "delegation.validate", cap.id);
            return deny("DELEGATION_EXPIRED");
        }
        const device = this.device(tx, cap.deviceId);
        if (device.posture === "suspicious")
            return deny("DEVICE_POSTURE_RESTRICTED");
        const session = Object.values(tx.state.sessions).find(
            (s) => s.id === cap.sessionId,
        );
        if (
            !session ||
            session.revoked ||
            session.ownerId !== cap.ownerId ||
            session.deviceId !== cap.deviceId ||
            session.epoch !== cap.epoch ||
            session.expiresAt <= this.clock() ||
            session.lastActivity + 300000 <= this.clock() ||
            session.risk !== "normal"
        )
            return deny("DELEGATION_PARENT_REVOKED");
        const subject = tx.state.subjects[cap.subjectId];
        if (
            !subject ||
            subject.revoked ||
            !subject.scopes.includes(cap.scope) ||
            !subject.resources.includes(cap.resource)
        )
            return deny("DELEGATION_SCOPE_DENIED");
        tx.actorId = subject.id;
        tx.deviceId = cap.deviceId;
        return { cap, subject, session, device };
    }
    beginDelegated(token: string, scope: string, resource: string) {
        return this.run("delegation.challenge", async (tx) => {
            const { cap, subject } = this.capability(tx, token);
            const c = this.challenge(tx, {
                kind: "delegated",
                ownerId: cap.ownerId,
                deviceId: cap.deviceId,
                sessionId: cap.id,
                operation: IdentifierSchema.parse(scope),
                inputHash: digest(
                    canonical({
                        resource: IdentifierSchema.parse(resource),
                        subjectId: subject.id,
                    }),
                ),
            });
            return { challengeId: c.id, devicePayload: c.payload };
        });
    }
    performDelegated(
        token: string,
        proof: DeviceProof,
        scope: string,
        resource: string,
        execute: (
            subject: SubjectRecord,
            authority: {
                ownerId: string;
                deviceId: string;
                sessionId: string;
                deviceTrust: import("./contracts.js").TrustedDevice["trust"];
                assurance: "A1";
                verifiedAt: number;
                expiresAt: number;
                scopes: string[];
                resources: string[];
            },
        ) => Promise<unknown>,
    ) {
        return this.run("delegation.execute", async (tx) => {
            const { cap, subject, session, device } = this.capability(
                    tx,
                    token,
                ),
                c = this.consume(tx, proof.challengeId, "delegated");
            if (
                c.sessionId !== cap.id ||
                c.operation !== scope ||
                c.inputHash !==
                    digest(canonical({ resource, subjectId: subject.id }))
            )
                return deny("DELEGATION_BINDING_INVALID");
            verifyDevice(subject.publicKey, c.payload, proof.signature);
            if (
                scope !== cap.scope ||
                resource !== cap.resource ||
                scope !== "mock.read"
            )
                return deny("DELEGATION_SCOPE_DENIED");
            // Recipient proof authenticates the delegated subject, not the owner's A2/A3.
            if (this.securityCommands)
                await this.securityCommands(
                    tx.state,
                    tx.events,
                    {
                        actorId: subject.id,
                        ownerId: subject.ownerId,
                        kind: subject.kind,
                        sessionId: cap.sessionId,
                        deviceId: cap.deviceId,
                        assurance: "A1",
                        evidence: null,
                    },
                    { command: "legacy.guard", data: { scope, resource } },
                );
            const result = await execute(structuredClone(subject), {
                ownerId: cap.ownerId,
                deviceId: cap.deviceId,
                sessionId: cap.sessionId,
                deviceTrust: device.trust,
                assurance: "A1",
                verifiedAt: this.clock(),
                expiresAt: Math.min(
                    cap.expiresAt,
                    session.expiresAt,
                    session.lastActivity + 300000,
                    device.expiresAt ?? Number.MAX_SAFE_INTEGER,
                ),
                scopes: [cap.scope],
                resources: [cap.resource],
            });
            this.event(tx, "tool.executed", scope, subject.id);
            return result;
        });
    }
    beginSecuritySubject(subjectId: string, input: unknown) {
        return this.run("security.subject.challenge", async (tx) => {
            const subject =
                tx.state.subjects[IdentifierSchema.parse(subjectId)];
            if (
                !subject ||
                subject.revoked ||
                subject.ownerId !== tx.state.owner?.id
            )
                return deny("SUBJECT_INVALID");
            const value = ActionInputSchemas["security.command"].parse(input);
            const encoded = canonical(value);
            if (encoded.length > 32000) return deny("REQUEST_TOO_LARGE");
            const c = this.challenge(tx, {
                kind: "delegated",
                ownerId: subject.ownerId,
                deviceId: subject.id,
                operation: "security.subject",
                inputHash: digest(encoded),
            });
            return { challengeId: c.id, devicePayload: c.payload };
        });
    }
    performSecuritySubject(
        subjectId: string,
        proof: DeviceProof,
        input: unknown,
    ) {
        return this.run("security.subject.command", async (tx) => {
            const subject =
                tx.state.subjects[IdentifierSchema.parse(subjectId)];
            if (
                !subject ||
                subject.revoked ||
                subject.ownerId !== tx.state.owner?.id
            )
                return deny("SUBJECT_INVALID");
            tx.actorId = subject.id;
            const c = this.consume(tx, proof.challengeId, "delegated");
            const value = ActionInputSchemas["security.command"].parse(input);
            if (
                c.ownerId !== subject.ownerId ||
                c.deviceId !== subject.id ||
                c.operation !== "security.subject" ||
                c.inputHash !== digest(canonical(value))
            )
                return deny("ACTION_BINDING_MISMATCH");
            verifyDevice(subject.publicKey, c.payload, proof.signature);
            if (!this.securityCommands) return deny("SECURITY_UNAVAILABLE");
            return this.securityCommands(
                tx.state,
                tx.events,
                {
                    actorId: subject.id,
                    ownerId: subject.ownerId,
                    kind: subject.kind,
                    sessionId: null,
                    deviceId: null,
                    assurance: "A1",
                    evidence: null,
                },
                value,
            );
        });
    }
    async acceptService(
        key: Buffer,
        proof: ServiceProof,
        operation: string,
        body: string,
    ): Promise<void> {
        await this.run("service.authenticate", async (tx) => {
            verifyService(key, proof, operation, body, this.clock());
            if (
                proof.serviceId !== "service_web" ||
                tx.state.replays[proof.nonce]
            )
                return deny("SERVICE_REPLAY_OR_IDENTITY_DENIED");
            tx.state.replays[proof.nonce] = {
                id: proof.nonce,
                expiresAt: this.clock() + 60000,
            };
        });
    }
}
