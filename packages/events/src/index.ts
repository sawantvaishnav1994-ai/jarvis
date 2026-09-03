import { z } from "zod";
import { ActorSchema } from "@jarvis/identity";
import { ContractVersionSchema, IdentifierSchema, EnvironmentSchema, PrivacySchema } from "@jarvis/shared";

export const EventSchema = z.strictObject({
  version:ContractVersionSchema,id:z.uuid(),type:z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/),source:IdentifierSchema,timestamp:z.iso.datetime(),actor:ActorSchema,environment:EnvironmentSchema,data:z.record(z.string(),z.json()),sensitivity:PrivacySchema,correlationId:IdentifierSchema,
}).refine(e=>e.actor.environment===e.environment,"Event environment mismatch");
export type JarvisEvent=z.infer<typeof EventSchema>;
export interface EventPublisher{publish(event:JarvisEvent):Promise<void>}
export const FoundationJobSchema=z.strictObject({version:ContractVersionSchema,type:z.literal("foundation.ping"),environment:z.literal("development"),correlationId:z.uuid()});
export type FoundationJob=z.infer<typeof FoundationJobSchema>;
export const queueName=(environment:string)=>"jarvis-"+EnvironmentSchema.parse(environment)+"-foundation";

export * from "./j08-contracts.js";
export * from "./j08-runtime.js";
export * from "./j08-ingress.js";
export * from "./j08-transport.js";
export { Queue,Worker,QueueEvents } from "bullmq";
export { Redis } from "ioredis";
