import { z } from "zod";
import { ActorSchema } from "@jarvis/identity";
import { PermissionSchema } from "@jarvis/security";
import {
    ContractVersionSchema,
    IdentifierSchema,
    EnvironmentSchema,
} from "@jarvis/shared";
export const AuditRecordSchema = z
    .strictObject({
        version: ContractVersionSchema,
        id: z.uuid(),
        actor: ActorSchema,
        environment: EnvironmentSchema,
        requestId: IdentifierSchema,
        operation: IdentifierSchema,
        toolId: IdentifierSchema,
        permission: PermissionSchema,
        approval: z.enum(["not-required", "approved", "denied"]),
        result: z.enum(["requested", "denied", "success", "failed"]),
        inputHash: z.string().regex(/^[a-f0-9]{64}$/),
        timestamp: z.iso.datetime(),
    })
    .refine(
        (v) => v.environment === v.actor.environment,
        "Audit environment mismatch",
    );
export type AuditRecord = z.infer<typeof AuditRecordSchema>;
export interface AuditSink {
    append(record: AuditRecord): Promise<void>;
}
