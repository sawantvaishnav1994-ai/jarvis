import { createHash } from "node:crypto";
import { BoundaryError } from "@jarvis/shared";
import type { Actor } from "@jarvis/identity";
import type { SecretManager } from "@jarvis/security";
import type { CredentialBroker, CredentialLease, ToolRequest } from "./j07-contracts.js";
export class J04CredentialBroker implements CredentialBroker {
 constructor(private readonly secrets:SecretManager,private readonly resolveActor:(request:ToolRequest)=>Actor,private readonly refs:ReadonlyMap<string,string>,private readonly ttlMs=30000){}
 async lease(requirements:readonly string[],request:ToolRequest):Promise<CredentialLease|undefined>{if(!requirements.length)return undefined;if(requirements.length!==1)throw new BoundaryError("CREDENTIAL_UNAVAILABLE");const ref=this.refs.get(requirements[0]!);if(!ref)throw new BoundaryError("CREDENTIAL_UNAVAILABLE");const lease=await this.secrets.lease(ref,this.resolveActor(request),this.ttlMs),handle="credential:"+createHash("sha256").update(ref).digest("hex").slice(0,16);let used=false;return{handle,expiresAt:lease.expiresAt,async use<T>(consumer:(secret:string)=>Promise<T>):Promise<T>{if(used||Date.now()>=lease.expiresAt)throw new BoundaryError("CREDENTIAL_UNAVAILABLE");used=true;try{return await consumer(lease.value.toString("utf8"));}finally{lease.destroy();}}};}
}
