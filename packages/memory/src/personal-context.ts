import { createHash } from "node:crypto";
import { BoundaryError, type DataPolicy } from "@jarvis/shared";
import {
    ContextPackageSchema,
    ContextRequestSchema,
    MemoryRetrievalResultSchema,
    type ContextPackage,
    type ContextRequest,
    type MemoryAssertionStatus,
    type MemoryRetrievalResult,
    type RetrievalReason,
} from "./j05-contracts.js";
import { rankHybridMemoryCandidates, type HybridRetrievalSignal } from "./retrieval.js";

export interface PrivateSemanticRecord {
    memoryId: string; ownerId: string; projectId: string | null; content: string; policy: DataPolicy;
    lifecycle: "ACTIVE"|"SUPERSEDED"|"DISPUTED"|"EXPIRED"|"DELETION_REQUESTED"|"DELETED"|"PURGED"|"PROPOSED";
    assertion: MemoryAssertionStatus; confidence: number; capturedAt: string; validUntil: string | null;
    semanticVector: readonly number[] | null; provenanceCount: number; pinned?: boolean;
}
export interface GraphContextFact { id:string; ownerId:string; projectId:string|null; text:string; confidence:number; disputed:boolean; policy:DataPolicy; sourceMemoryIds:readonly string[]; }
export interface MemoryAuditEvent { action:"create"|"admission"|"retrieve"|"correct"|"conflict"|"supersede"|"context.include"|"context.exclude"|"delete"|"expire"; ownerId:string; memoryId?:string; reason:string; at:string; }
export interface MemoryAuditSink { append(event: MemoryAuditEvent): Promise<void>|void; }
export interface OwnerMemoryStore { list(ownerId:string):Promise<PrivateSemanticRecord[]>; correct(ownerId:string,memoryId:string,content:string):Promise<void>; forget(ownerId:string,memoryId:string):Promise<void>; provenance(ownerId:string,memoryId:string):Promise<unknown[]>; conflicts(ownerId:string):Promise<unknown[]>; restrict(ownerId:string,semanticKey:string):Promise<void>; }

function cosine(a: readonly number[], b: readonly number[]): number {
    if (a.length !== b.length || a.length === 0) throw new BoundaryError("MEMORY_VECTOR_DIMENSION_MISMATCH");
    let dot=0,aa=0,bb=0; for(let i=0;i<a.length;i++){const x=a[i]!,y=b[i]!;dot+=x*y;aa+=x*x;bb+=y*y;} if(aa===0||bb===0)return 0;
    return Math.max(0,Math.min(1,(dot/Math.sqrt(aa*bb)+1)/2));
}
function words(value:string){return new Set(value.toLowerCase().match(/[a-z0-9]+/g)??[]);}
function lexical(query:string,content:string){const q=words(query),c=words(content);if(!q.size)return 0;let n=0;for(const w of q)if(c.has(w))n++;return n/q.size;}
function temporalScore(capturedAt:string,asOf:string){const age=Math.max(0,Date.parse(asOf)-Date.parse(capturedAt));return Math.max(0,1-age/(365*24*60*60*1000));}
function externalAllowed(policy:DataPolicy,request:ContextRequest){if(request.processingTarget==="LOCAL_ONLY")return true;if(policy.classification==="D5"||policy.privacy==="local-only")return false;return policy.consent.externalAI&&policy.privacy==="ai-allow";}
function current(record:PrivateSemanticRecord,asOf:string){return record.lifecycle==="ACTIVE"&&(!record.validUntil||Date.parse(record.validUntil)>Date.parse(asOf));}

export class PrivateSemanticRetriever {
    constructor(private readonly audit?:MemoryAuditSink){}
    async retrieve(input:{ownerId:string;projectId:string|null;query:string;queryVector:readonly number[]|null;asOf:string;limit:number;records:readonly PrivateSemanticRecord[]}):Promise<MemoryRetrievalResult>{
        const query={version:1 as const,ownerId:input.ownerId,projectId:input.projectId,query:input.query,kinds:[],entityIds:[],includeDisputed:false,asOf:input.asOf,limit:input.limit};
        try{
            const signals:HybridRetrievalSignal[]=input.records.filter(r=>r.ownerId===input.ownerId&&(input.projectId===null||r.projectId===input.projectId)&&current(r,input.asOf)).map(r=>({memoryId:r.memoryId,semanticScore:input.queryVector&&r.semanticVector?cosine(input.queryVector,r.semanticVector):0,lexicalScore:lexical(input.query,r.content),temporalScore:temporalScore(r.capturedAt,input.asOf),confidence:r.confidence,assertion:r.assertion,lifecycle:r.lifecycle,projectMatch:input.projectId!==null&&r.projectId===input.projectId,entityMatch:false,exactMatch:r.content.toLowerCase()===input.query.toLowerCase(),pinned:Boolean(r.pinned)}));
            const candidates=rankHybridMemoryCandidates(signals,input.limit);await this.audit?.append({action:"retrieve",ownerId:input.ownerId,reason:`${candidates.length} scoped memories`,at:new Date().toISOString()});
            return MemoryRetrievalResultSchema.parse({version:1,query,candidates,degraded:false,degradationReasons:[]});
        }catch(error){await this.audit?.append({action:"retrieve",ownerId:input.ownerId,reason:"safe degradation",at:new Date().toISOString()});return MemoryRetrievalResultSchema.parse({version:1,query,candidates:[],degraded:true,degradationReasons:[error instanceof BoundaryError?error.code:"RETRIEVAL_UNAVAILABLE"]});}
    }
}

