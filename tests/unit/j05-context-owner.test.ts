import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ContextAssembler, OwnerMemoryControl, PrivateSemanticRetriever, resolveTruth, type PrivateSemanticRecord } from "@jarvis/memory";
import type { DataPolicy } from "@jarvis/shared";

const policy=(classification:"D0"|"D2"|"D5"="D2",externalAI=true):DataPolicy=>({version:1,classification,privacy:classification==="D5"?"local-only":externalAI?"ai-allow":"private-cloud",retention:{mode:"keep"},consent:{storeConversation:true,createMemory:true,projectKnowledge:true,keepAttachments:true,personalization:true,externalAI}});
const record=(over:Partial<PrivateSemanticRecord>={}):PrivateSemanticRecord=>({memoryId:randomUUID(),ownerId:"owner",projectId:"jarvis",content:"Owner prefers concise engineering summaries",policy:policy(),lifecycle:"ACTIVE",assertion:"OWNER_ASSERTED",confidence:1,capturedAt:"2026-09-03T00:00:00.000Z",validUntil:null,semanticVector:[1,0,0],provenanceCount:1,...over});

describe("J0.5 private context and owner controls",()=>{
 it("retrieves encrypted/local semantic material only inside the authorized record boundary",async()=>{
   const good=record(), wrong=record({ownerId:"other"});
   const result=await new PrivateSemanticRetriever().retrieve({ownerId:"owner",projectId:"jarvis",query:"concise summaries",queryVector:[1,0,0],asOf:"2026-09-03T12:00:00.000Z",limit:10,records:[good,wrong]});
   expect(result.degraded).toBe(false); expect(result.candidates[0]?.memoryId).toBe(good.memoryId); expect(result.candidates.some(x=>x.memoryId===wrong.memoryId)).toBe(false);
 });
 it("fails safely when private vector dimensions are malformed",async()=>{
   const result=await new PrivateSemanticRetriever().retrieve({ownerId:"owner",projectId:"jarvis",query:"x",queryVector:[1,0],asOf:"2026-09-03T12:00:00.000Z",limit:10,records:[record()]});
   expect(result.degraded).toBe(true); expect(result.candidates).toEqual([]); expect(result.degradationReasons).toContain("MEMORY_VECTOR_DIMENSION_MISMATCH");
 });
 it("minimizes external context and excludes D5, wrong project, disputed and never-external memory",async()=>{
   const ok=record(), secret=record({policy:policy("D5",false)}), wrong=record({projectId:"other"}), disputed=record({lifecycle:"DISPUTED"}), local=record({policy:policy("D2",false)});
   const retrieval={version:1 as const,query:{version:1 as const,ownerId:"owner",projectId:"jarvis",query:"x",kinds:[],entityIds:[],includeDisputed:false,asOf:"2026-09-03T12:00:00.000Z",limit:10},candidates:[ok,secret,wrong,disputed,local].map(m=>({memoryId:m.memoryId,score:1,reasons:["SEMANTIC_SIMILARITY" as const],lifecycle:m.lifecycle,assertion:m.assertion,confidence:m.confidence})),degraded:false,degradationReasons:[]};
   const pack=await new ContextAssembler().assemble({version:1,ownerId:"owner",projectId:"jarvis",purpose:"answer",query:"x",processingTarget:"APPROVED_EXTERNAL_AI",providerId:"synthetic",budget:{maxMemories:2,maxGraphFacts:2,maxCharacters:1000,maxRelationshipDepth:1,maxAgeDays:null}},[ok,secret,wrong,disputed,local],retrieval,[]);
   expect(pack.items.map(x=>x.memoryId)).toEqual([ok.memoryId]);
   expect(pack.exclusions.map(x=>x.reason)).toEqual(expect.arrayContaining(["D5_SECRET","PROJECT_SCOPE","DISPUTED","NEVER_EXTERNAL"]));
 });
 it("distinguishes owner correction from temporal supersession and disputes",()=>{
   const old=randomUUID(), incoming=randomUUID();
   expect(resolveTruth({existing:[{memoryId:old,assertion:"MODEL_INFERRED",validFrom:"2026-01-01T00:00:00.000Z",content:"old"}],incoming:{memoryId:incoming,assertion:"OWNER_ASSERTED",validFrom:"2026-02-01T00:00:00.000Z",content:"new"},ownerConfirmed:true})).toMatchObject({state:"SUPERSEDE",current:incoming,superseded:[old]});
   expect(resolveTruth({existing:[{memoryId:old,assertion:"OWNER_ASSERTED",validFrom:null,content:"old"}],incoming:{memoryId:incoming,assertion:"OWNER_ASSERTED",validFrom:null,content:"new"},ownerConfirmed:false}).state).toBe("OWNER_CONFIRMATION_REQUIRED");
 });
 it("exposes inspect explain correct forget conflicts and never-store owner controls",async()=>{
   const actions:string[]=[]; const id=randomUUID();
   const store={list:async()=>[record({memoryId:id})],correct:async()=>{actions.push("correct")},forget:async()=>{actions.push("forget")},provenance:async()=>[{source:"owner"}],conflicts:async()=>[{id:"c"}],restrict:async()=>{actions.push("restrict")}};
   const c=new OwnerMemoryControl(store);
   expect((await c.inspect("owner"))[0]?.memoryId).toBe(id); expect((await c.explain("owner",id)).provenance).toHaveLength(1); expect(await c.showConflicts("owner")).toHaveLength(1);
   await c.correct("owner",id,"corrected"); await c.forget("owner",id); await c.neverStore("owner","owner:secret"); expect(actions).toEqual(["correct","forget","restrict"]);
 });
});
