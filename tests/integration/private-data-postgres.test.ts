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
    StorageHealthService,
    PostgresIsolatedRestore,
    verifyPortableExport,
    storageHash,
    type DatabasePool,
} from "@jarvis/storage";
import { canonical, digest } from "@jarvis/identity";
import { StorageRecordSchema, RetentionCleanupPlanSchema, type StorageRecord } from "@jarvis/shared";
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
let storageClockOffset = 0;
let records: PrivateRecords,
    liveObjects: LocalEncryptedObjects,
    backupStore: LocalEncryptedObjects,
    restoreObjects: LocalEncryptedObjects;
let ownerCommand: (command: string, data: unknown) => Promise<unknown>;
let subject: (command: string, data: unknown) => Promise<unknown>;
const capabilities = [
    "data.read",
    "data.write",
    "data.retention.modify",
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
    "storage.health.read",
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
    records = new PrivateRecords((ownerId) => keys.cipher(ownerId), () => Date.now() + storageClockOffset);
    liveObjects = new LocalEncryptedObjects(join(dir, "objects"));
    const objects = new PrivateObjects(
        liveObjects,
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
            async (snapshot) => {
                for (const entry of snapshot.tables[
                    "storage.record_catalog"
                ]!) {
                    const row = entry as { id: string; deleted: boolean };
                    if (!row.deleted)
                        await records.read(snapshot.ownerId, row.id);
                }
            },
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
                        health: new StorageHealthService(
                            keys,
                            objects,
                            recovery,
                            "infrastructure/migrations",
                        ),
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
    try {
        const result = (await subject("execute", input)) as {
            result: { value: unknown };
        };
        return result.result.value;
    } catch (error) {
        const evidence = await pool.query(
            "SELECT record->>'reason' AS reason FROM security.data_access_events WHERE record->>'requestId'=$1 AND record->>'result'='denied'",
            [input.request.id],
        );
        const reason = evidence.rows[0]?.reason;
        if (reason) throw new Error(`DATA_EXECUTION_DENIED: ${reason}`);
        throw error;
    }
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
it("health reads never initialize missing key metadata", async () => {
    expect(await execute("data.health", "D4")).toMatchObject({
        status: "unavailable",
        keys: false,
        vault: false,
    });
    expect(
        (await pool.query("SELECT id FROM security.key_metadata")).rows,
    ).toEqual([]);
});
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
it(
    "L: stages attachment deletion, fails safely during file outage, then purges exact ciphertext",
    attachmentDeletionFlow,
    30000,
);
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
    expect(
        (
            await targetAdmin.query(
                "SELECT deleted FROM storage.objects WHERE id=$1",
                [objectId],
            )
        ).rows[0]?.deleted,
    ).toBe(true);
    expect(await restoreObjects.list(owner.session.ownerId)).toEqual([]);
    expect(
        (
            await targetAdmin.query(
                "SELECT state FROM storage.object_purges WHERE object_id=$1",
                [objectId],
            )
        ).rows[0]?.state,
    ).toBe("PURGED");
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
it("R: reports live database, vector, vault, key and object health, including backup corruption", async () => {
    const result = await execute("data.health", "D4");
    expect(result).toMatchObject({
        postgres: true,
        migrations: true,
        pgvector: true,
        objects: true,
        vault: true,
        keys: true,
        backupIntegrity: "invalid",
        status: "degraded",
    });
});
it("rejects modified transient payloads and cross-owner writes", async () => {
    const v = record("project", {
        name: "Exact payload",
        description: "Must not change",
    });
    const authorized = await authorize("data.record.put", "D2", v.id, v);
    await expect(
        subject("execute", {
            ...authorized,
            transient: {
                ...v,
                payload: { name: "Changed", description: "tampered" },
            },
        }),
    ).rejects.toThrow();
    expect(
        (
            await pool.query(
                "SELECT 1 FROM storage.record_catalog WHERE id=$1",
                [v.id],
            )
        ).rows,
    ).toEqual([]);
    await expect(
        execute("data.record.put", "D2", v.id, {
            ...v,
            ownerId: "owner-unrelated",
        }),
    ).rejects.toThrow();
});
it("rejects credentials hidden in metadata before persistence or content audit", async () => {
    const v = record("project", {
        name: "Safe title",
        description: "Safe content",
    });
    v.reason = "password=synthetic_metadata_credential";
    await expect(execute("data.record.put", "D2", v.id, v)).rejects.toThrow(
        "SECRET_IN_GENERIC_DATA_DENIED",
    );
    expect(
        (
            await pool.query(
                "SELECT 1 FROM storage.record_catalog WHERE id=$1",
                [v.id],
            )
        ).rows,
    ).toEqual([]);
    expect(JSON.stringify(await repository.audit(1000))).not.toContain(
        "synthetic_metadata_credential",
    );
});
it("requires approval covering the most sensitive derived data before cascade deletion", async () => {
    const source = record("project", {
        name: "Cascade source",
        description: "Private",
    });
    const derived = record(
        "entity",
        { type: "test", name: "Sensitive derivation", aliases: [] },
        "D3",
        [source.id],
    );
    await execute("data.record.put", "D2", source.id, source);
    await execute("data.record.put", "D3", derived.id, derived);
    await expect(
        execute("data.record.forget", "D2", source.id),
    ).rejects.toThrow("DERIVED_DELETE_ZONE_UNDERSTATED");
    expect(await execute("data.record.read", "D3", derived.id)).toEqual(
        derived,
    );
    await execute("data.record.forget", "D3", source.id);
    expect(
        (
            await pool.query(
                "SELECT id FROM storage.record_catalog WHERE id=ANY($1::uuid[]) AND deleted=false",
                [[source.id, derived.id]],
            )
        ).rows,
    ).toEqual([]);
}, 30000);
async function attachmentDeletionFlow() {
    const parent = record(
        "message",
        {
            conversationId: conversation.id,
            authorId: owner.session.ownerId,
            content: "Attachment parent",
            contentType: "text/plain",
            model: null,
        },
        "D3",
    );
    await execute("data.record.put", "D3", parent.id, parent);
    const attachment = record(
        "attachment",
        { messageId: parent.id, objectId },
        "D3",
    );
    await execute("data.record.put", "D3", attachment.id, attachment);
    await expect(execute("data.object.forget", "D2", objectId)).rejects.toThrow(
        "OBJECT_STILL_REFERENCED",
    );
    const key = (
        await pool.query("SELECT object_key FROM storage.objects WHERE id=$1", [
            objectId,
        ])
    ).rows[0].object_key;
    const deletion = (await execute("data.record.forget", "D3", parent.id)) as {
        id: string;
        state: string;
    };
    expect(deletion.state).toBe("DELETING");
    await expect(execute("data.object.get", "D2", objectId)).rejects.toThrow(
        "OBJECT_NOT_FOUND",
    );
    expect(await liveObjects.verify(owner.session.ownerId, key)).toBe(true);
    const originalDelete = liveObjects.delete;
    liveObjects.delete = async () => {
        throw new Error("synthetic object storage outage");
    };
    try {
        await expect(
            execute("data.deletion.purge", "D4", deletion.id),
        ).rejects.toThrow();
    } finally {
        liveObjects.delete = originalDelete;
    }
    expect(
        (
            await pool.query(
                "SELECT state FROM storage.object_purges WHERE deletion_id=$1",
                [deletion.id],
            )
        ).rows[0].state,
    ).toBe("PENDING");
    expect(
        JSON.parse(
            (
                await pool.query(
                    "SELECT payload FROM storage.deletion_requests WHERE id=$1",
                    [deletion.id],
                )
            ).rows[0].payload,
        ).state,
    ).toBe("DELETING");
    const authorization = await authorize(
        "data.deletion.purge",
        "D4",
        deletion.id,
    );
    expect(await subject("execute", authorization)).toMatchObject({
        result: { value: { state: "PURGED", backupExpiryRequired: true } },
    });
    await expect(subject("execute", authorization)).rejects.toThrow(
        "AUTHORIZATION_REPLAY",
    );
    await expect(
        liveObjects.get(owner.session.ownerId, key),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(
        (
            await pool.query(
                "SELECT id FROM storage.record_catalog WHERE id=ANY($1::uuid[]) AND deleted=false",
                [[parent.id, attachment.id]],
            )
        ).rows,
    ).toEqual([]);
    expect(
        (
            await pool.query(
                "SELECT payload FROM storage.object_versions WHERE object_id=$1",
                [objectId],
            )
        ).rows,
    ).toEqual([]);
}
it("recovers an interrupted unlinked-object purge without restoring active access", async () => {
    const id = randomUUID();
    const policy = dataPolicy();
    policy.consent.keepAttachments = true;
    await execute("data.object.put", "D2", id, {
        id,
        filename: "synthetic-cleanup.txt",
        mimeType: "text/plain",
        contentBase64: Buffer.from("synthetic cleanup content").toString(
            "base64",
        ),
        policy,
    });
    const deletion = (await execute("data.object.forget", "D2", id)) as {
        id: string;
        state: string;
    };
    expect(deletion.state).toBe("DELETING");
    const originalList = liveObjects.list;
    liveObjects.list = async () => {
        throw new Error("synthetic post-unlink interruption");
    };
    try {
        await expect(
            execute("data.deletion.purge", "D4", deletion.id),
        ).rejects.toThrow();
    } finally {
        liveObjects.list = originalList;
    }
    expect(
        (
            await pool.query(
                "SELECT state FROM storage.object_purges WHERE deletion_id=$1",
                [deletion.id],
            )
        ).rows[0]?.state,
    ).toBe("PENDING");
    await expect(execute("data.object.get", "D2", id)).rejects.toThrow(
        "OBJECT_NOT_FOUND",
    );
    expect(
        await execute("data.deletion.purge", "D4", deletion.id),
    ).toMatchObject({ state: "PURGED" });
    await expect(
        execute("data.deletion.purge", "D4", randomUUID()),
    ).rejects.toThrow("DELETION_NOT_FOUND");
}, 30000);

it("retention: ordinary approved writes cannot change retention or reset creation time", async () => {
    const original = record("conversation", {
        title: "Retention fixture", participants: [owner.session.ownerId], archived: false,
    });
    await execute("data.record.put", "D2", original.id, original);
    const expiresAt = Date.now() + 60000;
    const retention = { ...original.retention, revision: 2,
        mode: "KEEP_UNTIL_DATE" as const, expiresAt };
    const update = { ...original, revision: 2, previousRevision: 1,
        updatedAt: Date.now(), retention,
        policy: { ...original.policy, retention: { mode: "until" as const,
            expiresAt: new Date(expiresAt).toISOString() } } };
    await expect(execute("data.record.put", "D2", original.id, update))
        .rejects.toThrow("RETENTION_OWNER_APPROVAL_REQUIRED");
    await expect(execute("data.record.put", "D2", original.id, {
        ...original, revision: 2, previousRevision: 1,
        createdAt: original.createdAt - 1, updatedAt: Date.now(),
    })).rejects.toThrow("DATA_CREATED_TIME_IMMUTABLE");
    expect(await execute("data.record.read", "D2", original.id))
        .toMatchObject({ revision: 1, retention: original.retention });
    expect(await execute("data.retention.change", "D4", original.id, {
        version: 1, expectedRevision: 1, retention,
    })).toMatchObject({ revision: 2, stored: true });
    expect(await execute("data.record.read", "D2", original.id))
        .toMatchObject({ revision: 2, retention, createdAt: original.createdAt });
    await expect(execute("data.retention.change", "D4", original.id, {
        version: 1, expectedRevision: 1, retention,
    })).rejects.toThrow("RETENTION_VERSION_CONFLICT");
    await expect(execute("data.retention.plan", "D4", original.id))
        .rejects.toThrow("RETENTION_NOT_DUE");
}, 30000);

it("retention: exact expired cleanup purges derived vectors, rejects altered plans and replay", async () => {
    const source = record("memory", {
        kind: "project", subject: "retention", content: "Expiry synthetic payload",
        confidence: 1, lastVerifiedAt: null,
    }, "D3");
    const expiresAt = Date.now() + 60000;
    source.retention = { ...source.retention, mode: "KEEP_UNTIL_DATE", expiresAt };
    source.policy.retention = { mode: "until", expiresAt: new Date(expiresAt).toISOString() };
    await execute("data.record.put", "D3", source.id, source);
    const vector = record("embedding", {
        memoryId: source.id, provider: "synthetic", model: "expiry-vector",
        dimensions: 3, values: [1, 0, 0], sourceVersion: 1,
    }, "D3");
    await execute("data.record.put", "D3", vector.id, vector);
    try {
        storageClockOffset = 120000;
        await expect(execute("data.record.read", "D3", source.id))
            .rejects.toThrow("DATA_EXPIRED");
        await expect(execute("data.record.put", "D3", source.id, {
            ...source, revision: 2, previousRevision: 1,
            retention: { ...source.retention, revision: 2, mode: "KEEP_FOREVER", expiresAt: null },
            policy: { ...source.policy, retention: { mode: "keep" } },
        })).rejects.toThrow("DATA_EXPIRED");
        const plan = RetentionCleanupPlanSchema.parse(
            await execute("data.retention.plan", "D4", source.id),
        );
        expect(plan.affected.map(row => row.id).sort()).toEqual([source.id, vector.id].sort());
        await expect(execute("data.retention.execute", "D4", source.id, {
            ...plan, affected: plan.affected.filter(row => row.id !== vector.id),
        })).rejects.toThrow("RETENTION_PLAN_STALE");
        expect((await pool.query("SELECT id FROM memory.embeddings WHERE id=$1", [vector.id])).rowCount).toBe(1);
        storageClockOffset = 480000;
        await expect(execute("data.retention.execute", "D4", source.id, plan))
            .rejects.toThrow("RETENTION_PLAN_BINDING_OR_EXPIRY_INVALID");
        storageClockOffset = 120000;
        const exact = await authorize("data.retention.execute", "D4", source.id, plan);
        expect(await subject("execute", exact)).toMatchObject({ result: { value: {
            state: "PURGED", backupExpiryRequired: true,
        } } });
        await expect(subject("execute", exact)).rejects.toThrow();
        expect((await pool.query("SELECT id FROM memory.embeddings WHERE id=$1", [vector.id])).rowCount).toBe(0);
        expect((await pool.query("SELECT record_id FROM storage.deletion_tombstones WHERE record_id=ANY($1::uuid[])", [[source.id, vector.id]])).rowCount).toBe(2);
        await expect(execute("data.record.read", "D3", source.id)).rejects.toThrow("DATA_NOT_FOUND");
        const audit = await pool.query("SELECT record FROM security.data_access_events WHERE record->>'resource'=$1", [source.id]);
        expect(audit.rows.length).toBeGreaterThan(0);
        expect(JSON.stringify(audit.rows)).not.toContain("Expiry synthetic payload");
    } finally {
        storageClockOffset = 0;
    }
}, 30000);
