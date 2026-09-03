import { BoundaryError } from "@jarvis/shared";
import {
    EntitySchema,
    GraphQuerySchema,
    GraphResultSchema,
    KnowledgeRelationshipSchema,
    RelationshipEvidenceSchema,
    type Entity,
    type GraphResult,
    type KnowledgeRelationship,
    type RelationshipEvidence,
} from "./j05-contracts.js";

export interface KnowledgeGraphStore {
    entities(ownerId:string): Promise<Entity[]>;
    relationships(ownerId:string): Promise<KnowledgeRelationship[]>;
    evidence(ownerId:string): Promise<RelationshipEvidence[]>;
    putEntity(entity:Entity): Promise<void>;
    putRelationship(relationship:KnowledgeRelationship): Promise<void>;
    putEvidence(evidence:RelationshipEvidence): Promise<void>;
}

function norm(value:string){ return value.trim().toLowerCase().replace(/\s+/g," "); }
function activeAt(r:KnowledgeRelationship, asOf:string){
    const t=Date.parse(asOf);
    return r.status==="ACTIVE" && (r.validFrom===null || Date.parse(r.validFrom)<=t) && (r.validUntil===null || Date.parse(r.validUntil)>t);
}

export class KnowledgeEvidenceEngine {
    constructor(private readonly store:KnowledgeGraphStore){}

    async upsertCanonicalEntity(input:unknown):Promise<{entity:Entity;deduplicated:boolean}> {
        const entity=EntitySchema.parse(input);
        const existing=(await this.store.entities(entity.ownerId)).find(e=>
            e.lifecycle==="ACTIVE" && e.type===entity.type &&
            (norm(e.canonicalName)===norm(entity.canonicalName) || e.aliases.some(a=>norm(a)===norm(entity.canonicalName)) || entity.aliases.some(a=>norm(a)===norm(e.canonicalName)))
        );
        if(existing) return {entity:existing,deduplicated:true};
        await this.store.putEntity(entity);
        return {entity,deduplicated:false};
    }

    async addRelationship(input:unknown, evidenceInput:readonly unknown[]):Promise<KnowledgeRelationship>{
        const relation=KnowledgeRelationshipSchema.parse(input);
        const evidence=evidenceInput.map(x=>RelationshipEvidenceSchema.parse(x));
        if(!evidence.length) throw new BoundaryError("KNOWLEDGE_EVIDENCE_REQUIRED");
        if(evidence.some(e=>e.ownerId!==relation.ownerId || e.relationshipId!==relation.id)) throw new BoundaryError("KNOWLEDGE_EVIDENCE_SCOPE_MISMATCH");
        const activeEvidence=evidence.filter(e=>e.active);
        if(!activeEvidence.length) throw new BoundaryError("KNOWLEDGE_ACTIVE_EVIDENCE_REQUIRED");
        const confidence=activeEvidence.reduce((s,e)=>s+e.confidence,0)/activeEvidence.length;
        const normalized=KnowledgeRelationshipSchema.parse({...relation,confidence:Math.min(1,Math.max(0,confidence)),evidenceIds:activeEvidence.map(e=>e.id).sort()});
        await this.store.putRelationship(normalized);
        for(const e of activeEvidence) await this.store.putEvidence(e);
        return normalized;
    }

    async recomputeConfidence(ownerId:string,relationshipId:string):Promise<number>{
        const evidence=(await this.store.evidence(ownerId)).filter(e=>e.relationshipId===relationshipId&&e.active);
        if(!evidence.length) return 0;
        return evidence.reduce((s,e)=>s+e.confidence,0)/evidence.length;
    }

    async traverse(input:unknown):Promise<GraphResult>{
        const q=GraphQuerySchema.parse(input);
        const allEntities=(await this.store.entities(q.ownerId)).filter(e=>e.lifecycle==="ACTIVE" && (q.projectId===null||e.projectId===q.projectId));
        const allRelationships=(await this.store.relationships(q.ownerId)).filter(r=>
            (q.projectId===null||r.projectId===q.projectId) &&
            (q.includeDisputed ? ["ACTIVE","DISPUTED"].includes(r.status) : activeAt(r,q.asOf)) &&
            (!q.predicates.length||q.predicates.includes(r.predicate))
        );
        const bySource=new Map<string,KnowledgeRelationship[]>();
        for(const r of allRelationships){ const list=bySource.get(r.sourceEntityId)??[]; list.push(r); bySource.set(r.sourceEntityId,list); }
        const seen=new Set(q.startEntityIds), edges:KnowledgeRelationship[]=[];
        let frontier=[...q.startEntityIds], depth=0, truncated=false;
        while(frontier.length && depth<q.maxDepth){
            const next:string[]=[];
            for(const id of frontier){
                for(const r of bySource.get(id)??[]){
                    if(edges.length>=q.maxEdges){truncated=true;break;}
                    edges.push(r);
                    if(r.target.kind==="entity"&&!seen.has(r.target.entityId)){seen.add(r.target.entityId);next.push(r.target.entityId);}
                }
                if(truncated) break;
            }
            if(truncated) break;
            frontier=next; depth++;
        }
        const evidenceIds=new Set(edges.flatMap(e=>e.evidenceIds));
        const evidence=(await this.store.evidence(q.ownerId)).filter(e=>evidenceIds.has(e.id)&&e.active);
        return GraphResultSchema.parse({version:1,entities:allEntities.filter(e=>seen.has(e.id)),relationships:edges,evidence,truncated,maxDepthReached:depth});
    }

    async invalidateUnsupported(ownerId:string,sourceMemoryId:string):Promise<string[]>{
        const impacted=(await this.store.evidence(ownerId)).filter(e=>e.sourceMemoryId===sourceMemoryId&&e.active).map(e=>e.relationshipId);
        return [...new Set(impacted)];
    }
}
