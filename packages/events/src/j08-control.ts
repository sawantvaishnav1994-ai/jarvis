import type { JarvisEventEnvelope } from "./j08-contracts.js";
import { EventSystemError } from "./j08-contracts.js";
import type { EventRouter, EventSystem, EventTypeRegistry } from "./j08-runtime.js";

export class EventAdmissionLimiter{
  private windows=new Map<string,{started:number;count:number}>();
  constructor(private maxPerOwner=500,private maxPerProducer=250,private windowMs=60_000,private now=()=>Date.now()){}
  check(event:JarvisEventEnvelope){this.hit(`owner:${event.ownerId}`,this.maxPerOwner);this.hit(`producer:${event.ownerId}:${event.producerId}`,this.maxPerProducer);}
  private hit(key:string,max:number){const now=this.now(),current=this.windows.get(key);if(!current||now-current.started>=this.windowMs){this.windows.set(key,{started:now,count:1});return;}if(current.count>=max)throw new EventSystemError("EVENT_BACKPRESSURE");current.count++;}
}

export interface EventAdminStorePort{
  load(eventId:string):Promise<JarvisEventEnvelope|undefined>;
  cancelDelivery(eventId:string,consumerId:string):Promise<"cancelled"|"completed"|"missing">;
  cancelSchedule(scheduleId:string,ownerId:string):Promise<boolean>;
  listDeadLetters(ownerId:string,limit:number):Promise<Array<{eventId:string;consumerId:string;errorCode:string;attempts:number;createdAt:string}>>;
}

export class EventControlPlane{
  constructor(private system:EventSystem,private registry:EventTypeRegistry,private router:EventRouter,private store:EventAdminStorePort){}
  async inspect(ownerId:string){const health=await this.system.health();return{health,eventTypes:this.registry.inspect(),subscriptions:this.router.inspect().filter(s=>s.ownerId===ownerId),deadLetters:await this.store.listDeadLetters(ownerId,100)};}
  disableSubscription(ownerId:string,subscriptionId:string){const s=this.router.inspect().find(v=>v.subscriptionId===subscriptionId);if(!s||s.ownerId!==ownerId)throw new EventSystemError("OWNER_SCOPE_DENIED");this.router.setEnabled(subscriptionId,false);}
  async cancelSchedule(ownerId:string,scheduleId:string){if(!await this.store.cancelSchedule(scheduleId,ownerId))throw new EventSystemError("SCHEDULE_NOT_FOUND");}
  async cancelDelivery(ownerId:string,eventId:string,consumerId:string){const event=await this.store.load(eventId);if(!event||event.ownerId!==ownerId)throw new EventSystemError("OWNER_SCOPE_DENIED");return this.store.cancelDelivery(eventId,consumerId);}
  async replay(ownerId:string,eventId:string,reason:string){const event=await this.store.load(eventId);if(!event||event.ownerId!==ownerId)throw new EventSystemError("OWNER_SCOPE_DENIED");return this.system.replay(eventId,"OWNER",reason);}
}

export class GracefulEventWorkerGate{
  private accepting=true;private inFlight=0;
  enter(){if(!this.accepting)throw new EventSystemError("EVENT_WORKER_DRAINING");this.inFlight++;let left=false;return()=>{if(!left){left=true;this.inFlight--;}};}
  beginShutdown(){this.accepting=false;}
  status(){return{accepting:this.accepting,inFlight:this.inFlight};}
  async drain(deadlineMs=5000){const end=Date.now()+deadlineMs;while(this.inFlight>0&&Date.now()<end)await new Promise(r=>setTimeout(r,10));if(this.inFlight>0)throw new EventSystemError("EVENT_DRAIN_TIMEOUT");}
}
