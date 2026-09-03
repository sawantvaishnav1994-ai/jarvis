import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type DataClass } from "@jarvis/shared";
import { EventScheduleSchema, EventSubscriptionSchema, EventSystemError, EventTypeDefinitionSchema, JarvisEventEnvelopeSchema, type EventEvidence, type EventSchedule, type EventSubscription, type EventTypeDefinition, type JarvisEventEnvelope } from "./j08-contracts.js";

const rank:Record<DataClass,number>={D0:0,D1:1,D2:2,D3:3,D4:4,D5:5};
const secretKeys=/secret|password|token|cookie|authorization|credential|private.?key/i;
export function safeEventMetadata(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(safeEventMetadata);
  if(value&&typeof value==="object") return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([k])=>!secretKeys.test(k)).map(([k,v])=>[k,safeEventMetadata(v)]));
  return typeof value==="string"&&value.length>512?value.slice(0,512):value;
}
export function payloadBytes(payload:Record<string,unknown>):number{return Buffer.byteLength(JSON.stringify(payload),"utf8");}

export class EventTypeRegistry{
  private defs=new Map<string,EventTypeDefinition>();
  register(input:EventTypeDefinition){const d=EventTypeDefinitionSchema.parse(input),key=`${d.eventType}@${d.schemaVersion}`;if(this.defs.has(key))throw new EventSystemError("EVENT_TYPE_ALREADY_REGISTERED");this.defs.set(key,d);return d;}
  get(eventType:string,schemaVersion:number){const d=this.defs.get(`${eventType}@${schemaVersion}`);if(!d)throw new EventSystemError("EVENT_TYPE_UNKNOWN");return d;}
  inspect(){return [...this.defs.values()].map(({payloadSchema:_payloadSchema,...rest})=>rest).sort((a,b)=>`${a.eventType}@${a.schemaVersion}`.localeCompare(`${b.eventType}@${b.schemaVersion}`));}
  validate(event:JarvisEventEnvelope){const e=JarvisEventEnvelopeSchema.parse(event),d=this.get(e.eventType,e.schemaVersion);if(!d.allowedProducerTypes.includes(e.producerType))throw new EventSystemError("PRODUCER_UNAUTHORIZED");if(rank[e.payloadClassification]>rank[d.maxClassification])throw new EventSystemError("CLASSIFICATION_DENIED");if(payloadBytes(e.payload)>d.maxPayloadBytes)throw new EventSystemError("PAYLOAD_TOO_LARGE");const result=d.payloadSchema.safeParse(e.payload);if(!result.success)throw new EventSystemError("EVENT_PAYLOAD_INVALID");return e;}
}

export interface EventStorePort{
  accept(event:JarvisEventEnvelope):Promise<"accepted"|"duplicate">;
  load(eventId:string):Promise<JarvisEventEnvelope|undefined>;
  claimInbox(eventId:string,consumerId:string):Promise<"claimed"|"completed"|"busy">;
  completeInbox(eventId:string,consumerId:string):Promise<void>;
  sequence(key:string):Promise<number|undefined>;
  setSequence(key:string,value:number):Promise<void>;
  deadLetter(event:JarvisEventEnvelope,consumerId:string,code:string,attempts:number):Promise<void>;
  saveSchedule(schedule:EventSchedule):Promise<void>;
  dueSchedules(now:string,limit:number):Promise<EventSchedule[]>;
  advanceSchedule(scheduleId:string,expectedOccurrence:number,nextDueAt:string,enabled:boolean):Promise<boolean>;
  health():Promise<{pending:number;deadLetters:number;schedules:number}>;
}
export class MemoryEventStore implements EventStorePort{
  events=new Map<string,JarvisEventEnvelope>();inbox=new Map<string,"claimed"|"completed">();seq=new Map<string,number>();dead=[] as Array<{eventId:string;consumerId:string;code:string;attempts:number}>;schedules=new Map<string,EventSchedule>();
  async accept(e:JarvisEventEnvelope){if(this.events.has(e.eventId))return "duplicate";this.events.set(e.eventId,structuredClone(e));return "accepted" as const;}
  async load(id:string){return this.events.get(id);}
  async claimInbox(e:string,c:string){const k=`${e}:${c}`,v=this.inbox.get(k);if(v==="completed")return "completed" as const;if(v==="claimed")return "busy" as const;this.inbox.set(k,"claimed");return "claimed" as const;}
  async completeInbox(e:string,c:string){this.inbox.set(`${e}:${c}`,"completed");}
  async sequence(k:string){return this.seq.get(k);} async setSequence(k:string,v:number){this.seq.set(k,v);}
  async deadLetter(e:JarvisEventEnvelope,c:string,code:string,a:number){this.dead.push({eventId:e.eventId,consumerId:c,code,attempts:a});}
  async saveSchedule(s:EventSchedule){this.schedules.set(s.scheduleId,EventScheduleSchema.parse(s));}
  async dueSchedules(now:string,limit:number){return [...this.schedules.values()].filter(s=>s.enabled&&Date.parse(s.nextDueAt)<=Date.parse(now)).sort((a,b)=>a.nextDueAt.localeCompare(b.nextDueAt)).slice(0,limit);}
  async advanceSchedule(id:string,o:number,next:string,enabled:boolean){const s=this.schedules.get(id);if(!s||s.occurrence!==o)return false;this.schedules.set(id,{...s,occurrence:o+1,nextDueAt:next,enabled});return true;}
  async health(){return{pending:[...this.inbox.values()].filter(v=>v==="claimed").length,deadLetters:this.dead.length,schedules:[...this.schedules.values()].filter(s=>s.enabled).length};}
}

