import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(path, "utf8");

describe("J1.12 final integration release contract", () => {
    it("freezes exactly twenty A-T gates on the J1.8 baseline", async () => {
        const manifest = JSON.parse(
            await read("tests/acceptance/j1.12-gates.json"),
        ) as {
            milestone: string;
            baseline: string;
            gates: Array<{ id: string; name: string }>;
        };
        expect(manifest.milestone).toBe("J1.12");
        expect(manifest.baseline).toBe(
            "cf203bb71df1d4cb19e819546f2684201e04cc16",
        );
        expect(manifest.gates.map((gate) => gate.id).join("")).toBe(
            "ABCDEFGHIJKLMNOPQRST",
        );
    });

    it("requires the complete identity to UI chain and exact-main qualification", async () => {
        const roadmap = await read("docs/roadmap/j1.12.md");
        for (const boundary of [
            "Root Owner",
            "trusted device",
            "authenticated Foundation session",
            "J1 conversation session",
            "operating mode",
            "context assembly",
            "governed memory retrieval",
            "model routing",
            "UniversalToolGateway",
            "Root Owner A3 decision",
            "conversation/history persistence",
            "audit/events",
            "authenticated Web UI",
        ])
            expect(roadmap).toContain(boundary);
        expect(roadmap).toContain("exact-main");
        expect(roadmap).toContain("J1 Core + Conversation v1 GO");
        expect(roadmap).toContain("NOT ISSUED");
    });

    it("keeps emergency, replay, outage and no-bypass requirements explicit", async () => {
        const roadmap = await read("docs/roadmap/j1.12.md");
        for (const required of [
            "SAFE MODE",
            "FREEZE",
            "SHUTDOWN",
            "PostgreSQL",
            "Redis",
            "model/provider",
            "tool",
            "browser disconnect",
            "Duplicate requests",
            "Approval is exact-bound",
            "NEVER_STORE",
            "D5",
            "never replays protected side effects",
        ])
            expect(roadmap).toContain(required);
    });

    it(
        "marks J1.11 content-only behavior as development scaffolding, not release completion",
        async () => {
            const roadmap = await read("docs/roadmap/j1.12.md");
            const handler = await read("apps/api/src/conversation-http.ts");
            expect(roadmap).toContain(
                "J1.11's synthetic content-only adapter is development scaffolding only",
            );
            expect(handler).toContain("SyntheticModelAdapter");
            expect(handler).toContain("approval: null");
            expect(handler).toContain("tool: null");
        },
    );
});
