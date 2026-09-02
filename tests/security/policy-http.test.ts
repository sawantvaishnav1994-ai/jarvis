import { expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { signService } from "@jarvis/identity";
import { DeterministicPolicy } from "@jarvis/security";
import { PolicyAuditRecordSchema, type PolicyAuditRecord } from "@jarvis/audit";
import {
    fixture,
    root,
    ownerAction,
    TestDevice,
} from "../fixtures/identity.js";
import { healthServer } from "../../apps/api/src/health.js";
import { identityHandler } from "../../apps/api/src/identity-http.js";
import { developmentToolGateway } from "../../apps/api/src/tool-runtime.js";

it.each(["repository-x", "repository-y"])(
    "signed HTTP delegation is governed by loaded policy for %s",
    async (resource) => {
        const f = fixture(),
            owner = await root(f),
            agent = new TestDevice(),
            key = randomBytes(32);
        const subject = (await ownerAction(
            f.engine,
            owner.device,
            owner.session,
            "subject.create",
            {
                name: "Synthetic agent",
                kind: "agent",
                publicKey: agent.input.publicKey,
                scopes: ["mock.read"],
                resources: [resource],
            },
        )) as { subjectId: string };
        const capability = (await ownerAction(
            f.engine,
            owner.device,
            owner.session,
            "delegation.issue",
            {
                subjectId: subject.subjectId,
                scope: "mock.read",
                resource,
                ttlSeconds: 60,
            },
        )) as { token: string };
        const records: PolicyAuditRecord[] = [];
        const policy = new DeterministicPolicy(
            JSON.parse(
                await readFile("config/policy.development.json", "utf8"),
            ),
        );
        const gateway = developmentToolGateway(policy, {
            append: async (r) => {
                records.push(PolicyAuditRecordSchema.parse(r));
            },
        });
        const server = healthServer(
            "api",
            async () => ({ test: true }),
            30,
            identityHandler(f.engine, key, gateway),
        );
        await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve),
        );
        const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/identity/rpc`;
        async function rpc(
            method: string,
            params: unknown,
            authenticated = true,
        ) {
            const body = JSON.stringify({
                method,
                params,
                contextHash: "a".repeat(64),
            });
            return fetch(url, {
                method: "POST",
                body,
                headers: {
                    "content-type": "application/json",
                    ...(authenticated
                        ? {
                              "x-jarvis-service-proof": Buffer.from(
                                  JSON.stringify(
                                      signService(
                                          key,
                                          "service_web",
                                          "identity.rpc",
                                          body,
                                      ),
                                  ),
                              ).toString("base64url"),
                          }
                        : {}),
                },
            });
        }
        try {
            const common = {
                capability: capability.token,
                scope: "mock.read",
                resource,
            };
            const unauthorized = await rpc("delegated.begin", common, false);
            expect(unauthorized.status).toBe(403);
            expect(records).toHaveLength(0);
            const begin = await rpc("delegated.begin", common);
            expect(begin.status).toBe(200);
            const challenge = (await begin.json()).result;
            const performed = await rpc("delegated.perform", {
                ...common,
                proof: agent.proof(challenge),
            });
            expect(performed.status).toBe(
                resource === "repository-x" ? 200 : 403,
            );
            if (resource === "repository-x") {
                expect(await performed.json()).toEqual({
                    result: {
                        resource,
                        result: "synthetic-repository-content",
                    },
                });
                expect(records.map((r) => r.result)).toEqual([
                    "requested",
                    "authorized",
                    "success",
                ]);
            } else {
                expect(await performed.json()).toEqual({
                    error: "TOOL_DENIED",
                });
                expect(records.map((r) => r.result)).toEqual([
                    "requested",
                    "denied",
                ]);
                expect(records[1]?.reason).toBe("default-deny");
            }
            expect(
                records.every(
                    (r) =>
                        r.actor.id === subject.subjectId &&
                        r.actor.kind === "agent",
                ),
            ).toBe(true);
            const replay = await rpc("delegated.perform", {
                ...common,
                proof: agent.proof(challenge),
            });
            expect(replay.status).toBe(403);
        } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
            key.fill(0);
        }
    },
);
