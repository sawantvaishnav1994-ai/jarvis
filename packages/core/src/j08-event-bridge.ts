import type { EventConsumer, JarvisEventEnvelope } from "@jarvis/events";
import type { ToolRequest, UniversalToolGateway } from "@jarvis/tools";

/** Event data never carries tool authority. The request factory builds an ordinary J0.7 request and the gateway re-authorizes it. */
export class GovernedEventToolConsumer implements EventConsumer{
  constructor(readonly consumerId:string,private gateway:UniversalToolGateway,private requestFor:(event:JarvisEventEnvelope)=>ToolRequest){}
  async handle(event:JarvisEventEnvelope){const request=this.requestFor(event);const idempotencyKey=`event:${event.eventId}:${this.consumerId}:${request.toolId}:${request.operation}`;await this.gateway.invoke({...request,source:"SYSTEM",idempotencyKey,metadata:{...request.metadata,eventId:event.eventId,correlationId:event.correlationId,eventConsumerId:this.consumerId}});}
}
