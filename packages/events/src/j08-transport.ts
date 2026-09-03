import type { JarvisEventEnvelope } from "./j08-contracts.js";
import { EventSystemError } from "./j08-contracts.js";

export interface EventTransportPort { publish(event:JarvisEventEnvelope):Promise<void>; }
export interface OutboxStorePort { claimOutbox(limit?:number):Promise<string[]>; load(eventId:string):Promise<JarvisEventEnvelope|undefined>; markPublished(eventId:string):Promise<void>; releaseOutbox(eventId:string,code:string,delayMs:number):Promise<void>; }

export class OutboxDispatcher{
  constructor(private store:OutboxStorePort,private transport:EventTransportPort,private retryDelayMs=250){}
  async dispatch(limit=100){const ids=await this.store.claimOutbox(limit),result={published:0,released:0};for(const id of ids){const event=await this.store.load(id);if(!event){await this.store.releaseOutbox(id,"EVENT_NOT_FOUND",60_000);result.released++;continue;}try{await this.transport.publish(event);await this.store.markPublished(id);result.published++;}catch(error){const code=error instanceof EventSystemError?error.code:"TRANSPORT_UNAVAILABLE";await this.store.releaseOutbox(id,code,this.retryDelayMs);result.released++;}}return result;}
}

export class MemoryEventTransport implements EventTransportPort{
  published:JarvisEventEnvelope[]=[];available=true;duplicateDelivery=false;
  async publish(event:JarvisEventEnvelope){if(!this.available)throw new EventSystemError("TRANSPORT_UNAVAILABLE");this.published.push(structuredClone(event));if(this.duplicateDelivery)this.published.push(structuredClone(event));}
}

export function eventQueueName(environment:string){if(!/^[a-z0-9-]{1,40}$/.test(environment))throw new EventSystemError("ENVIRONMENT_INVALID");return `jarvis-${environment}-events`;}

export class BullMqEventTransport implements EventTransportPort{
  constructor(private queue:{add:(name:string,data:unknown,options?:Record<string,unknown>)=>Promise<unknown>}){}
  async publish(event:JarvisEventEnvelope){await this.queue.add("jarvis.event",event,{jobId:event.eventId,removeOnComplete:1000,removeOnFail:1000});}
}
