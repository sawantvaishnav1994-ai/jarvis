import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ExternalIngressRequestSchema, EventSystemError, JarvisEventEnvelopeSchema, type ExternalIngressRequest, type JarvisEventEnvelope } from "./j08-contracts.js";
import type { EventSystem, EvidenceSink } from "./j08-runtime.js";

export type TrustedProducer = {
  producerId:string; ownerId:string; projectId?:string; eventType:string; schemaVersion:number; subject:string;
  classification:"D0"|"D1"|"D2"|"D3"|"D4"; privacy:"local-only"|"private-cloud"|"ai-allow";
};
export interface IngressAuthenticator { verify(request:ExternalIngressRequest):Promise<boolean>; }
export interface IngressReceiptPort { claim(producerId:string,sourceEventId:string,nonce:string|undefined,signatureDigest:string):Promise<"claimed"|"duplicate">; bind(producerId:string,sourceEventId:string,eventId:string):Promise<void>; }
export class MemoryIngressReceipts implements IngressReceiptPort{
  private receipts=new Map<string,{nonce?:string;eventId?:string}>();private nonces=new Set<string>();
  async claim(p:string,s:string,n:string|undefined){const k=`${p}:${s}`;if(this.receipts.has(k)||(n!==undefined&&this.nonces.has(`${p}:${n}`)))return "duplicate" as const;this.receipts.set(k,n===undefined?{}:{nonce:n});if(n!==undefined)this.nonces.add(`${p}:${n}`);return "claimed" as const;}
  async bind(p:string,s:string,eventId:string){const k=`${p}:${s}`,r=this.receipts.get(k);if(r)this.receipts.set(k,{...r,eventId});}
}
export class HmacIngressAuthenticator implements IngressAuthenticator{
  constructor(private keyFor:(producerId:string)=>Promise<string|undefined>,private toleranceMs=300_000,private now=()=>Date.now()){}
  async verify(r:ExternalIngressRequest){if(Math.abs(this.now()-r.timestamp)>this.toleranceMs)return false;const key=await this.keyFor(r.producerId);if(!key)return false;const material=`${r.timestamp}.${r.sourceEventId}.${r.nonce??""}.${r.rawBody}`;const expected=createHmac("sha256",key).update(material).digest();let supplied:Buffer;try{supplied=Buffer.from(r.signature,"hex");}catch{return false;}return supplied.length===expected.length&&timingSafeEqual(supplied,expected);}
}
export class ExternalEventIngress{
  constructor(private system:EventSystem,private producers:Map<string,TrustedProducer>,private auth:IngressAuthenticator,private receipts:IngressReceiptPort,private evidence:EvidenceSink,private maxBytes=262_144){}
  async ingest(input:ExternalIngressRequest){const r=ExternalIngressRequestSchema.parse(input);if(Buffer.byteLength(r.rawBody,"utf8")>this.maxBytes)throw new EventSystemError("PAYLOAD_TOO_LARGE");const producer=this.producers.get(r.producerId);if(!producer)throw new EventSystemError("PRODUCER_UNAUTHORIZED");if(!await this.auth.verify(r)){await this.evidence.append({type:"EVENT_REJECTED",eventId:"00000000-0000-0000-0000-000000000000",code:"INGRESS_AUTH_INVALID",at:new Date().toISOString()});throw new EventSystemError("INGRESS_AUTH_INVALID");}const digest=createHash("sha256").update(r.signature).digest("hex");if(await this.receipts.claim(r.producerId,r.sourceEventId,r.nonce,digest)==="duplicate")throw new EventSystemError("INGRESS_REPLAY");let parsed:unknown;try{parsed=JSON.parse(r.rawBody);}catch{throw new EventSystemError("EVENT_PAYLOAD_INVALID");}if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new EventSystemError("EVENT_PAYLOAD_INVALID");const now=new Date(this.auth instanceof HmacIngressAuthenticator?Date.now():Date.now()).toISOString();const event:JarvisEventEnvelope=JarvisEventEnvelopeSchema.parse({eventId:randomUUID(),eventType:producer.eventType,schemaVersion:producer.schemaVersion,occurredAt:new Date(r.timestamp).toISOString(),receivedAt:now,ownerId:producer.ownerId,...(producer.projectId?{projectId:producer.projectId}:{}),correlationId:`ingress:${r.producerId}:${r.sourceEventId}`,producerId:r.producerId,producerType:"EXTERNAL",sourceEventId:r.sourceEventId,subject:producer.subject,payload:parsed,payloadClassification:producer.classification,privacy:producer.privacy,chainDepth:0});await this.evidence.append({type:"EVENT_AUTHENTICATED",eventId:event.eventId,at:now});const result=await this.system.accept(event);await this.receipts.bind(r.producerId,r.sourceEventId,event.eventId);return result;}
}
