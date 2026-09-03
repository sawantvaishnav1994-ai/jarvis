import type { ToolStateSchema } from "./j07-contracts.js";
import type { z } from "zod";
type ToolState=z.infer<typeof ToolStateSchema>;
export type DurableToolReservation={status:"RESERVED"|"EXISTING";executionId?:string;state?:string};
export type DurableToolReserveInput={idempotencyKey:string;requestHash:string;toolId:string;toolVersion:number;operation:string};
export type DurableToolCompletion={idempotencyKey?:string;executionId:string;requestId:string;correlationId:string;toolId:string;toolVersion:number;operation:string;actorId:string;source:string;inputHash:string;authorizationReference?:string;approvalReference?:string;state:ToolState;attemptCount:number;verified:boolean;startedAt:string;completedAt:string};
export interface DurableToolEvidencePort{reserve(input:DurableToolReserveInput):Promise<DurableToolReservation>;complete(input:DurableToolCompletion):Promise<void>;}