export type EventConsumer={consumerId:string;handle:(event:JarvisEventEnvelope)=>Promise<void>};
export interface ConsumerAuthorizationPort{authorize(subscription:EventSubscription,event:JarvisEventEnvelope):Promise<boolean>;}
export interface PrivilegedActionPort{execute(intent:{event:JarvisEventEnvelope;action:string;input:Record<string,unknown>}):Promise<unknown>;}
export interface EvidenceSink{append(event:EventEvidence):Promise<void>;}

export class EventRouter{
  private subs=new Map<string,EventSubscription>();private consumers=new Map<string,EventConsumer>();
  constructor(private store:EventStorePort,private auth:ConsumerAuthorizationPort,private evidence:EvidenceSink,private maxChainDepth=12){}
  subscribe(s:EventSubscription){const v=EventSubscriptionSchema.parse(s);if(v.eventType.includes("*"))throw new EventSystemError("UNBOUNDED_SUBSCRIPTION");this.subs.set(v.subscriptionId,v);return v;}
  registerConsumer(c:EventConsumer){this.consumers.set(c.consumerId,c);}
  inspect(){return [...this.subs.values()].map(s=>({...s})).sort((a,b)=>a.subscriptionId.localeCompare(b.subscriptionId));}
  setEnabled(id:string,enabled:boolean){const s=this.subs.get(id);if(!s)throw new EventSystemError("SUBSCRIPTION_NOT_FOUND");this.subs.set(id,{...s,enabled});}
  async route(event:JarvisEventEnvelope){if(event.chainDepth>this.maxChainDepth)throw new EventSystemError("EVENT_LOOP_DETECTED");const matches=[...this.subs.values()].filter(s=>s.enabled&&s.eventType===event.eventType&&s.ownerId===event.ownerId&&(s.projectId===undefined||s.projectId===event.projectId));const results=[];for(const s of matches){if(rank[event.payloadClassification]>rank[s.maxClassification])continue;if(event.payloadClassification==="D5"&&s.boundary!=="LOCAL")continue;if(event.privacy==="local-only"&&s.boundary==="EXTERNAL_SERVICE")continue;if(!await this.auth.authorize(s,event))continue;const consumer=this.consumers.get(s.consumerId);if(!consumer)continue;const claim=await this.store.claimInbox(event.eventId,s.consumerId);if(claim==="completed"){await this.evidence.append({type:"EVENT_DEDUPLICATED",eventId:event.eventId,consumerId:s.consumerId,at:new Date().toISOString()});results.push("deduplicated");continue;}if(claim==="busy"){results.push("busy");continue;}await this.evidence.append({type:"EVENT_ROUTED",eventId:event.eventId,consumerId:s.consumerId,at:new Date().toISOString()});let attempt=0;let done=false;while(attempt<s.maxAttempts&&!done){attempt++;try{await this.evidence.append({type:"EVENT_PROCESSING_STARTED",eventId:event.eventId,consumerId:s.consumerId,at:new Date().toISOString()});await consumer.handle(event);await this.store.completeInbox(event.eventId,s.consumerId);await this.evidence.append({type:"EVENT_PROCESSING_COMPLETED",eventId:event.eventId,consumerId:s.consumerId,at:new Date().toISOString()});done=true;results.push("completed");}catch(error){const code=error instanceof EventSystemError?error.code:"CONSUMER_RETRYABLE";const permanent=["POLICY_DENIED","EVENT_PAYLOAD_INVALID","PRODUCER_UNAUTHORIZED","PRIVACY_DENIED"].includes(code);if(permanent||attempt>=s.maxAttempts){if(s.deadLetter){await this.store.deadLetter(event,s.consumerId,code,attempt);await this.evidence.append({type:"EVENT_DEAD_LETTERED",eventId:event.eventId,consumerId:s.consumerId,code,at:new Date().toISOString()});}results.push("dead-lettered");break;}await this.evidence.append({type:"EVENT_RETRY_SCHEDULED",eventId:event.eventId,consumerId:s.consumerId,code,at:new Date().toISOString()});await new Promise(r=>setTimeout(r,Math.min(s.baseBackoffMs*2**(attempt-1),250)));}}
  }return results;}
}

