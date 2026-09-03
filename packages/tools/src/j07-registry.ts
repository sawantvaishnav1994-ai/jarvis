import { BoundaryError } from "@jarvis/shared";
import { ToolDefinitionMetadataSchema, type J07ToolDefinition, type ToolDefinitionMetadata } from "./j07-contracts.js";

export class UniversalToolRegistry {
  private readonly tools = new Map<string, J07ToolDefinition>();
  constructor(definitions: J07ToolDefinition[] = []) { for (const definition of definitions) this.register(definition); }
  private key(toolId: string, version: number) { return `${toolId}@${version}`; }
  register(definition: J07ToolDefinition): void {
    const metadata = ToolDefinitionMetadataSchema.parse(definition.metadata);
    const key = this.key(metadata.toolId, metadata.version);
    if (this.tools.has(key)) throw new BoundaryError("DUPLICATE_TOOL");
    this.tools.set(key, Object.freeze({ ...definition, metadata: Object.freeze(metadata) }));
  }
  get(toolId: string, version: number): J07ToolDefinition {
    const tool = this.tools.get(this.key(toolId, version));
    if (!tool) throw new BoundaryError("TOOL_NOT_FOUND");
    if (tool.metadata.health === "DISABLED") throw new BoundaryError("TOOL_DISABLED");
    if (["UNAVAILABLE","UNKNOWN"].includes(tool.metadata.health)) throw new BoundaryError("TOOL_UNAVAILABLE");
    return tool;
  }
  inspect(): ToolDefinitionMetadata[] { return [...this.tools.values()].map(t => structuredClone(t.metadata)).sort((a,b)=>this.key(a.toolId,a.version).localeCompare(this.key(b.toolId,b.version))); }
}
