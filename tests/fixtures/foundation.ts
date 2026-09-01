import { randomUUID } from "node:crypto";
import type { Actor } from "@jarvis/identity";
import type { MemoryRecord, MemoryRepository } from "@jarvis/memory";
import type { ExecutionContext } from "@jarvis/security";
export const owner: Actor = {
    version: 1,
    id: "owner-test",
    kind: "owner",
    environment: "development",
};
export const context: ExecutionContext = {
    version: 1,
    actor: owner,
    environment: "development",
    requestId: "request-test",
    grantedScopes: ["mock.read"],
    trace: { traceId: "a".repeat(32), spanId: "b".repeat(16) },
};
export function memory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
    return {
        version: 1,
        id: randomUUID(),
        ownerId: owner.id,
        projectId: "project-test",
        kind: "project",
        content: "Synthetic project information",
        privacy: "local-only",
        retention: "persist",
        createdAt: new Date().toISOString(),
        expiresAt: null,
        ...overrides,
    };
}
// Contract-test adapter only. No application uses an in-memory data fallback.
export class TestMemoryRepository implements MemoryRepository {
    readonly records = new Map<string, MemoryRecord>();
    async save(record: MemoryRecord) {
        this.records.set(record.id, structuredClone(record));
    }
    async find(ownerId: string, projectId: string) {
        return [...this.records.values()]
            .filter((r) => r.ownerId === ownerId && r.projectId === projectId)
            .map((r) => structuredClone(r));
    }
    async delete(ownerId: string, id: string) {
        if (this.records.get(id)?.ownerId !== ownerId) return false;
        return this.records.delete(id);
    }
}
