import { z } from "zod";
import {
    ContractVersionSchema,
    IdentifierSchema,
    PrivacySchema,
    RetentionSchema,
    BoundaryError,
} from "@jarvis/shared";
import type { Actor } from "@jarvis/identity";
export const MemoryRecordSchema = z
    .strictObject({
        version: ContractVersionSchema,
        id: z.uuid(),
        ownerId: IdentifierSchema,
        projectId: IdentifierSchema,
        kind: z.enum([
            "working",
            "conversation",
            "episodic",
            "semantic",
            "project",
            "preference",
            "procedural",
            "relationship",
            "device",
        ]),
        content: z.string().max(50000),
        privacy: PrivacySchema,
        retention: RetentionSchema,
        createdAt: z.iso.datetime(),
        expiresAt: z.iso.datetime().nullable(),
    })
    .refine(
        (v) => v.retention !== "temporary" || v.expiresAt !== null,
        "Temporary memory needs expiry",
    );
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export interface MemoryRepository {
    save(record: MemoryRecord): Promise<void>;
    find(ownerId: string, projectId: string): Promise<MemoryRecord[]>;
    delete(ownerId: string, id: string): Promise<boolean>;
}
export class MemoryService {
    constructor(private readonly repository: MemoryRepository) {}
    async remember(actor: Actor, input: unknown): Promise<void> {
        const record = MemoryRecordSchema.parse(input);
        if (
            actor.kind !== "owner" ||
            actor.id !== record.ownerId ||
            record.retention === "never-store"
        )
            throw new BoundaryError("MEMORY_DENIED");
        await this.repository.save(record);
    }
    async recall(actor: Actor, projectId: string): Promise<MemoryRecord[]> {
        if (actor.kind !== "owner") throw new BoundaryError("MEMORY_DENIED");
        return (
            await this.repository.find(
                actor.id,
                IdentifierSchema.parse(projectId),
            )
        ).filter((r) => !r.expiresAt || Date.parse(r.expiresAt) > Date.now());
    }
}
