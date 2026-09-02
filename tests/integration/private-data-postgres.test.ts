import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { loadConfig } from "@jarvis/config";
import {
    FileSecretManager,
    RecordCipher,
    GovernanceEngine,
    initializeDevelopmentVault,
    ensureStorageSecrets,
} from "@jarvis/security";
import {
    databasePool,
    migrate,
    PostgresIdentityRepository,
    PrivateRecords,
    DataKeys,
    LocalEncryptedObjects,
    PrivateObjects,
    PrivateDataGateway,
    PortableExports,
    StorageRecovery,
    PostgresIsolatedRestore,
    verifyPortableExport,
    storageHash,
    type DatabasePool,
} from "@jarvis/storage";
import { canonical, digest } from "@jarvis/identity";
import { StorageRecordSchema, type StorageRecord } from "@jarvis/shared";
import { AuthorizedMockToolGateway } from "@jarvis/tools";
import {
    fixture,
    root,
    ownerAction,
    TestDevice,
} from "../fixtures/identity.js";
import { dataPolicy } from "../fixtures/data.js";
import type { Pending, Issued } from "../fixtures/governance.js";

const database = "jarvis_data_test_" + randomBytes(8).toString("hex");
const restoreDatabase = "jarvis_restore_test_" + randomBytes(8).toString("hex");
const config = await loadConfig("config/development.json");
let admin: DatabasePool,
    sourceAdmin: DatabasePool,
    targetAdmin: DatabasePool,
    pool: DatabasePool;
const created: string[] = [];
let dir: string, repository: PostgresIdentityRepository;
let f: ReturnType<typeof fixture>,
    owner: Awaited<ReturnType<typeof root>>,
    subjectId: string;
const subjectDevice = new TestDevice();
const cipher = new RecordCipher(randomBytes(32));
let records: PrivateRecords,
    backupStore: LocalEncryptedObjects,
    restoreObjects: LocalEncryptedObjects;
let ownerCommand: (command: string, data: unknown) => Promise<unknown>;
let subject: (command: string, data: unknown) => Promise<unknown>;
const capabilities = [
    "data.read",
    "data.write",
    "data.delete",
    "data.export",
    "data.inventory",
    "data.context.prepare",
    "storage.object.read",
    "storage.object.write",
    "storage.keys.rotate",
    "storage.backup.create",
    "storage.backup.restore",
    "storage.migration.execute",
];

beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "jarvis-private-data-"));
    const actor = {
        version: 1 as const,
        id: "jarvis-data-test",
        kind: "service" as const,
        environment: "development" as const,
    };
    const connectionVault = new FileSecretManager(
        process.env.JARVIS_VAULT_FILE ?? ".jarvis/development/vault.json",
        process.env.JARVIS_MASTER_KEY_FILE ??
            resolve(
                homedir(),
                ".config/jarvis/typescript/development/master.key",
            ),
        "development",
        actor.id,
        new Set([
            config.storage.postgres.passwordRef,
            config.storage.postgres.migratorPasswordRef,
        ]),
    );
    const runtime = await connectionVault.lease(
            config.storage.postgres.passwordRef,
            actor,
        ),
        migrator = await connectionVault.lease(
            config.storage.postgres.migratorPasswordRef,
            actor,
        );
    try {
        admin = databasePool(
            config.storage.postgres,
            migrator.value.toString(),
            true,
        );
        for (const name of [database, restoreDatabase]) {
            if (!/^jarvis_(?:data|restore)_test_[a-f0-9]{16}$/.test(name))
                throw new Error("UNSAFE_TEST_DATABASE");
            await admin.query(`CREATE DATABASE ${name}`);
            created.push(name);
        }
        sourceAdmin = databasePool(
            { ...config.storage.postgres, database },
            migrator.value.toString(),
            true,
        );
        targetAdmin = databasePool(
            { ...config.storage.postgres, database: restoreDatabase },
            migrator.value.toString(),
            true,
        );
        for (const db of [sourceAdmin, targetAdmin])
            await migrate(
                db,
                "infrastructure/migrations",
                "development",
                config.storage.postgres.runtimeUser,
                runtime.value.toString(),
            );
        pool = databasePool(
            { ...config.storage.postgres, database },
            runtime.value.toString(),
        );
    } finally {
        runtime.destroy();
        migrator.destroy();
    }
    const vaultPath = join(dir, "vault", "secrets.json"),
        keyPath = join(dir, "keys", "key");
    await initializeDevelopmentVault(vaultPath, keyPath);
    await ensureStorageSecrets(vaultPath, keyPath);
    const vault = new FileSecretManager(
        vaultPath,
        keyPath,
        "development",
        actor.id,
        new Set(["development/storage/kek/k1", "development/storage/kek/k2"]),
    );
    const keys = new DataKeys(vault, actor.id, cipher);
    records = new PrivateRecords((ownerId) => keys.cipher(ownerId));
    const objects = new PrivateObjects(
        new LocalEncryptedObjects(join(dir, "objects")),
        (id) => keys.cipher(id),
        cipher,
    );
    backupStore = new LocalEncryptedObjects(join(dir, "backups"));
    restoreObjects = new LocalEncryptedObjects(join(dir, "restored-objects"));
    const recovery = new StorageRecovery(
        backupStore,
        new LocalEncryptedObjects(join(dir, "objects")),
        new RecordCipher(randomBytes(32)),
        new PostgresIsolatedRestore(
            restoreDatabase,
            targetAdmin,
            restoreObjects,
            cipher,
        ),
    );
    repository = new PostgresIdentityRepository(pool, cipher);
    f = fixture(
        repository,
        (clock) =>
            new GovernanceEngine(
                new PrivateDataGateway(
                    records,
                    new AuthorizedMockToolGateway(),
                    {
                        keys,
                        objects,
                        exports: new PortableExports(records, objects, cipher),
                        recovery,
                    },
                ),
                clock,
            ).handle,
    );
    owner = await root(f);
    const createdSubject = (await ownerAction(
        f.engine,
        owner.device,
        owner.session,
        "subject.create",
        {
            name: "Restricted data executor",
            kind: "service",
            publicKey: subjectDevice.input.publicKey,
            scopes: [],
            resources: [],
        },
    )) as { subjectId: string };
    subjectId = createdSubject.subjectId;
    ownerCommand = (command, data) =>
        ownerAction(f.engine, owner.device, owner.session, "security.command", {
            command,
            data,
        });
    subject = async (command, data) => {
        const input = { command, data },
            challenge = await f.engine.beginSecuritySubject(subjectId, input);
        return f.engine.performSecuritySubject(
            subjectId,
            subjectDevice.proof(challenge),
            input,
        );
    };
    await ownerCommand("controls.set", {
        flag: "READ_ONLY_MODE",
        active: false,
    });
    await ownerCommand("policy.create", {
        version: 1,
        id: "owner.storage-test",
        revision: 1,
        status: "draft",
        createdAt: 0,
        activatedAt: null,
        creatorId: owner.session.ownerId,
        precedence: "owner",
        supersedes: null,
        rules: [
            {
                id: "exact-data-scope",
                effect: "allow",
                actorIds: [subjectId],
                capabilities,
                scope: {
                    version: 1,
                    resource: "owner-data",
                    environments: ["development"],
                },
                maximumRisk: "R4",
                requireApproval: true,
                requireStepUp: true,
                allowEscalationRequest: true,
                requireSimulation: true,
                requireTests: true,
                requireScan: true,
                minimumConfidence: 1,
            },
        ],
    });
    await ownerCommand("policy.activate", {
        id: "owner.storage-test",
        revision: 1,
    });
    // Inventory is the bounded R2 parent capability; private actions still need
    // a separate, exact owner approval. Never create standing R3/R4 authority.
    await ownerCommand("delegation.grant", {
        version: 1,
        actorId: subjectId,
        capability: "data.inventory",
        resource: "owner-data",
        environment: "development",
        ttlSeconds: 600,
        maximumUses: 100,
        maximumRisk: "R2",
        toolId: null,
    });
    await ownerCommand("budget.set", {
        version: 1,
        actorId: subjectId,
        maximumRuntimeMs: 900000,
        maximumSpendMinor: 0,
        spentMinor: 0,
        maximumToolCalls: 100,
        toolCalls: 0,
        maximumRisk: "R4",
        resources: ["owner-data"],
        environments: ["development"],
        startedAt: Date.now(),
        notBefore: 0,
        expiresAt: Date.now() + 900000,
        networkAllowed: false,
        maximumConcurrent: 1,
        approvalThreshold: "R3",
    });
}, 60000);
afterAll(async () => {
    await pool?.end();
    await sourceAdmin?.end();
    await targetAdmin?.end();
    for (const name of created) await admin.query(`DROP DATABASE ${name}`);
    await admin?.end();
    if (dir) await rm(dir, { recursive: true, force: true });
});
async function authorize(
    toolId: string,
    classification: string,
    recordId: string | null,
    transient?: unknown,
) {
    const request = {
        version: 1,
        id: randomUUID(),
        toolId,
        resource: "owner-data",
        environment: "development",
        input: {
            classification,
            recordId,
            payloadHash:
                transient === undefined ? null : digest(canonical(transient)),
        },
    };
    const pending = (await subject("request", request)) as Pending;
    expect(pending.approval.id).toBeTruthy();
    await ownerCommand("approval.decide", {
        version: 1,
        approvalId: pending.approval.id,
        requestHash: pending.requestHash,
        decision: "approve",
    });
    const issued = (await subject("authorize", {
        request,
        approvalId: pending.approval.id,
    })) as Issued;
    return {
        request,
        authorization: issued.authorization,
        ...(transient === undefined ? {} : { transient }),
    };
}
async function execute(
    toolId: string,
    classification: string,
    recordId: string | null = null,
    transient?: unknown,
) {
    const input = await authorize(toolId, classification, recordId, transient);
    const result = (await subject("execute", input)) as {
        result: { value: unknown };
    };
    return result.result.value;
}
function record(
    domain: StorageRecord["domain"],
    payload: StorageRecord["payload"],
    classification: "D0" | "D2" | "D3" = "D2",
    sources: string[] = [],
) {
    const policy = dataPolicy();
    policy.classification = classification;
    policy.consent.createMemory = true;
    policy.consent.projectKnowledge = true;
    policy.consent.keepAttachments = true;
    return StorageRecordSchema.parse({
        version: 1,
        id: randomUUID(),
        ownerId: owner.session.ownerId,
        actorId: subjectId,
        domain,
        revision: 1,
        previousRevision: null,
        projectId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        reason: "synthetic acceptance",
        policy,
        retention: {
            version: 1,
            id: randomUUID(),
            revision: 1,
            mode: "KEEP_FOREVER",
            expiresAt: null,
            durationMs: null,
            sessionId: null,
        },
        external: {
            version: 1,
            mode: "NEVER_EXTERNAL",
            providers: [],
            regions: [],
            fields: [],
            maximumCharacters: 0,
        },
        provenance: [
            {
                kind: "owner-input",
                sourceId: "synthetic-fixture",
                sourceVersion: 1,
                actorId: owner.session.ownerId,
                capturedAt: Date.now(),
                confidence: 1,
            },
        ],
        sources,
        payload,
    });
}
let conversation: StorageRecord,
    memory: StorageRecord,
    embedding: StorageRecord,
    entity: StorageRecord;
