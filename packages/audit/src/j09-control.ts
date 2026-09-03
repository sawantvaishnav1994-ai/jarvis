export type AuditCapability="audit.read.self"|"audit.read.project"|"audit.read.security"|"audit.export"|"audit.verify"|"audit.admin";
export type AuditAccessContext={ownerId:string;projectIds?:readonly string[];capabilities:ReadonlySet<AuditCapability>;metaDepth?:number};
export function authorizeAuditAccess(context:AuditAccessContext,ownerId:string,projectId:string|null,capability:AuditCapability){
    if(context.ownerId!==ownerId)throw new Error("AUDIT_OWNER_SCOPE_DENIED");
    if(!context.capabilities.has(capability)&&!context.capabilities.has("audit.admin"))throw new Error("AUDIT_CAPABILITY_DENIED");
    if(projectId&&context.projectIds&&!context.projectIds.includes(projectId)&&!context.capabilities.has("audit.admin"))throw new Error("AUDIT_PROJECT_SCOPE_DENIED");
    if((context.metaDepth??0)>1)throw new Error("AUDIT_META_RECURSION_DENIED");
}