import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ActionInputSchemas } from "@jarvis/identity";
import { loadConfig, runtimeIdentity } from "@jarvis/config";

const digest = "a".repeat(64);

async function source(path: string) {
    return readFile(path, "utf8");
}

describe("J1.11 conversational Web UI security contract", () => {
    it("binds existing read-only identity inspection to an optional exact request digest", () => {
        expect(
            ActionInputSchemas["identity.inspect"].parse({
                requestBindingDigest: digest,
            }),
        ).toEqual({ requestBindingDigest: digest });
        expect(() =>
            ActionInputSchemas["identity.inspect"].parse({
                requestBindingDigest: "not-a-digest",
            }),
        ).toThrow();
        expect(() =>
            ActionInputSchemas["identity.inspect"].parse({
                requestBindingDigest: digest,
                ownerId: "attacker",
            }),
        ).toThrow();
    });

    it("keeps the session HttpOnly while allowing sibling trusted API routes", async () => {
        const identityRoute = await source(
            "apps/web/app/api/identity/route.ts",
        );
        expect(identityRoute).toContain("httpOnly: true");
        expect(identityRoute).toContain("secure: true");
        expect(identityRoute).toContain('sameSite: "strict"');
        expect(identityRoute).toContain('path: "/api"');
        expect(identityRoute).not.toContain('path: "/"');
    });

    it("constructs conversation authority server-side and never accepts a browser token", async () => {
        const proxy = await source("apps/web/app/api/conversation/route.ts");
        const client = await source(
            "apps/web/app/conversation/conversation-console.tsx",
        );
        expect(proxy).toContain('get("jarvis_session")');
        expect(proxy).toContain("signService(");
        expect(proxy).toContain('"conversation.rpc"');
        expect(proxy).toContain("const normalizedRequest");
        expect(proxy).not.toContain("request.ownerId");
        expect(proxy).not.toContain("request.sessionId");
        expect(proxy).not.toContain("request.securityEpoch");
        expect(client).not.toContain("jarvis_session");
        expect(client).not.toContain("localStorage");
    });

    it("renders privacy, source, approval, tool and ordered event evidence explicitly", async () => {
        const client = await source(
            "apps/web/app/conversation/conversation-console.tsx",
        );
        for (const text of [
            "Privacy:",
            "Processing:",
            "External AI:",
            "Source",
            "Provenance",
            "Security epoch",
            "Approval",
            "Tool",
            "Ordered stream events",
        ])
            expect(client).toContain(text);
    });

    it("keeps the J1.11 adapter content-only and names J1.12 as the final integration boundary", async () => {
        const handler = await source("apps/api/src/conversation-http.ts");
        const roadmap = await source("docs/roadmap/j1.11.md");
        expect(handler).toContain("SyntheticModelAdapter");
        expect(handler).toContain("approval: null");
        expect(handler).toContain("tool: null");
        expect(handler).toContain('processingTarget: "LOCAL"');
        expect(handler).toContain("externalAI: false");
        expect(roadmap).toContain("J1.12 must replace/compose it");
    });

    it("allows only an exact HTTPS remote origin and matching RP ID", async () => {
        const config = await loadConfig("config/development.json");
        const previousOrigin = process.env.JARVIS_REMOTE_ORIGIN;
        const previousRpID = process.env.JARVIS_REMOTE_RP_ID;
        try {
            process.env.JARVIS_REMOTE_ORIGIN = "https://jarvis.example.com";
            process.env.JARVIS_REMOTE_RP_ID = "jarvis.example.com";
            expect(runtimeIdentity(config)).toMatchObject({
                origin: "https://jarvis.example.com",
                rpID: "jarvis.example.com",
            });
            process.env.JARVIS_REMOTE_ORIGIN = "http://jarvis.example.com";
            expect(() => runtimeIdentity(config)).toThrow(
                "INVALID_REMOTE_IDENTITY",
            );
            process.env.JARVIS_REMOTE_ORIGIN = "https://jarvis.example.com";
            process.env.JARVIS_REMOTE_RP_ID = "other.example.com";
            expect(() => runtimeIdentity(config)).toThrow(
                "INVALID_REMOTE_IDENTITY",
            );
            delete process.env.JARVIS_REMOTE_RP_ID;
            expect(() => runtimeIdentity(config)).toThrow(
                "INVALID_REMOTE_IDENTITY",
            );
        } finally {
            if (previousOrigin === undefined)
                delete process.env.JARVIS_REMOTE_ORIGIN;
            else process.env.JARVIS_REMOTE_ORIGIN = previousOrigin;
            if (previousRpID === undefined)
                delete process.env.JARVIS_REMOTE_RP_ID;
            else process.env.JARVIS_REMOTE_RP_ID = previousRpID;
        }
    });
});
