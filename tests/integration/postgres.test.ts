import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@jarvis/config";
import { FileSecretManager, RecordCipher } from "@jarvis/security";
import {
    databasePool,
    migrate,
    verifyMigrations,
    PostgresMemoryRepository,
    PostgresEventPublisher,
    PostgresAuditSink,
    type DatabasePool,
} from "@jarvis/storage";
import { MemoryService } from "@jarvis/memory";
import { JarvisCore } from "@jarvis/core";
import { MockModel } from "@jarvis/models";
import { owner, memory, context } from "../fixtures/foundation.js";
let pool: DatabasePool, admin: DatabasePool, runtimePassword: string;
const config = await loadConfig("config/development.json");
const cipher = new RecordCipher(randomBytes(32));
const actor = { ...owner, id: "jarvis-integration", kind: "service" as const };
const uniqueOwner = { ...owner, id: "owner-" + randomUUID() };
beforeAll(async () => {
    const manager = new FileSecretManager(
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
    const runtimeLease = await manager.lease(
        config.storage.postgres.passwordRef,
        actor,
    );
    const adminLease = await manager.lease(
        config.storage.postgres.migratorPasswordRef,
        actor,
    );
    runtimePassword = runtimeLease.value.toString("utf8");
    pool = databasePool(config.storage.postgres, runtimePassword);
    admin = databasePool(
        config.storage.postgres,
        adminLease.value.toString("utf8"),
        true,
    );
    runtimeLease.destroy();
    adminLease.destroy();
    await pool.query("SELECT 1");
});
afterAll(async () => {
    if (pool) {
        await pool.query("DELETE FROM memory.records WHERE owner_id=$1", [
            uniqueOwner.id,
        ]);
        await pool.end();
    }
    if (admin) await admin.end();
});
it("applies migrations idempotently and keeps pgvector available", async () => {
    await migrate(
        admin,
        "infrastructure/migrations",
        "development",
        config.storage.postgres.runtimeUser,
        runtimePassword,
    );
    expect(await verifyMigrations(pool, "infrastructure/migrations")).toBe(
        true,
    );
    expect(
        (
            await pool.query(
                "SELECT extversion FROM pg_extension WHERE extname='vector'",
            )
        ).rows,
    ).toHaveLength(1);
});
it("round-trips encrypted memory through Drizzle and preserves it across providers", async () => {
    const record = memory({
        ownerId: uniqueOwner.id,
        content: "SYNTHETIC-PRIVATE-" + randomUUID(),
    });
    const repository = new PostgresMemoryRepository(pool, cipher),
        service = new MemoryService(repository);
    await service.remember(uniqueOwner, record);
    const raw = (
        await pool.query("SELECT payload FROM memory.records WHERE id=$1", [
            record.id,
        ])
    ).rows[0].payload;
    expect(raw).not.toContain(record.content);
    for (const provider of ["mock-a", "mock-b"]) {
        const core = new JarvisCore(new MockModel(provider), service);
        expect(
            (
                await core.generate(
                    uniqueOwner,
                    {
                        version: 1,
                        messages: [{ role: "user", content: "hello" }],
                        capabilities: ["text"],
                        privacyLevel: "local-only",
                        maxCost: 0,
                        timeoutMs: 1000,
                    },
                    new AbortController().signal,
                )
            ).provider,
        ).toBe(provider);
        expect(await core.recall(uniqueOwner, record.projectId)).toContainEqual(
            record,
        );
    }
    expect(await repository.find("other-owner", record.projectId)).toEqual([]);
    expect(await repository.delete("other-owner", record.id)).toBe(false);
    expect(await repository.delete(uniqueOwner.id, record.id)).toBe(true);
    expect(
        await repository.find(uniqueOwner.id, record.projectId),
    ).not.toContainEqual(record);
});
it("refuses never-store data in the concrete adapter too", async () => {
    await expect(
        new PostgresMemoryRepository(pool, cipher).save(
            memory({ ownerId: uniqueOwner.id, retention: "never-store" }),
        ),
    ).rejects.toThrow("NEVER_STORE");
});
it("persists an encrypted event with traceable metadata", async () => {
    const id = randomUUID();
    await new PostgresEventPublisher(pool, cipher).publish({
        version: 1,
        id,
        type: "memory.created",
        source: "jarvis.test",
        timestamp: new Date().toISOString(),
        actor,
        environment: "development",
        data: { fixture: "SYNTHETIC-PRIVATE" },
        sensitivity: "local-only",
        correlationId: "test-correlation",
    });
    const row = (
        await pool.query(
            "SELECT payload,correlation_id FROM events.envelopes WHERE id=$1",
            [id],
        )
    ).rows[0];
    expect(row.correlation_id).toBe("test-correlation");
    expect(row.payload).not.toContain("SYNTHETIC-PRIVATE");
});
it("runtime role cannot change schemas or migration history", async () => {
    for (const sql of [
        "CREATE TABLE public.forbidden(id integer)",
        "UPDATE settings.schema_migrations SET checksum='tampered'",
        "CREATE TABLE memory.forbidden(id integer)",
    ])
        await expect(pool.query(sql)).rejects.toThrow();
});
it("runtime audit inserts are allowed while update, delete and truncate are denied", async () => {
    const id = randomUUID();
    await new PostgresAuditSink(pool).append({
        version: 1,
        id,
        actor: context.actor,
        environment: "development",
        requestId: context.requestId,
        operation: "tool.invoke",
        toolId: "mock.echo",
        permission: "P0",
        approval: "not-required",
        result: "success",
        inputHash: "a".repeat(64),
        timestamp: new Date().toISOString(),
    });
    for (const sql of [
        "UPDATE audit.entries SET created_at=now()",
        "DELETE FROM audit.entries",
        "TRUNCATE audit.entries",
    ])
        await expect(pool.query(sql)).rejects.toThrow();
    expect(
        (await pool.query("SELECT id FROM audit.entries WHERE id=$1", [id]))
            .rowCount,
    ).toBe(1);
});
it("database triggers reject ordinary administrator audit mutations", async () => {
    for (const sql of [
        "UPDATE audit.entries SET created_at=now()",
        "DELETE FROM audit.entries",
        "TRUNCATE audit.entries",
    ])
        await expect(admin.query(sql)).rejects.toThrow("append-only");
});
it("rejects an invalid database credential without falling back to memory", async () => {
    const denied = databasePool(
        config.storage.postgres,
        "synthetic-invalid-password",
    );
    try {
        await expect(denied.query("SELECT 1")).rejects.toThrow();
    } finally {
        await denied.end();
    }
});
