import { it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, symlink, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
    minimizeExternalContext,
    rejectGenericSecrets,
} from "@jarvis/security";
import {
    LocalEncryptedObjects,
    storageHash,
    verifyPortableExport,
    PrivateDataGateway,
    PrivateRecords,
} from "@jarvis/storage";
import { AuthorizedMockToolGateway } from "@jarvis/tools";
import { RetentionPolicySchema, StorageRecordSchema } from "@jarvis/shared";
import { goRequest } from "../fixtures/governance.js";
const dirs: string[] = [];
afterEach(async () => {
    for (const d of dirs.splice(0))
        await rm(d, { recursive: true, force: true });
});
const item = () => ({
    id: "record-a",
    classification: "D2",
    fields: { content: "approved project information", password: "blocked" },
    policy: {
        version: 1,
        mode: "APPROVED_EXTERNAL_AI",
        providers: ["synthetic"],
        regions: ["eu"],
        fields: ["content", "password"],
        maximumCharacters: 100,
    },
});
it.each([
    { api_key: "synthetic-value" },
    { nested: [{ password: "synthetic-value" }] },
    { refresh_token: "synthetic-value" },
    "-----BEGIN PRIVATE KEY----- synthetic",
    "ghp_abcdefgh1234567890",
    "password=synthetic-value",
])("rejects credential-bearing generic data %#", (value) => {
    expect(() => rejectGenericSecrets(value)).toThrow(
        "SECRET_IN_GENERIC_DATA_DENIED",
    );
});
it("allows ordinary content without claiming universal secret detection", () => {
    expect(() =>
        rejectGenericSecrets({ content: "Remember to review documentation" }),
    ).not.toThrow();
});
it("minimizes selected approved fields to the exact character budget", () => {
    const result = minimizeExternalContext(
        [item()],
        "synthetic",
        "eu",
        ["record-a"],
        8,
    );
    expect(result.items).toEqual([
        { id: "record-a", fields: { content: "approved" } },
    ]);
});
it.each(["LOCAL_ONLY", "PRIVATE_INFRASTRUCTURE", "NEVER_EXTERNAL"])(
    "blocks %s context",
    (mode) => {
        const v = item();
        v.policy.mode = mode;
        expect(
            minimizeExternalContext([v], "synthetic", "eu", [v.id]).items,
        ).toEqual([]);
    },
);
it.each(["D4", "D5"])(
    "excludes %s regardless of provider allowlist",
    (classification) => {
        expect(
            minimizeExternalContext(
                [{ ...item(), classification }],
                "synthetic",
                "eu",
                ["record-a"],
            ).items,
        ).toEqual([]);
    },
);
it("requires provider, region and task selection", () => {
    expect(
        minimizeExternalContext([item()], "other", "eu", ["record-a"]).items,
    ).toEqual([]);
    expect(
        minimizeExternalContext([item()], "synthetic", "other", ["record-a"])
            .items,
    ).toEqual([]);
    expect(
        minimizeExternalContext([item()], "synthetic", "eu", []).items,
    ).toEqual([]);
});
it("rejects malformed context and invalid limits", () => {
    expect(() =>
        minimizeExternalContext(
            [{ ...item(), unexpected: true }],
            "synthetic",
            "eu",
            [],
        ),
    ).toThrow();
    expect(() =>
        minimizeExternalContext([], "synthetic", "eu", [], -1),
    ).toThrow();
});
it("stores ciphertext bytes with owner isolation and detects corruption", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jarvis-objects-test-"));
    dirs.push(dir);
    const store = new LocalEncryptedObjects(dir),
        bytes = Buffer.from("synthetic encrypted bytes");
    const key = await store.put("owner-a", bytes);
    expect(key).toBe(storageHash(bytes));
    expect(await store.get("owner-a", key)).toEqual(bytes);
    await expect(store.get("owner-b", key)).rejects.toThrow();
    await writeFile(join(dir, storageHash("owner-a"), key), "corrupted", {
        mode: 0o600,
    });
    await expect(store.get("owner-a", key)).rejects.toThrow();
});
it("rejects traversal, permissive directories and symlink roots", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jarvis-object-safety-"));
    dirs.push(dir);
    const store = new LocalEncryptedObjects(dir);
    await expect(store.get("owner", "../file")).rejects.toThrow();
    await chmod(dir, 0o755);
    await expect(store.put("owner", Buffer.from("x"))).rejects.toThrow();
    await chmod(dir, 0o700);
    const link = join(dir, "link");
    await symlink(dir, link);
    await expect(
        new LocalEncryptedObjects(link).put("owner", Buffer.from("x")),
    ).rejects.toThrow();
});
it("validates exact portable export manifest membership and checksums", () => {
    const bytes = "{}";
    const value = {
        manifest: {
            version: 1,
            id: randomUUID(),
            ownerId: "owner-test",
            generatedAt: Date.now(),
            domains: ["schema"],
            encryption: "owner-plaintext-export",
            schemaVersions: { storage: 1 },
            secretsIncluded: false,
            items: [
                {
                    path: "schema/storage.json",
                    sha256: storageHash(bytes),
                    size: 2,
                },
            ],
        },
        files: { "schema/storage.json": bytes },
    };
    expect(verifyPortableExport(value)).toEqual(value);
    expect(() =>
        verifyPortableExport({
            ...value,
            files: { "schema/storage.json": "tampered" },
        }),
    ).toThrow();
    expect(() =>
        verifyPortableExport({
            ...value,
            files: { ...value.files, extra: "x" },
        }),
    ).toThrow();
    expect(() =>
        verifyPortableExport({
            ...value,
            manifest: { ...value.manifest, secretsIncluded: true },
        }),
    ).toThrow();
});
it.each(["KEEP_UNTIL_DATE", "KEEP_FOR_DURATION", "DELETE_AFTER_SESSION"])(
    "requires explicit retention boundaries: %s",
    (mode) => {
        expect(() =>
            RetentionPolicySchema.parse({
                version: 1,
                id: randomUUID(),
                revision: 1,
                mode,
                expiresAt: null,
                durationMs: null,
                sessionId: null,
            }),
        ).toThrow();
    },
);
it.each([
    {
        mode: "KEEP_FOREVER",
        expiresAt: 1000,
        durationMs: null,
        sessionId: null,
    },
    { mode: "NEVER_STORE", expiresAt: null, durationMs: 1000, sessionId: null },
    {
        mode: "KEEP_UNTIL_DATE",
        expiresAt: 1000,
        durationMs: null,
        sessionId: "other",
    },
])("rejects conflicting retention boundaries %#", (boundary) => {
    expect(() =>
        RetentionPolicySchema.parse({
            version: 1,
            id: randomUUID(),
            revision: 1,
            ...boundary,
        }),
    ).toThrow();
});
it.each(["data.record.read", "data.object.forget", "data.deletion.purge", "data.retention.plan", "data.retention.change", "data.retention.execute"])(
    "rejects direct bypass with a forged authorization: %s",
    async (toolId) => {
        const gateway = new PrivateDataGateway(
            new PrivateRecords(async () => {
                throw new Error("must not decrypt");
            }),
            new AuthorizedMockToolGateway(),
        );
        const request = goRequest(toolId, {
            resource: "owner-data",
            input: {
                recordId: randomUUID(),
                classification: "D3",
                payloadHash: null,
            },
        });
        await expect(gateway.execute(request, {} as never, {})).rejects.toThrow(
            "DIRECT_DATA_BYPASS_DENIED",
        );
    },
);
it("cannot understate export or inventory classification", () => {
    const gateway = new PrivateDataGateway(
        new PrivateRecords(async () => {
            throw new Error("unused");
        }),
        new AuthorizedMockToolGateway(),
    );
    for (const toolId of [
        "data.export",
        "data.inventory",
        "data.backup.restore",
        "data.keys.rotate",
        "data.deletion.purge",
        "data.retention.plan",
        "data.retention.change",
        "data.retention.execute",
    ])
        expect(() =>
            gateway.describe(
                goRequest(toolId, {
                    resource: "owner-data",
                    input: {
                        recordId: null,
                        classification: "D0",
                        payloadHash: null,
                    },
                }),
            ),
        ).toThrow("DATA_ZONE_UNDERSTATED");
});
it("rejects incomplete storage records rather than applying defaults", () => {
    expect(() =>
        StorageRecordSchema.parse({ version: 1, domain: "memory" }),
    ).toThrow();
});
