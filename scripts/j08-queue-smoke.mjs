import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BullMqEventTransport, Queue, eventQueueName } from "@jarvis/events";
import { runtime, readSecret, fail } from "./runtime.mjs";
const { config, actor, secrets } = await runtime("jarvis-j08-queue-smoke", ["development/redis/runtime"]);
const connection={host:config.events.host,port:config.events.port,password:await readSecret(secrets,actor,config.events.passwordRef),maxRetriesPerRequest:1,connectTimeout:1500};
const name=eventQueueName(config.environment),queue=new Queue(name,{connection}),transport=new BullMqEventTransport(queue);
queue.on("error",()=>{});
const eventId=randomUUID(),event={eventId,eventType:"system.queue.probe",schemaVersion:1,occurredAt:new Date().toISOString(),receivedAt:new Date().toISOString(),ownerId:"j08-smoke",projectId:"jarvis",correlationId:randomUUID(),producerId:"jarvis.smoke",producerType:"SYSTEM",subject:"queue transport probe",payload:{reference:"safe"},payloadClassification:"D0",privacy:"local-only",chainDepth:0};
try{await transport.publish(event);await transport.publish(event);const job=await queue.getJob(eventId);assert(job);assert.equal(job.id,eventId);assert.deepEqual(job.data,event);const counts=await queue.getJobCounts("waiting","active","delayed","failed","completed");assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),1);await job.remove();console.log("J0.8_QUEUE_TRANSPORT_PASSED — real Redis/BullMQ transport uses eventId idempotency");}catch{fail("J08_QUEUE_TRANSPORT_FAILED");}finally{await queue.close();}