export class EventSystem{
  constructor(readonly registry:EventTypeRegistry,readonly store:EventStorePort,readonly router:EventRouter,readonly evidence:EvidenceSink,private maxOwnerEvents=1000){ }
  async accept(input:JarvisEventEnvelope){const e=this.registry.validate(input);if(e.sequenceKey!==undefined&&e.sequence!==undefined){const last=await this.store.sequence(`${e.ownerId}:${e.sequenceKey}`);if(last!==undefined&&e.sequence<=last)throw new EventSystemError("STALE_EVENT");}const accepted=await this.store.accept(e);if(accepted==="duplicate"){await this.evidence.append({type:"EVENT_DEDUPLICATED",eventId:e.eventId,at:new Date().toISOString()});return{status:"duplicate" as const,event:e};}if(e.sequenceKey!==undefined&&e.sequence!==undefined)await this.store.setSequence(`${e.ownerId}:${e.sequenceKey}`,e.sequence);await this.evidence.append({type:"EVENT_ACCEPTED",eventId:e.eventId,at:new Date().toISOString()});await this.router.route(e);return{status:"accepted" as const,event:e};}
  async replay(eventId:string,actorRole:"OWNER"|"SYSTEM"|"OTHER",reason:string){const original=await this.store.load(eventId);if(!original)throw new EventSystemError("EVENT_NOT_FOUND");const def=this.registry.get(original.eventType,original.schemaVersion);if(def.replayPolicy==="DENY"||(def.replayPolicy==="OWNER_ONLY"&&actorRole!=="OWNER"))throw new EventSystemError("REPLAY_UNAUTHORIZED");if(actorRole==="OTHER")throw new EventSystemError("REPLAY_UNAUTHORIZED");await this.evidence.append({type:"EVENT_REPLAY_REQUESTED",eventId,at:new Date().toISOString()});const replay=JarvisEventEnvelopeSchema.parse({...original,eventId:randomUUID(),receivedAt:new Date().toISOString(),causationId:original.eventId,replayOf:original.eventId,replayReason:reason,chainDepth:original.chainDepth+1});const result=await this.accept(replay);await this.evidence.append({type:"EVENT_REPLAY_COMPLETED",eventId:replay.eventId,at:new Date().toISOString()});return result;}
  async health(){const h=await this.store.health();return{...h,eventTypes:this.registry.inspect().length,subscriptions:this.router.inspect().length,maxOwnerEvents:this.maxOwnerEvents};}
}

export class EventScheduler{
  constructor(private system:EventSystem,private store:EventStorePort,private producerId="jarvis.scheduler"){}
  async tick(now=new Date(),limit=100){const due=await this.store.dueSchedules(now.toISOString(),limit),emitted:string[]=[];for(const s of due){const occurrence=s.occurrence;const next=s.intervalSeconds?new Date(Date.parse(s.nextDueAt)+s.intervalSeconds*1000).toISOString():s.nextDueAt;const enabled=s.intervalSeconds!==undefined;const advanced=await this.store.advanceSchedule(s.scheduleId,occurrence,next,enabled);if(!advanced)continue;const event=JarvisEventEnvelopeSchema.parse({eventId:randomUUID(),eventType:s.eventType,schemaVersion:s.schemaVersion,occurredAt:s.nextDueAt,receivedAt:now.toISOString(),ownerId:s.ownerId,...(s.projectId?{projectId:s.projectId}:{}),correlationId:`schedule:${s.scheduleId}:${occurrence}`,producerId:this.producerId,producerType:"SCHEDULED",sourceEventId:`${s.scheduleId}:${occurrence}`,subject:s.subject,payload:s.payload,payloadClassification:s.classification,privacy:s.privacy,chainDepth:0});await this.system.accept(event);emitted.push(event.eventId);}return emitted;}
}

export const jsonPayload=z.record(z.string(),z.json());
