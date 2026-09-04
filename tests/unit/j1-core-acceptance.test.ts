import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const readText = (path: string) => readFile(new URL(path, root), "utf8");
const readJson = async <T>(path: string): Promise<T> =>
    JSON.parse(await readText(path)) as T;
const exists = async (path: string): Promise<boolean> => {
    try {
        await access(new URL(path, root));
        return true;
    } catch {
        return false;
    }
};

interface J1Manifest {
    milestone: string;
    version: string;
    foundationBaselineSha: string;
    foundationValidationRun: string;
    principle: string;
    scope: { included: string[]; excluded: string[] };
    contracts: Record<string, number>;
    requiredFoundationContracts: string[];
    securityRules: string[];
    milestones: string[];
    releaseMetadataDebt: {
        statusDocumentStillContainsPreGoText: boolean;
        foundationManifestStillCarriesRcLabel: boolean;
        rule: string;
    };
}

interface AcceptanceCatalogue {
    milestone: string;
    gates: Array<{ id: string; name: string }>;
}

interface FoundationManifest {
    contracts: Record<string, number>;
}

describe("J1.0 Core + Conversation specification acceptance", () => {
    it("A-T freeze is complete and remains Foundation v1 compatible", async () => {
        const manifest = await readJson<J1Manifest>(
            "foundation/j1-core-conversation-v1.manifest.json",
        );
        const foundation = await readJson<FoundationManifest>(
            "foundation/foundation-v1.manifest.json",
        );
        const catalogue = await readJson<AcceptanceCatalogue>(
            "tests/acceptance/j1.0-gates.json",
        );

        expect(manifest.milestone).toBe("J1.0");
        expect(manifest.version).toBe("1.0.0-spec");
        expect(manifest.foundationBaselineSha).toBe(
            "f52eaf50b5c18d5970c40195b50f396e802b59e2",
        );
        expect(manifest.foundationValidationRun).toBe("33834315603");
        expect(manifest.principle).toBe(
            "JARVIS is the system. AI models are replaceable brains used by JARVIS.",
        );

        const expectedGates = "ABCDEFGHIJKLMNOPQRST".split("");
        expect(catalogue.milestone).toBe("J1.0");
        expect(catalogue.gates.map(({ id }) => id)).toEqual(expectedGates);
        expect(new Set(catalogue.gates.map(({ id }) => id)).size).toBe(20);

        expect(Object.keys(manifest.contracts)).toHaveLength(16);
        expect(
            Object.values(manifest.contracts).every((version) => version === 1),
        ).toBe(true);
        for (const contract of manifest.requiredFoundationContracts)
            expect(foundation.contracts[contract]).toBeGreaterThan(0);

        expect(manifest.securityRules.length).toBeGreaterThanOrEqual(15);
        expect(manifest.securityRules.join(" ")).toContain(
            "Model output is never authorization",
        );
        expect(manifest.securityRules.join(" ")).toContain("D5");
        expect(manifest.securityRules.join(" ")).toContain("NEVER_STORE");
        expect(manifest.securityRules.join(" ")).toContain("SHUTDOWN");

        expect(manifest.milestones).toHaveLength(13);
        expect(manifest.milestones[0]).toContain("J1.0");
        expect(manifest.milestones.at(-1)).toContain("J1.12");

        for (const path of [
            "docs/roadmap/j1.0.md",
            "docs/architecture/j1-core-conversation-architecture.md",
            "docs/contracts/j1-core-conversation-contracts.md",
            "docs/security/j1-core-conversation-security.md",
        ])
            expect(await exists(path)).toBe(true);

        const roadmap = await readText("docs/roadmap/j1.0.md");
        expect(roadmap).toContain(
            "J1 runtime implementation: NOT STARTED BY J1.0",
        );
        expect(roadmap).toContain("J1.1 Conversation/session engine");
        expect(roadmap).toContain(
            "J1.12 Full integration/adversarial validation",
        );
        expect(roadmap).toContain("Conversation never creates authority");

        const architecture = await readText(
            "docs/architecture/j1-core-conversation-architecture.md",
        );
        expect(architecture).toContain("No direct model-to-tool path exists");
        expect(architecture).toContain("Conversation IDs");

        const contracts = await readText(
            "docs/contracts/j1-core-conversation-contracts.md",
        );
        expect(contracts).toContain(
            "Stream events cannot authorize side effects",
        );
        expect(contracts).toContain("NEVER_STORE");

        const security = await readText(
            "docs/security/j1-core-conversation-security.md",
        );
        expect(security).toContain("Prompt injection boundary");
        expect(security).toContain("D5 is external-model ineligible");

        expect(manifest.scope.excluded).toContain(
            "runtime implementation beyond J1.0 specification and freeze artifacts",
        );
        expect(await exists("infrastructure/migrations/0015.sql")).toBe(false);
        expect(await exists("infrastructure/migrations/0015_j1.sql")).toBe(
            false,
        );

        expect(
            manifest.releaseMetadataDebt.statusDocumentStillContainsPreGoText,
        ).toBe(true);
        expect(
            manifest.releaseMetadataDebt.foundationManifestStillCarriesRcLabel,
        ).toBe(true);
        expect(manifest.releaseMetadataDebt.rule).toContain(
            "signed Foundation v1 release SHA",
        );
    });
});
