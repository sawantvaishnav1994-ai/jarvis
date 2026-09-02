import { randomUUID } from "node:crypto";
import type {
    GovernedContext,
    ToolDescriptor,
    PolicyDocument,
    ControlState,
} from "@jarvis/security";
export const policyNow = 1_800_000_000_000;
export function policyContext(): GovernedContext {
    return {
        version: 2,
        actor: {
            version: 1,
            id: "agent-test",
            kind: "agent",
            ownerId: "owner-test",
            environment: "development",
        },
        environment: "development",
        requestId: randomUUID(),
        trace: { traceId: "a".repeat(32), spanId: "b".repeat(16) },
        authority: {
            ownerId: "owner-test",
            deviceId: "device-test",
            sessionId: "session-test",
            deviceTrust: "trusted",
            assurance: "A1",
            verifiedAt: policyNow,
            expiresAt: policyNow + 60000,
            scopes: ["mock.read"],
            resources: ["repository-x"],
        },
    };
}
export function policyTool(): ToolDescriptor {
    return {
        version: 2,
        id: "mock.repository.read",
        scope: "mock.read",
        permission: "P0",
        effect: "observe",
        data: "synthetic",
        external: false,
        destructive: false,
        securityChange: false,
        financial: false,
        physical: "none",
    };
}
export function policyDocument(): PolicyDocument {
    return {
        version: 1,
        revision: "test-1",
        environment: "development",
        rules: [
            {
                id: "allow-test",
                effect: "allow",
                actorKinds: ["agent", "owner"],
                toolId: "mock.repository.read",
                scope: "mock.read",
                resource: "repository-x",
                permissions: ["P0", "P1", "P2", "P3", "P4", "P5"],
                modes: [
                    "safe",
                    "assistant",
                    "copilot",
                    "autonomous",
                    "focus",
                    "private",
                    "guest",
                    "emergency",
                ],
                minimumAssurance: "A1",
                requireApproval: false,
            },
        ],
    };
}
export function policyControls(): ControlState {
    return {
        version: 1,
        epoch: 0,
        mode: "safe",
        paused: false,
        frozen: false,
        disconnected: false,
        shutdown: false,
        allowExternalActions: false,
    };
}