let objectId: string, backup: { id: string; items: { path: string }[] };
it("B-D: persists canonical encrypted conversations and rejects cross-zone reads", async () => {
    conversation = record(
        "conversation",
        {
            title: "Sensitive synthetic title",
            participants: [owner.session.ownerId],
            archived: false,
        },
        "D3",
    );
    await execute("data.record.put", "D3", conversation.id, conversation);
    const message = record(
        "message",
        {
            conversationId: conversation.id,
            authorId: subjectId,
            content: "Synthetic confidential sentence",
            contentType: "text/plain",
            model: { provider: "synthetic-a", model: "replaceable" },
        },
        "D3",
    );
    await execute("data.record.put", "D3", message.id, message);
    expect(await execute("data.record.read", "D3", conversation.id)).toEqual(
        conversation,
    );
    expect(
        JSON.stringify(
            (
                await pool.query(
                    "SELECT payload FROM conversations.conversations",
                )
            ).rows,
        ),
    ).not.toContain("Sensitive synthetic title");
    await expect(
        execute("data.record.read", "D2", conversation.id),
    ).rejects.toThrow();
    const outsider = new TestDevice();
    const denied = (await ownerAction(
        f.engine,
        owner.device,
        owner.session,
        "subject.create",
        {
            name: "No data authority",
            kind: "agent",
            publicKey: outsider.input.publicKey,
            scopes: [],
            resources: [],
        },
    )) as { subjectId: string };
    const request = (await authorize("data.record.read", "D3", conversation.id))
        .request;
    const input = { command: "request", data: request },
        challenge = await f.engine.beginSecuritySubject(
            denied.subjectId,
            input,
        );
    await expect(
        f.engine.performSecuritySubject(
            denied.subjectId,
            outsider.proof(challenge),
            input,
        ),
    ).rejects.toThrow();
}, 30000);
it("E: encrypts object bytes and verifies the decrypted hash", async () => {
    objectId = randomUUID();
    const policy = dataPolicy();
    policy.consent.keepAttachments = true;
    const upload = {
        id: objectId,
        filename: "synthetic.txt",
        mimeType: "text/plain",
        contentBase64: Buffer.from("private file fixture").toString("base64"),
        policy,
    };
    await execute("data.object.put", "D2", objectId, upload);
    const result = (await execute("data.object.get", "D2", objectId)) as {
        contentBase64: string;
    };
    expect(Buffer.from(result.contentBase64, "base64").toString()).toBe(
        "private file fixture",
    );
});
it("F-G: persists provenance, private vector linkage and knowledge lineage", async () => {
    memory = record(
        "memory",
        {
            kind: "project",
            subject: "jarvis",
            content: "Synthetic memory",
            confidence: 1,
            lastVerifiedAt: null,
        },
        "D3",
        [conversation.id],
    );
    await execute("data.record.put", "D3", memory.id, memory);
    embedding = record(
        "embedding",
        {
            memoryId: memory.id,
            provider: "synthetic",
            model: "three-dimensions",
            dimensions: 3,
            values: [0.1, 0.2, 0.3],
            sourceVersion: 1,
        },
        "D3",
    );
    await execute("data.record.put", "D3", embedding.id, embedding);
    entity = record(
        "entity",
        { type: "project", name: "Synthetic entity", aliases: [] },
        "D3",
        [memory.id],
    );
    await execute("data.record.put", "D3", entity.id, entity);
    expect(
        (
            await pool.query(
                "SELECT embedding,encrypted_payload FROM memory.embeddings WHERE id=$1",
                [embedding.id],
            )
        ).rows[0],
    ).toMatchObject({ embedding: null });
    expect(await execute("data.lineage", "D3", memory.id)).toBeTruthy();
    const publicMemory = record(
        "memory",
        {
            kind: "semantic",
            subject: "public",
            content: "public fixture",
            confidence: 1,
            lastVerifiedAt: null,
        },
        "D0",
    );
    await execute("data.record.put", "D0", publicMemory.id, publicMemory);
    const publicVector = record(
        "embedding",
        {
            memoryId: publicMemory.id,
            provider: "synthetic",
            model: "three",
            dimensions: 3,
            values: [1, 0, 0],
            sourceVersion: 1,
        },
        "D0",
    );
    await execute("data.record.put", "D0", publicVector.id, publicVector);
    expect(
        (
            await pool.query(
                "SELECT vector_dims(embedding) AS dimensions FROM memory.embeddings WHERE id=$1",
                [publicVector.id],
            )
        ).rows[0].dimensions,
    ).toBe(3);
}, 30000);
it("I: rotates K1 to K2 and retains readable protected content", async () => {
    await execute("data.keys.rotate", "D4");
    expect(await execute("data.record.read", "D3", conversation.id)).toEqual(
        conversation,
    );
    const box = JSON.parse(
        (
            await pool.query(
                "SELECT payload FROM conversations.conversations WHERE id=$1",
                [conversation.id],
            )
        ).rows[0].payload,
    );
    expect(box.keyId).toBe("k2");
});
it("J: NEVER_STORE leaves no record, derived data or plaintext security history", async () => {
    const transient = record("conversation", {
        title: "NEVER_STORE_SYNTHETIC_SENTINEL",
        participants: [owner.session.ownerId],
        archived: false,
    });
    transient.retention.mode = "NEVER_STORE";
    transient.policy.retention = { mode: "never-store" };
    expect(
        await execute("data.record.put", "D2", transient.id, transient),
    ).toMatchObject({ stored: false });
    expect(
        (
            await pool.query(
                "SELECT * FROM storage.record_catalog WHERE id=$1",
                [transient.id],
            )
        ).rows,
    ).toEqual([]);
    expect(JSON.stringify(await repository.audit(1000))).not.toContain(
        "NEVER_STORE_SYNTHETIC_SENTINEL",
    );
});
it("K: exports portable records and objects with validated checksums, without secrets", async () => {
    const exported = verifyPortableExport(await execute("data.export", "D4"));
    expect(
        JSON.parse(exported.files[`conversation/${conversation.id}.json`]!),
    ).toEqual(conversation);
    expect(exported.manifest.secretsIncluded).toBe(false);
});
it("L: forget removes memory, private embedding and derived entity, retaining minimal tombstones", async () => {
    await execute("data.record.forget", "D3", memory.id);
    for (const id of [memory.id, embedding.id, entity.id])
        await expect(execute("data.record.read", "D3", id)).rejects.toThrow();
    expect(
        (
            await pool.query("SELECT * FROM memory.embeddings WHERE id=$1", [
                embedding.id,
            ])
        ).rows,
    ).toEqual([]);
    expect(
        (
            await pool.query(
                "SELECT * FROM storage.deletion_tombstones WHERE record_id=$1",
                [memory.id],
            )
        ).rows,
    ).toHaveLength(1);
}, 30000);
it("M-N: validates encrypted backup and restores into a named isolated database without old sessions", async () => {
    backup = (await execute("data.backup.create", "D4")) as typeof backup;
    expect(backup.id).toBeTruthy();
    await execute("data.backup.restore", "D4", backup.id);
    expect(
        (await targetAdmin.query("SELECT * FROM identity.sessions")).rows,
    ).toEqual([]);
    expect(
        (
            await targetAdmin.query(
                "SELECT * FROM memory.records WHERE id=$1",
                [memory.id],
            )
        ).rows,
    ).toEqual([]);
    expect(
        (
            await targetAdmin.query(
                "SELECT * FROM conversations.conversations WHERE id=$1",
                [conversation.id],
            )
        ).rows,
    ).toHaveLength(1);
    expect(
        (
            await targetAdmin.query(
                "SELECT * FROM storage.deletion_tombstones WHERE record_id=$1",
                [memory.id],
            )
        ).rows,
    ).toHaveLength(1);
}, 30000);
it("O: rejects a corrupted backup before changing restored state", async () => {
    const key = backup.items[0]!.path.slice("chunks/".length);
    await writeFile(
        join(dir, "backups", storageHash(owner.session.ownerId), key),
        "corrupted",
        { mode: 0o600 },
    );
    await expect(
        execute("data.backup.restore", "D4", backup.id),
    ).rejects.toThrow();
    expect(
        (
            await targetAdmin.query(
                "SELECT * FROM conversations.conversations WHERE id=$1",
                [conversation.id],
            )
        ).rows,
    ).toHaveLength(1);
});
it("P: synthetic destructive probe requires a current valid recovery snapshot and exact approval", async () => {
    await sourceAdmin.query(
        "INSERT INTO recovery.migration_probe(id,owner_id,payload) VALUES($1,$2,$3)",
        [
            randomUUID(),
            owner.session.ownerId,
            cipher.encrypt("synthetic", "migration-probe"),
        ],
    );
    await expect(
        execute("data.migration.probe", "D4", randomUUID()),
    ).rejects.toThrow();
    const fresh = (await execute("data.backup.create", "D4")) as { id: string };
    await execute("data.migration.probe", "D4", fresh.id);
    expect(
        (await pool.query("SELECT * FROM recovery.migration_probe")).rows,
    ).toEqual([]);
}, 30000);
it("Q: existing privacy consent overrides an external provider allowlist", async () => {
    const v = record("project", {
        name: "Synthetic private project",
        description: "Must remain local",
    });
    v.external = {
        version: 1,
        mode: "APPROVED_EXTERNAL_AI",
        providers: ["synthetic"],
        regions: ["eu"],
        fields: ["description"],
        maximumCharacters: 100,
    };
    await execute("data.record.put", "D2", v.id, v);
    expect(
        await execute("data.context.prepare", "D2", null, {
            ids: [v.id],
            provider: "synthetic",
            region: "eu",
            limit: 100,
        }),
    ).toMatchObject({ items: [], excluded: [v.id] });
});
it("S: data access history is append-only and payload-free; authorization cannot be replayed", async () => {
    const auth = await authorize("data.record.read", "D3", conversation.id);
    await subject("execute", auth);
    await expect(subject("execute", auth)).rejects.toThrow(
        "AUTHORIZATION_REPLAY",
    );
    await expect(
        pool.query("DELETE FROM security.data_access_events"),
    ).rejects.toThrow();
    await expect(
        pool.query("TRUNCATE security.data_access_events"),
    ).rejects.toThrow();
    const events = JSON.stringify(
        (await pool.query("SELECT record FROM security.data_access_events"))
            .rows,
    );
    expect(events).not.toContain("Sensitive synthetic title");
    expect(events).toContain("data.backup.restore");
});
