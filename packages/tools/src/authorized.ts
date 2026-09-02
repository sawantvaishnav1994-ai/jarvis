import { z } from "zod";
import {
    consumeExecutionPermit,
    ActionRequestV3Schema,
    type ActionRequestV3,
    type AuthorizationV3,
    type ProtectedToolCatalog,
    type RiskFactors,
} from "@jarvis/security";
import { BoundaryError } from "@jarvis/shared";

const Input = z.strictObject({
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    branch: z.enum(["development", "main"]),
    files: z
        .array(z.string().regex(/^[a-zA-Z0-9_./-]+$/))
        .min(1)
        .max(100),
    simulation: z.enum(["pass", "fail"]),
    tests: z.enum(["pass", "fail"]),
    scan: z.enum(["pass", "fail"]),
});
const definitions = {
    "mock.repository.read": {
        capability: "github.repo.read",
        permission: "P0",
        env: "development",
    },
    "mock.repository.write": {
        capability: "github.repo.write",
        permission: "P3",
        env: "development",
    },
    "mock.tests.execute": {
        capability: "tests.execute",
        permission: "P3",
        env: "development",
    },
    "mock.production.deploy": {
        capability: "github.production.deploy",
        permission: "P4",
        env: "production",
    },
} as const;
/** Closed synthetic registry. No real GitHub/network/filesystem handler is installed. */
export class AuthorizedMockToolGateway implements ProtectedToolCatalog {
    describe(raw: ActionRequestV3) {
        const request = ActionRequestV3Schema.parse(raw),
            input = Input.parse(request.input);
        const tool = definitions[request.toolId as keyof typeof definitions];
        if (!tool || request.environment !== tool.env)
            throw new BoundaryError("UNKNOWN_TOOL_OR_ENVIRONMENT");
        if (request.resource !== "jarvis")
            throw new BoundaryError("RESOURCE_SCOPE_DENIED");
        if (
            input.files.some(
                (f) => f.startsWith("/") || f.split("/").includes(".."),
            )
        )
            throw new BoundaryError("PATH_SCOPE_DENIED");
        if (tool.permission === "P3" && input.branch !== "development")
            throw new BoundaryError("DEVELOPMENT_BRANCH_REQUIRED");
        const factors: RiskFactors = {
            permission: tool.permission,
            reversibility: "REVERSIBLE",
            blastRadius: "repository",
            financialMinor: 0,
            privacy: 0,
            security: 0,
            production: tool.env === "production",
            physical: 0,
            volume: input.files.length,
            resourceCount: 1,
            identityTrust: "restricted",
            assurance: "A1",
            novelty: false,
            unusual: false,
            confidence: input.simulation === "pass" ? 1 : 0,
            verified: input.simulation === "pass",
            simulated: input.simulation === "pass",
            testsPassed: input.tests === "pass",
            scanPassed: input.scan === "pass",
            environment: request.environment,
            fromZone: "Z2",
            toZone: tool.env === "production" ? "Z4" : "Z2",
            external: false,
            network: false,
        };
        return { capability: tool.capability, factors };
    }
    execute(
        request: ActionRequestV3,
        authorization: AuthorizationV3,
        permit: object,
    ) {
        if (!consumeExecutionPermit(permit, request, authorization))
            throw new BoundaryError("DIRECT_TOOL_BYPASS_DENIED");
        this.describe(request);
        return {
            synthetic: true,
            toolId: request.toolId,
            resource: request.resource,
            commit: request.input.commit,
            verified: true,
        };
    }
    verify(request: ActionRequestV3, result: unknown): boolean {
        return z
            .strictObject({
                synthetic: z.literal(true),
                toolId: z.literal(request.toolId),
                resource: z.literal(request.resource),
                commit: z.literal(String(request.input.commit)),
                verified: z.literal(true),
            })
            .safeParse(result).success;
    }
}
