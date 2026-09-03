import { BoundaryError } from "@jarvis/shared";
import { ToolDefinitionMetadataSchema, ToolHealthSchema, type J07ToolDefinition, type ToolDefinitionMetadata } from "./j07-contracts.js";
export class UniversalToolRegistry {
 private readonly tools=new Map<string,J07ToolDefinition>(); private readonly health=new Map<string,ToolDefinitionMetadata["health"]>();
 constructor(definitions:J07ToolDefinition[]=[]){for(const d of definitions)this.register(d);} private key(id:string,v:number){return `${id}@${v}`;}
 register(definition:J07ToolDefinition):void{const m=ToolDefinitionMetadataSchema.parse(definition.metadata),k=this.key(m.toolId,m.version);if(this.tools.has(k))throw new BoundaryError("DUPLICATE_TOOL");this.tools.set(k,Object.freeze({...definition,metadata:Object.freeze(m)}));}
 setHealth(toolId:string,version:number,health:ToolDefinitionMetadata["health"]):void{const k=this.key(toolId,version);if(!this.tools.has(k))throw new BoundaryError("TOOL_NOT_FOUND");this.health.set(k,ToolHealthSchema.parse(health));}
 get(toolId:string,version:number):J07ToolDefinition{const k=this.key(toolId,version),tool=this.tools.get(k);if(!tool)throw new BoundaryError("TOOL_NOT_FOUND");const health=this.health.get(k)??tool.metadata.health;if(health==="DISABLED")throw new BoundaryError("TOOL_DISABLED");if(["UNAVAILABLE","UNKNOWN"].includes(health))throw new BoundaryError("TOOL_UNAVAILABLE");return tool;}
 inspect():ToolDefinitionMetadata[]{return[...this.tools.values()].map(t=>({...structuredClone(t.metadata),health:this.health.get(this.key(t.metadata.toolId,t.metadata.version))??t.metadata.health})).sort((a,b)=>this.key(a.toolId,a.version).localeCompare(this.key(b.toolId,b.version)));}
}