export class ContextAssembler {
    constructor(private readonly audit?:MemoryAuditSink){}
    async assemble(requestInput:unknown,memories:readonly PrivateSemanticRecord[],retrieval:MemoryRetrievalResult,graphFacts:readonly GraphContextFact[]):Promise<ContextPackage>{
        const request=ContextRequestSchema.parse(requestInput),byId=new Map(memories.map(m=>[m.memoryId,m]));
        const items:{memoryId:string;content:string;confidence:number;assertion:MemoryAssertionStatus;reasons:RetrievalReason[];provenanceCount:number}[]=[];
        const exclusions:{recordId:string|null;reason:"OWNER_SCOPE"|"PROJECT_SCOPE"|"LIFECYCLE"|"EXPIRED"|"DISPUTED"|"D5_SECRET"|"NEVER_EXTERNAL"|"PROCESSING_POLICY"|"BUDGET"|"LOW_RELEVANCE"|"MALFORMED"}[]=[];let chars=0;
        for(const hit of retrieval.candidates){const m=byId.get(hit.memoryId);if(!m){exclusions.push({recordId:hit.memoryId,reason:"MALFORMED"});continue;}let reason:typeof exclusions[number]["reason"]|null=null;
            if(m.ownerId!==request.ownerId)reason="OWNER_SCOPE";else if(request.projectId!==null&&m.projectId!==request.projectId)reason="PROJECT_SCOPE";else if(m.lifecycle==="DISPUTED")reason="DISPUTED";else if(m.lifecycle!=="ACTIVE")reason="LIFECYCLE";else if(m.validUntil&&Date.parse(m.validUntil)<=Date.now())reason="EXPIRED";else if(m.policy.classification==="D5")reason="D5_SECRET";else if(!externalAllowed(m.policy,request))reason=request.processingTarget==="LOCAL_ONLY"?"PROCESSING_POLICY":"NEVER_EXTERNAL";else if(items.length>=request.budget.maxMemories||chars+m.content.length>request.budget.maxCharacters)reason="BUDGET";
            if(reason){exclusions.push({recordId:m.memoryId,reason});await this.audit?.append({action:"context.exclude",ownerId:request.ownerId,memoryId:m.memoryId,reason,at:new Date().toISOString()});continue;}items.push({memoryId:m.memoryId,content:m.content,confidence:m.confidence,assertion:m.assertion,reasons:hit.reasons,provenanceCount:Math.max(1,m.provenanceCount)});chars+=m.content.length;await this.audit?.append({action:"context.include",ownerId:request.ownerId,memoryId:m.memoryId,reason:"ranked-minimum-context",at:new Date().toISOString()});}
        for(const fact of graphFacts.slice(0,request.budget.maxGraphFacts)){if(fact.ownerId!==request.ownerId||(request.projectId!==null&&fact.projectId!==request.projectId)||fact.disputed||!externalAllowed(fact.policy,request))continue;if(chars+fact.text.length>request.budget.maxCharacters)break;chars+=fact.text.length;}
        return ContextPackageSchema.parse({version:1,ownerId:request.ownerId,projectId:request.projectId,items,exclusions,totalCharacters:chars,processingAllowed:request.processingTarget==="LOCAL_ONLY"||items.length>0||graphFacts.length===0,degraded:retrieval.degraded});
    }
}

export class OwnerMemoryControl { constructor(private readonly store:OwnerMemoryStore,private readonly audit?:MemoryAuditSink){} async inspect(ownerId:string){return this.store.list(ownerId);} async explain(ownerId:string,memoryId:string){return{memoryId,provenance:await this.store.provenance(ownerId,memoryId),fingerprint:createHash("sha256").update(ownerId+":"+memoryId).digest("hex")};} async showConflicts(ownerId:string){return this.store.conflicts(ownerId);} async correct(ownerId:string,memoryId:string,content:string){if(!content.trim())throw new BoundaryError("MEMORY_CORRECTION_EMPTY");await this.store.correct(ownerId,memoryId,content);await this.audit?.append({action:"correct",ownerId,memoryId,reason:"owner correction",at:new Date().toISOString()});} async forget(ownerId:string,memoryId:string){await this.store.forget(ownerId,memoryId);await this.audit?.append({action:"delete",ownerId,memoryId,reason:"owner forget",at:new Date().toISOString()});} async neverStore(ownerId:string,semanticKey:string){if(!semanticKey.trim())throw new BoundaryError("MEMORY_RESTRICTION_EMPTY");await this.store.restrict(ownerId,semanticKey);} }

export function resolveTruth(input:{existing:{memoryId:string;assertion:MemoryAssertionStatus;validFrom:string|null;content:string}[];incoming:{memoryId:string;assertion:MemoryAssertionStatus;validFrom:string|null;content:string};ownerConfirmed:boolean}){const authority:Record<MemoryAssertionStatus,number>={OWNER_ASSERTED:5,OBSERVED:4,IMPORTED:3,DERIVED:2,MODEL_INFERRED:1};if(input.existing.some(x=>x.content===input.incoming.content))return{state:"MERGE" as const,current:input.incoming.memoryId,superseded:[] as string[]};const owners=input.existing.filter(x=>x.assertion==="OWNER_ASSERTED");if(input.incoming.assertion==="OWNER_ASSERTED"&&owners.length&&!input.ownerConfirmed)return{state:"OWNER_CONFIRMATION_REQUIRED" as const,current:null,superseded:[] as string[]};const newer=input.existing.filter(x=>input.incoming.validFrom&&x.validFrom&&Date.parse(input.incoming.validFrom)>Date.parse(x.validFrom)),lower=input.existing.filter(x=>authority[input.incoming.assertion]>authority[x.assertion]),superseded=[...new Set([...newer,...lower].map(x=>x.memoryId))];if(superseded.length)return{state:"SUPERSEDE" as const,current:input.incoming.memoryId,superseded};return{state:"DISPUTED" as const,current:null,superseded:[] as string[]};}
