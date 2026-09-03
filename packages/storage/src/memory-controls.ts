import { randomUUID } from "node:crypto";
import type pg from "pg";
import { BoundaryError, IdentifierSchema } from "@jarvis/shared";
import type { MemoryAuditEvent, MemoryAuditSink } from "@jarvis/memory";

const actions = new Set([
    "create","admission","retrieve","correct","conflict","supersede",
    "context.include","context.exclude","delete","expire",
]);

export class PostgresMemoryAuditSink implements MemoryAuditSink {
    constructor(private readonly pool: pg.Pool) {}
    async append(event: MemoryAuditEvent): Promise<void> {
        const ownerId = IdentifierSchema.parse(event.ownerId);
        if (!actions.has(event.action) || !event.reason || event.reason.length > 500)
            throw new BoundaryError("MEMORY_AUDIT_INVALID");
        await this.pool.query(
            `INSERT INTO audit.memory_events(id,owner_id,action,memory_id,reason,occurred_at,metadata)
             VALUES($1,$2,$3,$4,$5,$6,'{}'::jsonb)`,
            [randomUUID(), ownerId, event.action, event.memoryId ?? null, event.reason, event.at],
        );
    }
    async list(ownerId: string) {
        const result = await this.pool.query(
            `SELECT id,action,memory_id,reason,occurred_at
               FROM audit.memory_events WHERE owner_id=$1 ORDER BY occurred_at DESC,id DESC LIMIT 500`,
            [IdentifierSchema.parse(ownerId)],
        );
        return result.rows;
    }
}

export class PostgresMemoryControls {
    constructor(private readonly pool: pg.Pool) {}
    async restrict(ownerId: string, semanticKey: string): Promise<void> {
        if (!semanticKey.trim() || semanticKey.length > 512) throw new BoundaryError("MEMORY_RESTRICTION_INVALID");
        await this.pool.query(
            `INSERT INTO memory.restrictions(owner_id,semantic_key,mode)
             VALUES($1,$2,'NEVER_STORE') ON CONFLICT(owner_id,semantic_key) DO NOTHING`,
            [IdentifierSchema.parse(ownerId), semanticKey],
        );
    }
    async isRestricted(ownerId: string, semanticKey: string): Promise<boolean> {
        const result = await this.pool.query(
            "SELECT 1 FROM memory.restrictions WHERE owner_id=$1 AND semantic_key=$2 AND mode='NEVER_STORE'",
            [IdentifierSchema.parse(ownerId), semanticKey],
        );
        return result.rowCount === 1;
    }
    async cache(ownerId: string, key: string, memoryIds: readonly string[], graphIds: readonly string[], expiresAt: string): Promise<void> {
        if (!key.trim() || key.length > 256 || Date.parse(expiresAt) <= Date.now()) throw new BoundaryError("MEMORY_CACHE_INVALID");
        await this.pool.query(
            `INSERT INTO memory.context_cache(owner_id,cache_key,memory_ids,graph_ids,expires_at)
             VALUES($1,$2,$3,$4,$5)
             ON CONFLICT(owner_id,cache_key) DO UPDATE SET memory_ids=EXCLUDED.memory_ids,graph_ids=EXCLUDED.graph_ids,expires_at=EXCLUDED.expires_at,created_at=now()`,
            [IdentifierSchema.parse(ownerId), key, memoryIds, graphIds, expiresAt],
        );
    }
    async invalidate(ownerId: string, ids: readonly string[]): Promise<number> {
        if (!ids.length) return 0;
        const result = await this.pool.query(
            `DELETE FROM memory.context_cache
              WHERE owner_id=$1 AND (memory_ids && $2::uuid[] OR graph_ids && $2::uuid[])`,
            [IdentifierSchema.parse(ownerId), ids],
        );
        return result.rowCount ?? 0;
    }
    async purgeExpired(ownerId: string, now = new Date()): Promise<number> {
        const result = await this.pool.query(
            "DELETE FROM memory.context_cache WHERE owner_id=$1 AND expires_at <= $2",
            [IdentifierSchema.parse(ownerId), now],
        );
        return result.rowCount ?? 0;
    }
}
