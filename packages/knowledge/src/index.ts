import type { Actor } from "@jarvis/identity";
export interface KnowledgeEdge {
    version: 1;
    id: string;
    ownerId: string;
    sourceId: string;
    relation: string;
    targetId: string;
    sourceMemoryIds: readonly string[];
}
export interface KnowledgeRepository {
    related(actor: Actor, entityId: string): Promise<KnowledgeEdge[]>;
}
