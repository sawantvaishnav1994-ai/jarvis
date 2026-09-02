import { z } from "zod";
import { DeterministicPolicy, immutableJson } from "@jarvis/security";
import type { PolicyAuditSink } from "@jarvis/audit";
import { GovernedToolGateway } from "@jarvis/tools";
/** Fixed synthetic registry: loading a policy cannot install a tool or enable external effects. */
export function developmentToolGateway(
    policy: DeterministicPolicy,
    audit: PolicyAuditSink,
) {
    const controls = immutableJson({
        version: 1 as const,
        epoch: 0,
        mode: "safe" as const,
        paused: false,
        frozen: false,
        disconnected: true,
        shutdown: false,
        allowExternalActions: false as const,
    });
    return new GovernedToolGateway(
        [
            {
                descriptor: {
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
                },
                validate: (value) => z.string().min(1).max(128).parse(value),
                resource: (value) => z.string().parse(value),
                execute: async (value) => ({
                    resource: value,
                    result: "synthetic-repository-content",
                }),
                verify: (output) =>
                    z
                        .strictObject({
                            resource: z.literal("repository-x"),
                            result: z.literal("synthetic-repository-content"),
                        })
                        .safeParse(output).success,
            },
        ],
        policy,
        { read: () => controls },
        { consume: async () => false },
        audit,
    );
}
