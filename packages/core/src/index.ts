import { BoundaryError } from "@jarvis/shared";
import type { Actor } from "@jarvis/identity";
import { ModelRequestSchema,ModelReplySchema,type ModelProvider,type ModelRequest } from "@jarvis/models";
import type { MemoryService } from "@jarvis/memory";
export class JarvisCore {constructor(private readonly model:ModelProvider,private readonly memory:MemoryService){}async generate(actor:Actor,input:ModelRequest,signal:AbortSignal){if(actor.kind!=="owner")throw new BoundaryError("OWNER_REQUIRED");const request=ModelRequestSchema.parse(input);if(!this.model.local&&request.privacyLevel!=="ai-allow")throw new BoundaryError("MODEL_PRIVACY_DENIED");const deadline=new AbortController(),combined=AbortSignal.any([signal,deadline.signal]),timer=setTimeout(()=>deadline.abort(),request.timeoutMs);let cancel:()=>void=()=>{};try{const cancelled=new Promise<never>((_resolve,reject)=>{cancel=()=>reject(new BoundaryError("MODEL_CANCELLED"));if(combined.aborted)cancel();else combined.addEventListener("abort",cancel,{once:true});});if(combined.aborted)throw new BoundaryError("MODEL_CANCELLED");const reply=ModelReplySchema.parse(await Promise.race([this.model.generate(request,combined),cancelled]));if(signal.aborted||reply.cost>request.maxCost||reply.provider!==this.model.id)throw new BoundaryError("MODEL_RESPONSE_DENIED");return reply;}finally{clearTimeout(timer);combined.removeEventListener("abort",cancel);}}recall(actor:Actor,projectId:string){return this.memory.recall(actor,projectId);}}
export * from "./j08-event-bridge.js";
export * from "./j08-security-bridge.js";
export * from "./j09-accountability-bridge.js";
export * from "./conversation-session.js";
export * from "./context-assembly.js";
export * from "./model-orchestration.js";
export * from "./turn-pipeline.js";
export * from "./conversation-history.js";
export * from "./memory-aware-conversation.js";
export * from "./tool-aware-conversation.js";
export * from "./tool-aware-turn.js";
