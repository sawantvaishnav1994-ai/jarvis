import { z } from "zod";
import { ActorSchema } from "@jarvis/identity";
import { PermissionSchema } from "@jarvis/security";
import { ContractVersionSchema,IdentifierSchema,EnvironmentSchema } from "@jarvis/shared";
export const AuditRecordSchema=z.strictObject({version:ContractVersionSchema,id:z.uuid(),actor:ActorSchema,environment:EnvironmentSchema,requestId:IdentifierSchema,operation:IdentifierSchema,toolId:IdentifierSchema,permission:PermissionSchema,approval:z.enum(["not-required","approved","denied"]),result:z.enum(["requested","denied","success","failed"]),inputHash:z.string().regex(/^[a-f0-9]{64}$/),timestamp:z.iso.datetime()}).refine(v=>v.environment===v.actor.environment,"Audit environment mismatch");
export type AuditRecord=z.infer<typeof AuditRecordSchema>;
export interface AuditSink{append(record:AuditRecord):Promise<void>}
export const PolicyAuditRecordSchema=z.strictObject({version:z.literal(2),id:z.uuid(),actor:ActorSchema,environment:EnvironmentSchema,requestId:IdentifierSchema,operation:z.literal("tool.invoke"),toolId:IdentifierSchema,permission:PermissionSchema,approval:z.enum(["not-required","approved","denied"]),result:z.enum(["requested","authorized","denied","success","failed"]),inputHash:z.string().regex(/^[a-f0-9]{64}$/),resourceHash:z.string().regex(/^[a-f0-9]{64}$/),policyHash:z.string().regex(/^[a-f0-9]{64}$/),policyRevision:IdentifierSchema,reason:IdentifierSchema,controlEpoch:z.number().int().nonnegative(),risk:z.enum(["low","sensitive","critical"]),matchedRuleIds:z.array(IdentifierSchema).max(128),timestamp:z.iso.datetime()}).refine(v=>v.environment===v.actor.environment,"Audit environment mismatch");
export type PolicyAuditRecord=z.infer<typeof PolicyAuditRecordSchema>;
export interface PolicyAuditSink{append(record:PolicyAuditRecord):Promise<void>}
export const StoredAuditRecordSchema=z.union([AuditRecordSchema,PolicyAuditRecordSchema]);
export * from "./j09-contracts.js";
export * from "./j09-integrity.js";
export * from "./j09-redaction.js";
export * from "./j09-observability.js";
export * from "./j09-control.js";
