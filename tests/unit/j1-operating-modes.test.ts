import { describe, expect, it } from "vitest";
import {
    J19OperatingModeCoordinator,
    type ContextAssemblyAuthority,
    type J19AutonomyEnvelope,
    type J19ModeAuthorityPort,
    type J19ModeSnapshot,
} from "@jarvis/core";

const now = 1_800_000_000_000;
const authority: ContextAssemblyAuthority = {
    ownerId: "owner:root",
    projectId: "jarvis",
    conversationId: "conversation:1",
    sessionId: "session:1",
    turnId: "turn:1",
    securityEpoch: 7,
    operatingMode: "copilot",
};

function snapshot(patch: Partial<J19ModeSnapshot> = {}): J19ModeSnapshot {
    return {
        ownerId: authority.ownerId,
        projectId: authority.projectId,
        conversationId: authority.conversationId,
        sessionId: authority.sessionId,
        turnId: authority.turnId,
        securityEpoch: authority.securityEpoch,
        mode: authority.operatingMode,
        emergencyControl: "NONE",
        issuedAtEpochMs: now - 1000,
        expiresAtEpochMs: now + 60_000,
        revoked: false,
        provenance: "J0_FOUNDATION",
        ...patch,
    };
}

function port(
    current: J19ModeSnapshot,
    envelope: J19AutonomyEnvelope | null = null,
): J19ModeAuthorityPort {
    return {
        resolve: async () => current,
        resolveAutonomyEnvelope: async () => envelope,
    };
}

describe("J1.9 operating modes", () => {
    it("allows Copilot tool work only as mode eligibility, leaving J1.7/J1.8/J0 authoritative", async () => {
        const coordinator = new J19OperatingModeCoordinator(
            port(snapshot()),
            () => now,
        );
        await expect(
            coordinator.evaluate({
                authority,
                action: "TOOL_MUTATION",
                mutating: true,
            }),
        ).resolves.toMatchObject({ allowed: true, effectiveMode: "copilot" });
    });

    it("fails closed on cross-owner mode binding", async () => {
        const coordinator = new J19OperatingModeCoordinator(
            port(snapshot({ ownerId: "owner:attacker" })),
            () => now,
        );
        await expect(
            coordinator.evaluate({ authority, action: "MODEL" }),
        ).resolves.toMatchObject({
            allowed: false,
            reason: "MODE_BINDING_INVALID",
        });
    });

    it("fails closed on stale mode or operating-mode mismatch", async () => {
        const expired = new J19OperatingModeCoordinator(
            port(snapshot({ expiresAtEpochMs: now })),
            () => now,
        );
        await expect(
            expired.evaluate({ authority, action: "MODEL" }),
        ).resolves.toMatchObject({
            allowed: false,
            reason: "MODE_EXPIRED",
        });

        const mismatch = new J19OperatingModeCoordinator(
            port(snapshot({ mode: "assistant" })),
            () => now,
        );
        await expect(
            mismatch.evaluate({ authority, action: "MODEL" }),
        ).resolves.toMatchObject({
            allowed: false,
            reason: "MODE_MISMATCH",
        });
    });

    it.each([
        ["SHUTDOWN", "EMERGENCY_SHUTDOWN"],
        ["REVOKE", "EMERGENCY_REVOKED"],
        ["FREEZE", "EMERGENCY_FROZEN"],
    ] as const)("gives %s precedence", async (emergencyControl, reason) => {
        const coordinator = new J19OperatingModeCoordinator(
            port(snapshot({ emergencyControl })),
            () => now,
        );
        await expect(
            coordinator.evaluate({
                authority,
                action: "TOOL_MUTATION",
                mutating: true,
            }),
        ).resolves.toMatchObject({ allowed: false, reason });
    });

    it("blocks network work under DISCONNECT and mutation under SAFE MODE", async () => {
        const disconnected = new J19OperatingModeCoordinator(
            port(snapshot({ emergencyControl: "DISCONNECT" })),
            () => now,
        );
        await expect(
            disconnected.evaluate({
                authority,
                action: "NETWORK",
                external: true,
            }),
        ).resolves.toMatchObject({
            allowed: false,
            reason: "EMERGENCY_DISCONNECTED",
        });

        const safe = new J19OperatingModeCoordinator(
            port(snapshot({ emergencyControl: "SAFE_MODE" })),
            () => now,
        );
        await expect(
            safe.evaluate({
                authority,
                action: "APPROVAL_REQUEST",
                mutating: true,
            }),
        ).resolves.toMatchObject({
            allowed: false,
            reason: "EMERGENCY_SAFE_MODE",
        });
    });

    it("blocks privileged guest behavior and Safe mutation", async () => {
        const guestAuthority = {
            ...authority,
            operatingMode: "guest" as const,
        };
        const guest = new J19OperatingModeCoordinator(
            port(snapshot({ mode: "guest" })),
            () => now,
        );
        await expect(
            guest.evaluate({
                authority: guestAuthority,
                action: "APPROVAL_REQUEST",
            }),
        ).resolves.toMatchObject({
            allowed: false,
            reason: "GUEST_PRIVILEGE_DENIED",
        });

        const safeAuthority = { ...authority, operatingMode: "safe" as const };
        const safe = new J19OperatingModeCoordinator(
            port(snapshot({ mode: "safe" })),
            () => now,
        );
        await expect(
            safe.evaluate({
                authority: safeAuthority,
                action: "TOOL_MUTATION",
                mutating: true,
            }),
        ).resolves.toMatchObject({
            allowed: false,
            reason: "SAFE_MUTATION_DENIED",
        });
    });

    it("requires a valid bounded J0 autonomy envelope", async () => {
        const autonomousAuthority = {
            ...authority,
            operatingMode: "autonomous" as const,
        };
        const mode = snapshot({ mode: "autonomous" });
        const missing = new J19OperatingModeCoordinator(port(mode), () => now);
        await expect(
            missing.evaluate({
                authority: autonomousAuthority,
                action: "TOOL_READ",
            }),
        ).resolves.toMatchObject({
            allowed: false,
            reason: "AUTONOMY_ENVELOPE_REQUIRED",
        });

        const envelope: J19AutonomyEnvelope = {
            ownerId: authority.ownerId,
            projectId: authority.projectId,
            conversationId: authority.conversationId,
            sessionId: authority.sessionId,
            securityEpoch: authority.securityEpoch,
            expiresAtEpochMs: now + 60_000,
            allowedActions: ["TOOL_READ"],
            maxCostMinor: 25,
            externalAllowed: false,
            revoked: false,
            provenance: "J0_AUTHORITY",
        };
        const bounded = new J19OperatingModeCoordinator(
            port(mode, envelope),
            () => now,
        );
        await expect(
            bounded.evaluate({
                authority: autonomousAuthority,
                action: "TOOL_READ",
                costMinor: 20,
            }),
        ).resolves.toMatchObject({ allowed: true });
        await expect(
            bounded.evaluate({
                authority: autonomousAuthority,
                action: "TOOL_READ",
                costMinor: 26,
            }),
        ).resolves.toMatchObject({
            allowed: false,
            reason: "AUTONOMY_COST_DENIED",
        });
        await expect(
            bounded.evaluate({
                authority: autonomousAuthority,
                action: "TOOL_READ",
                external: true,
            }),
        ).resolves.toMatchObject({
            allowed: false,
            reason: "AUTONOMY_EXTERNAL_DENIED",
        });
    });
});
