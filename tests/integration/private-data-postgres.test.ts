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
    requireExternalContext,
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
    SecretHandleExecutor,
    GovernedMigrations,
    destructiveMigrationHash,
    reconstructPortableExport,
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
let secretVault: FileSecretManager;
let f: ReturnType<typeof fixture>,
    owner: Awaited<ReturnType<typeof root>>,
    subjectId: string;
const subjectDevice = new TestDevice();
const cipher = new RecordCipher(randomBytes(32));
let storageClockOffset = 0;
let securityClock: () => number = Date.now;
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
    "secrets.handle.use",
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
const migrationDefinition = {
    version: 1, id: "test.remove-owner-probe-v2",
    affectedTables: ["recovery.migration_probe"],
    statements: ["DELETE FROM recovery.migration_probe WHERE owner_id=$1"],
    verificationQuery: "SELECT NOT EXISTS(SELECT 1 FROM recovery.migration_probe WHERE owner_id=$1) AS verified",
};

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
        new Set(["development/storage/kek/k1", "development/storage/kek/k2", "development/tools/synthetic-credential"]),
    );
    secretVault = vault;
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
                for (const [key, encoded] of Object.entries(snapshot.objects)) {
                    const restored = await restoreObjects.get(snapshot.ownerId, key);
                    expect(restored).toEqual(Buffer.from(encoded, "base64"));
                    const box = JSON.parse(restored.toString());
                    const value = await (await keys.cipher(snapshot.ownerId)).decrypt(box.envelope, box.binding) as { contentBase64: string };
                    expect(value.contentBase64).toBe(Buffer.from("Retained recovery object").toString("base64"));
                }
            },
        ),
        () => securityClock() + storageClockOffset,
    );
    repository = new PostgresIdentityRepository(pool, cipher);
    f = fixture(
        repository,
        (clock) => {
            securityClock = clock;
            return new GovernanceEngine(
                new PrivateDataGateway(
                    records,
                    new AuthorizedMockToolGateway(),
                    {
                        keys,
                        objects,
                        exports: new PortableExports(records, objects, cipher),
                        recovery,
                        secretExecutor: new SecretHandleExecutor(vault, actor.id, clock),
                        migrations: new GovernedMigrations(recovery, [migrationDefinition], clock),
                        health: new StorageHealthService(
                            keys,
                            objects,
                            recovery,
                            "infrastructure/migrations",
                        ),
                    },
                ),
                clock,
            ).handle;
        },
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
    classification: "D0" | "D1" | "D2" | "D3" = "D2",
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
    const retainedId = randomUUID(), retainedPolicy = dataPolicy(); retainedPolicy.consent.keepAttachments = true;
    await execute("data.object.put", "D2", retainedId, { id: retainedId, filename: "retained-recovery.txt", mimeType: "text/plain", contentBase64: Buffer.from("Retained recovery object").toString("base64"), policy: retainedPolicy });
    const retainedKey = (await pool.query("SELECT object_key FROM storage.objects WHERE id=$1", [retainedId])).rows[0].object_key;
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
    expect(await restoreObjects.list(owner.session.ownerId)).toEqual([retainedKey]);
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

it("H: exact owner-approved tool consumes a vault handle without returning or auditing plaintext", async () => {
    const input = { version: 1, handle: "secret://synthetic/credential-check", tool: "synthetic.credential-check" };
    const lease = await secretVault.lease("development/tools/synthetic-credential", {
        version: 1, id: "jarvis-data-test", kind: "service", environment: "development",
    });
    try {
        const issued = await authorize("data.secret.use", "D4", null, input);
        const result = await subject("execute", issued);
        expect(result).toMatchObject({ result: { value: {
            version: 1, tool: "synthetic.credential-check", verified: true, secretReturned: false,
        } } });
        expect(JSON.stringify(result)).not.toContain(lease.value.toString());
        await expect(subject("execute", issued)).rejects.toThrow("AUTHORIZATION_REPLAY");
        const audit = await pool.query("SELECT record FROM security.data_access_events WHERE record->>'requestId'=$1", [issued.request.id]);
        expect(audit.rowCount).toBe(1);
        expect(audit.rows[0].record).toMatchObject({ operation: "data.secret.use", result: "success" });
        expect(JSON.stringify(audit.rows)).not.toContain(lease.value.toString());
        expect(JSON.stringify(await repository.audit(1000))).not.toContain(lease.value.toString());
    } finally { lease.destroy(); }
    await expect(secretVault.lease("development/tools/synthetic-credential", {
        version: 1, id: "jarvis-data-test", kind: "agent", environment: "development",
    })).rejects.toThrow("SECRET_SCOPE_DENIED");
});
it("H: different handles, revoked authorizations and modified execution inputs cannot resolve secrets", async () => {
    const input = { version: 1, handle: "secret://synthetic/credential-check", tool: "synthetic.credential-check" };
    await expect(authorize("data.secret.use", "D5", null, input)).rejects.toThrow();
    await expect(execute("data.secret.use", "D4", null, { ...input, handle: "secret://database/runtime" }))
        .rejects.toThrow("SECRET_USE_SCOPE_DENIED");
    const revoked = await authorize("data.secret.use", "D4", null, input);
    await ownerCommand("authorization.revoke", { id: revoked.authorization.id });
    await expect(subject("execute", revoked)).rejects.toThrow();
    const exact = await authorize("data.secret.use", "D4", null, input);
    await expect(subject("execute", { ...exact, transient: { ...input, handle: "secret://database/runtime" } }))
        .rejects.toThrow();
    const expired = await authorize("data.secret.use", "D4", null, input);
    f.advance(120000);
    try { await expect(subject("execute", expired)).rejects.toThrow("AUTHORIZATION_EXPIRED"); }
    finally { f.advance(-120000); }
});

it("L-N: deletion links recovery obligations and expired snapshots cannot restore", async () => {
    const retained = record("memory", { kind: "semantic", subject: "Recovery deletion", content: "Recovery deletion sentinel", confidence: 1, lastVerifiedAt: null }, "D2");
    await execute("data.record.put", "D2", retained.id, retained);
    const prior = await execute("data.backup.create", "D4") as { id: string };
    await execute("data.record.forget", "D2", retained.id);
    const obligations = await pool.query("SELECT * FROM storage.backup_deletion_obligations WHERE owner_id=$1 AND backup_id=$2 AND record_id=$3", [owner.session.ownerId, prior.id, retained.id]);
    expect(obligations.rowCount).toBe(1);
    expect(obligations.rows[0].purge_eligible_at.getTime()).toBeLessThanOrEqual(Date.now());
    expect(JSON.stringify(obligations.rows)).not.toContain("Recovery deletion sentinel");
    await expect(execute("data.backup.restore", "D4", prior.id)).rejects.toThrow("BACKUP_PREDATES_DELETION");
    await expect(pool.query("DELETE FROM storage.backup_deletion_obligations WHERE backup_id=$1", [prior.id])).rejects.toThrow();
    const fresh = await execute("data.backup.create", "D4") as { id: string };
    storageClockOffset = 31 * 24 * 60 * 60 * 1000;
    try { await expect(execute("data.backup.restore", "D4", fresh.id)).rejects.toThrow("BACKUP_EXPIRED"); }
    finally { storageClockOffset = 0; }
    // Time advancement changes eligibility only; no claim of physical byte erasure.
    expect((await pool.query("SELECT count(*)::int AS n FROM storage.backup_items WHERE backup_id=$1", [fresh.id])).rows[0].n).toBeGreaterThan(0);
}, 30000);

it("E-L: shared canonical objects survive one unlink, legacy links reconcile, final unlink permits purge", async () => {
    const id = randomUUID(), policy = dataPolicy(); policy.consent.keepAttachments = true;
    await execute("data.object.put", "D2", id, { id, filename: "shared.txt", mimeType: "text/plain", contentBase64: Buffer.from("Shared synthetic attachment").toString("base64"), policy });
    const parent = record("message", { conversationId: conversation.id, authorId: owner.session.ownerId, content: "Shared parent", contentType: "text/plain", model: null }, "D3");
    await execute("data.record.put", "D3", parent.id, parent);
    const a = record("attachment", { messageId: parent.id, objectId: id }, "D3");
    const b = record("attachment", { messageId: parent.id, objectId: id }, "D3");
    await execute("data.record.put", "D3", a.id, a);
    await execute("data.record.put", "D3", b.id, b);
    const wrongOwner = { ...record("attachment", { messageId: parent.id, objectId: id }, "D3"), ownerId: "owner-unrelated" };
    await expect(execute("data.record.put", "D3", wrongOwner.id, wrongOwner)).rejects.toThrow();
    const before = await execute("data.object.get", "D2", id);
    await execute("data.record.forget", "D3", a.id);
    expect(await execute("data.object.get", "D2", id)).toEqual(before);
    await expect(execute("data.object.forget", "D2", id)).rejects.toThrow("OBJECT_STILL_REFERENCED");
    // Synthetic pre-0006 legacy record: canonical ciphertext remains untouched.
    await pool.query("DELETE FROM storage.attachment_objects WHERE attachment_id=$1", [b.id]);
    await expect(execute("data.record.forget", "D3", b.id)).rejects.toThrow("ATTACHMENT_LINKAGE_MIGRATION_REQUIRED");
    expect(await execute("data.attachment.reconcile", "D4", b.id)).toMatchObject({ id: b.id, objectId: id, reconciled: true });
    const deletion = await execute("data.record.forget", "D3", b.id) as { id: string };
    await expect(execute("data.object.get", "D2", id)).rejects.toThrow("OBJECT_NOT_FOUND");
    expect(await execute("data.deletion.purge", "D4", deletion.id)).toMatchObject({ state: "PURGED" });
}, 30000);

it("A: creates a separately bounded extended-acceptance actor without resetting existing budgets", async () => {
    const next = await ownerAction(f.engine, owner.device, owner.session, "subject.create", {
        name: "Restricted portability validation", kind: "service", publicKey: subjectDevice.input.publicKey, scopes: [], resources: [],
    }) as { subjectId: string };
    subjectId = next.subjectId;
    await ownerCommand("policy.create", {
        version: 1, id: "owner.storage-extended", revision: 1, status: "draft", createdAt: 0, activatedAt: null,
        creatorId: owner.session.ownerId, precedence: "owner", supersedes: null,
        rules: [{ id: "exact-extended-data", effect: "allow", actorIds: [subjectId], capabilities,
            scope: { version: 1, resource: "owner-data", environments: ["development"] }, maximumRisk: "R4",
            requireApproval: true, requireStepUp: true, allowEscalationRequest: true,
            requireSimulation: true, requireTests: true, requireScan: true, minimumConfidence: 1 }],
    });
    await ownerCommand("policy.activate", { id: "owner.storage-extended", revision: 1 });
    await ownerCommand("delegation.grant", { version: 1, actorId: subjectId, capability: "data.inventory", resource: "owner-data", environment: "development", ttlSeconds: 900, maximumUses: 100, maximumRisk: "R2", toolId: null });
    await ownerCommand("budget.set", { version: 1, actorId: subjectId, maximumRuntimeMs: 900000, maximumSpendMinor: 0, spentMinor: 0, maximumToolCalls: 100, toolCalls: 0, maximumRisk: "R4", resources: ["owner-data"], environments: ["development"], startedAt: Date.now(), notBefore: 0, expiresAt: Date.now() + 900000, networkAllowed: false, maximumConcurrent: 1, approvalThreshold: "R3" });
    expect((await pool.query("SELECT version FROM settings.schema_migrations ORDER BY version")).rows.map(row => row.version)).toEqual([1,2,3,4,5,6,7]);
});

it("B-G-K: reconstructs provider-independent conversation, graph, settings and safe definitions with deletion metadata", async () => {
    const c = record("conversation", { title: "Portable conversation", participants: [owner.session.ownerId], archived: false }, "D2");
    const messages = ["first", "second"].map(content => record("message", { conversationId: c.id, authorId: subjectId, content, contentType: "text/plain", model: { provider: "synthetic-replaceable", model: "portable" } }, "D2"));
    const entities = ["one", "two"].map(name => record("entity", { type: "project", name, aliases: [] }, "D2", [c.id]));
    const relationship = record("relationship", { sourceEntity: entities[0]!.id, targetEntity: entities[1]!.id, relation: "related-to", confidence: 1 }, "D2");
    const evidence = record("evidence", { relationshipId: relationship.id, description: "Owner-provided synthetic evidence" }, "D2");
    const project = record("project", { name: "Portable project", description: "Synthetic project" }, "D2");
    const setting = record("setting", { name: "display.preference", value: "compact" }, "D2");
    for (const row of [c, ...messages, ...entities, relationship, evidence, project, setting]) await execute("data.record.put", "D2", row.id, row);
    const exported = verifyPortableExport(await execute("data.export", "D4"));
    const reconstructed = reconstructPortableExport(exported);
    for (const row of [c, ...messages, ...entities, relationship, evidence, project, setting]) {
        const implicit = row.domain === "message" ? [c.id] : row.domain === "relationship" ? entities.map(entity => entity.id) : row.domain === "evidence" ? [relationship.id] : [];
        expect(reconstructed.records.get(row.id)).toEqual({ ...row, sources: [...new Set([...row.sources, ...implicit])] });
    }
    expect(reconstructed.deleted.has(memory.id)).toBe(true);
    expect(reconstructed.records.has(memory.id)).toBe(false);
    expect(JSON.parse(exported.files["agent-definitions/definitions.json"]!).some((value: { id: string }) => value.id === subjectId)).toBe(true);
    expect(exported.files["agent-definitions/definitions.json"]).not.toContain("publicKey");
    expect(JSON.parse(exported.files["lineage/links.json"]!).some((value: { derived_id: string }) => value.derived_id === evidence.id)).toBe(true);
    expect(exported.manifest.domains).toEqual(expect.arrayContaining(["retention", "provenance", "lineage", "deletion", "agent-definitions"]));
    await execute("data.record.forget", "D2", c.id);
    for (const row of [c, ...messages, ...entities, relationship, evidence]) await expect(execute("data.record.read", "D2", row.id)).rejects.toThrow("DATA_NOT_FOUND");
}, 30000);

it("P: reusable migration registry requires exact current recovery evidence and one-time owner approval", async () => {
    await pool.query("INSERT INTO recovery.migration_probe(id,owner_id,payload) VALUES($1,$2,$3)", [randomUUID(), owner.session.ownerId, cipher.encrypt("Generic migration sentinel", "probe")]);
    const payload = { version: 1, migrationId: migrationDefinition.id, migrationHash: destructiveMigrationHash(migrationDefinition), backupId: String(randomUUID()) };
    await expect(execute("data.migration.execute", "D4", null, payload)).rejects.toThrow("BACKUP_NOT_FOUND");
    const fresh = await execute("data.backup.create", "D4") as { id: string; items: { sha256: string }[] };
    payload.backupId = fresh.id;
    await expect(execute("data.migration.execute", "D4", null, { ...payload, migrationHash: "0".repeat(64) })).rejects.toThrow("MIGRATION_DEFINITION_MISMATCH");
    const tampered = await authorize("data.migration.execute", "D4", null, payload);
    await expect(subject("execute", { ...tampered, transient: { ...payload, migrationId: "unreviewed.operation" } })).rejects.toThrow();
    const exact = await authorize("data.migration.execute", "D4", null, payload);
    expect(await subject("execute", exact)).toMatchObject({ result: { value: { verified: true, backupId: fresh.id, migrationHash: payload.migrationHash } } });
    await expect(subject("execute", exact)).rejects.toThrow("AUTHORIZATION_REPLAY");
    expect((await pool.query("SELECT * FROM recovery.migration_probe")).rows).toEqual([]);
    const audit = await pool.query("SELECT record FROM security.data_access_events WHERE record->>'operation'='data.migration.verified'");
    expect(audit.rows[0].record).toMatchObject({ backupId: fresh.id, verified: true });
    expect(JSON.stringify(audit.rows)).not.toContain("Generic migration sentinel");
}, 30000);

it("P: stale, corrupt and changed-source backups cannot authorize a destructive migration", async () => {
    const payload = { version: 1, migrationId: migrationDefinition.id, migrationHash: destructiveMigrationHash(migrationDefinition), backupId: String(randomUUID()) };
    storageClockOffset = -600001;
    try { payload.backupId = (await execute("data.backup.create", "D4") as { id: string }).id; }
    finally { storageClockOffset = 0; }
    await expect(execute("data.migration.execute", "D4", null, payload)).rejects.toThrow("CURRENT_RECOVERY_EVIDENCE_REQUIRED");
    const fresh = await execute("data.backup.create", "D4") as { id: string; items: { sha256: string }[] };
    await pool.query("INSERT INTO recovery.migration_probe(id,owner_id,payload) VALUES($1,$2,$3)", [randomUUID(), owner.session.ownerId, cipher.encrypt("Changed source", "probe")]);
    await expect(execute("data.migration.execute", "D4", null, { ...payload, backupId: fresh.id })).rejects.toThrow("CURRENT_RECOVERY_EVIDENCE_REQUIRED");
    const corrupt = await execute("data.backup.create", "D4") as { id: string; items: { sha256: string }[] };
    await writeFile(join(dir, "backups", storageHash(owner.session.ownerId), corrupt.items[0]!.sha256), "synthetic corruption", { mode: 0o600 });
    await expect(execute("data.migration.execute", "D4", null, { ...payload, backupId: corrupt.id })).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS n FROM recovery.migration_probe")).rows[0].n).toBe(1);
}, 30000);

it("R: schema, vector, vault and object failures deny protected operations and recover", async () => {
    const prior = (await sourceAdmin.query("SELECT checksum FROM settings.schema_migrations WHERE version=7")).rows[0].checksum;
    await sourceAdmin.query("UPDATE settings.schema_migrations SET checksum=$1 WHERE version=7", ["0".repeat(64)]);
    try {
        expect(await execute("data.health", "D4")).toMatchObject({ migrations: false, status: "unavailable" });
        await expect(execute("data.record.read", "D3", conversation.id)).rejects.toThrow("STORAGE_SCHEMA_INCOMPATIBLE");
    } finally { await sourceAdmin.query("UPDATE settings.schema_migrations SET checksum=$1 WHERE version=7", [prior]); }
    await sourceAdmin.query("REVOKE EXECUTE ON FUNCTION vector_dims(vector) FROM PUBLIC");
    try {
        expect(await execute("data.health", "D4")).toMatchObject({ pgvector: false });
        await expect(execute("data.record.read", "D3", conversation.id)).rejects.toThrow();
    } finally { await sourceAdmin.query("GRANT EXECUTE ON FUNCTION vector_dims(vector) TO PUBLIC"); }
    const lease = secretVault.lease;
    secretVault.lease = async () => { throw new Error("synthetic unavailable vault"); };
    try {
        expect(await execute("data.health", "D4")).toMatchObject({ vault: false, status: "unavailable" });
        await expect(execute("data.record.read", "D3", conversation.id)).rejects.toThrow();
    } finally { secretVault.lease = lease; }
    const id = randomUUID(), policy = dataPolicy(); policy.consent.keepAttachments = true;
    await execute("data.object.put", "D2", id, { id, filename: "health.txt", mimeType: "text/plain", contentBase64: Buffer.from("health sentinel").toString("base64"), policy });
    const list = liveObjects.list, get = liveObjects.get;
    liveObjects.list = async () => { throw new Error("synthetic unavailable objects"); };
    liveObjects.get = async () => { throw new Error("synthetic unavailable objects"); };
    try {
        expect(await execute("data.health", "D4")).toMatchObject({ objects: false });
        await expect(execute("data.object.get", "D2", id)).rejects.toThrow();
    } finally { liveObjects.list = list; liveObjects.get = get; }
    expect(await execute("data.health", "D4")).toMatchObject({ postgres: true, migrations: true, pgvector: true, vault: true, keys: true, objects: true });
    expect(await execute("data.object.get", "D2", id)).toMatchObject({ contentBase64: Buffer.from("health sentinel").toString("base64") });
}, 30000);

it("Q: authorized mixed-class retrieval minimizes before a synthetic provider and audits policy counts", async () => {
    const specs = [["D1", "APPROVED_EXTERNAL_AI"], ["D2", "SPECIFIC_PROVIDER_ONLY"], ["D3", "NEVER_EXTERNAL"], ["D2", "LOCAL_ONLY"]] as const;
    const rows = specs.map(([classification, mode], index) => {
        const row = record("project", { name: "Unrelated private name", description: `Approved description ${index}` }, classification);
        row.policy.privacy = "ai-allow"; row.policy.consent.externalAI = true;
        row.external = { version: 1, mode, providers: ["synthetic"], regions: ["eu"], fields: ["description"], maximumCharacters: 100 };
        return row;
    });
    for (const row of rows) await execute("data.record.put", row.policy.classification, row.id, row);
    const issued = await authorize("data.context.prepare", "D3", null, { ids: rows.map(row => row.id), provider: "synthetic", region: "eu", limit: 100 });
    const result = await subject("execute", issued) as { result: { value: { items: { id: string; fields: Record<string,string> }[]; excluded: string[] } } };
    const syntheticProviderInput = result.result.value.items;
    expect(syntheticProviderInput).toEqual(rows.slice(0,2).map(row => ({ id: row.id, fields: { description: row.payload.description } })));
    expect(JSON.stringify(syntheticProviderInput)).not.toContain("Unrelated private name");
    const policyEvidence = (await pool.query("SELECT record FROM security.data_access_events WHERE record->>'requestId'=$1", [issued.request.id])).rows;
    expect(policyEvidence[0].record).toMatchObject({ classification: "D3", contextDecision: { included: 2, excluded: 2 } });
    expect(JSON.stringify(policyEvidence)).not.toContain("Approved description");
    expect(() => requireExternalContext([], "synthetic", "eu", [])).toThrow("EXTERNAL_CONTEXT_POLICY_UNSATISFIED");
}, 30000);

it("S: complete storage history includes safe recovery, secret, retention and context evidence", async () => {
    const events = (await pool.query("SELECT record FROM security.data_access_events")).rows.map(row => row.record);
    for (const operation of ["data.record.put", "data.record.read", "data.secret.use", "data.keys.rotate", "data.export", "data.record.forget", "data.backup.create", "data.backup.restore", "data.migration.verified", "data.context.prepare", "data.health", "data.deletion.purge", "data.retention.change", "data.retention.execute", "data.attachment.reconcile"])
        expect(events.some(row => row.operation === operation)).toBe(true);
    const lease = await secretVault.lease("development/tools/synthetic-credential", { version: 1, id: "jarvis-data-test", kind: "service", environment: "development" });
    try { expect(JSON.stringify(events)).not.toContain(lease.value.toString()); }
    finally { lease.destroy(); }
    for (const sentinel of ["Sensitive synthetic title", "Synthetic confidential sentence", "NEVER_STORE_SYNTHETIC_SENTINEL", "Recovery deletion sentinel", "Generic migration sentinel"])
        expect(JSON.stringify(events)).not.toContain(sentinel);
    await expect(pool.query("UPDATE security.data_access_events SET record='{}'::jsonb")).rejects.toThrow();
    await expect(pool.query("DELETE FROM security.data_access_events")).rejects.toThrow();
    await expect(pool.query("TRUNCATE security.data_access_events")).rejects.toThrow();
});

it("E-K: encrypted objects keep canonical identity when the storage adapter destination changes", async () => {
    const id = randomUUID(), policy = dataPolicy(); policy.consent.keepAttachments = true;
    await execute("data.object.put", "D2", id, { id, filename: "portable-object.txt", mimeType: "text/plain", contentBase64: Buffer.from("Portable object sentinel").toString("base64"), policy });
    const original = await execute("data.object.get", "D2", id);
    const parent = record("message", { conversationId: conversation.id, authorId: subjectId, content: "Portable attachment parent", contentType: "text/plain", model: null }, "D3");
    await execute("data.record.put", "D3", parent.id, parent);
    const attachment = record("attachment", { messageId: parent.id, objectId: id }, "D3");
    await execute("data.record.put", "D3", attachment.id, attachment);
    const reconstructed = reconstructPortableExport(await execute("data.export", "D4"));
    expect(reconstructed.objects.get(id)).toEqual(original);
    expect(reconstructed.objects.get(id)?.metadata.id).toBe(id);
    expect(reconstructed.records.get(attachment.id)?.payload).toEqual({ messageId: parent.id, objectId: id });
    const key = (await pool.query("SELECT object_key FROM storage.objects WHERE id=$1", [id])).rows[0].object_key;
    const alternate = new LocalEncryptedObjects(join(dir, "alternate-provider"));
    expect(await alternate.put(owner.session.ownerId, await liveObjects.get(owner.session.ownerId, key))).toBe(key);
    const get = liveObjects.get;
    liveObjects.get = (ownerId, objectKey) => alternate.get(ownerId, objectKey);
    try { expect(await execute("data.object.get", "D2", id)).toEqual(original); }
    finally { liveObjects.get = get; }
});

it("P: a pending unapproved migration cannot obtain execution authorization", async () => {
    const transient = { version: 1, migrationId: migrationDefinition.id, migrationHash: destructiveMigrationHash(migrationDefinition), backupId: randomUUID() };
    const request = { version: 1, id: randomUUID(), toolId: "data.migration.execute", resource: "owner-data", environment: "development", input: { recordId: null, classification: "D4", payloadHash: digest(canonical(transient)) } };
    const pending = await subject("request", request) as Pending;
    expect(pending.approval.id).toBeTruthy();
    expect(pending).not.toHaveProperty("authorization");
    await expect(subject("execute", { request, authorization: { id: pending.approval.id }, transient })).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS n FROM recovery.migration_probe")).rows[0].n).toBe(1);
});
