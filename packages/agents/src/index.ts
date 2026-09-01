import type { Actor } from "@jarvis/identity";
export interface AgentDefinition {
    version: 1;
    id: string;
    supervisorId: string;
    actor: Actor;
    allowedScopes: readonly string[];
    maxChildren: number;
    expiresAt: string;
}
export interface AgentSupervisor {
    prepare(definition: AgentDefinition): Promise<string>;
    cancel(runId: string): Promise<void>;
}
export const AGENT_EXECUTION_ENABLED = false;
