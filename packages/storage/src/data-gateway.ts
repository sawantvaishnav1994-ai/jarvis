import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
    BoundaryError,
    DataClassSchema,
    StorageRecordSchema,
} from "@jarvis/shared";
import { canonical, digest } from "@jarvis/identity";
import {
    consumeExecutionPermit,
    minimizeExternalContext,
    type ProtectedToolCatalog,
    type ActionRequestV3,
    type AuthorizationV3,
    type RiskFactors,
} from "@jarvis/security";
import { currentDataTransaction } from "./transaction.js";
import { PrivateRecords } from "./private-records.js";
import { DataKeys } from "./data-keys.js";
import { PrivateObjects, ObjectUploadSchema } from "./private-objects.js";
import { PortableExports } from "./exports.js";
import { StorageRecovery } from "./recovery.js";
import { StorageHealthService } from "./storage-health.js";
import { ObjectDeletion } from "./object-deletion.js";
import { SecretHandleExecutor, SecretUseReceiptSchema } from "./secret-executor.js";
import { GovernedMigrations } from "./governed-migrations.js";

export const DataRequestInputSchema = z.strictObject({
    recordId: z.uuid().nullable(),
    classification: DataClassSchema,
    payloadHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
});
const operations = {
    "data.migration.execute": { capability: "storage.migration.execute", permission: "P4" },
    "data.attachment.reconcile": { capability: "data.write", permission: "P4" },
    "data.secret.use": { capability: "secrets.handle.use", permission: "P4" },
    "data.record.put": { capability: "data.write", permission: "P3" },
    "data.record.read": { capability: "data.read", permission: "P0" },
    "data.record.forget": { capability: "data.delete", permission: "P4" },
    "data.retention.change": { capability: "data.retention.modify", permission: "P4" },
    "data.retention.plan": { capability: "data.read", permission: "P0" },
    "data.retention.execute": { capability: "data.delete", permission: "P4" },
    "data.inventory": { capability: "data.inventory", permission: "P0" },
    "data.health": { capability: "storage.health.read", permission: "P0" },
    "data.lineage": { capability: "data.read", permission: "P0" },
    "data.object.put": { capability: "storage.object.write", permission: "P3" },
    "data.object.get": { capability: "storage.object.read", permission: "P0" },
    "data.object.forget": { capability: "data.delete", permission: "P4" },
    "data.deletion.purge": { capability: "data.delete", permission: "P4" },
    "data.keys.rotate": { capability: "storage.keys.rotate", permission: "P4" },
    "data.export": { capability: "data.export", permission: "P4" },
    "data.backup.create": {
        capability: "storage.backup.create",
        permission: "P4",
    },
    "data.backup.restore": {
        capability: "storage.backup.restore",
        permission: "P4",
    },
    "data.migration.probe": {
        capability: "storage.migration.execute",
        permission: "P4",
    },
    "data.context.prepare": {
        capability: "data.context.prepare",
        permission: "P4",
    },
} as const;
/** Trusted adapter. Only J0.3 can mint the one-shot permit, before this transaction-bound call. */
export class PrivateDataGateway implements ProtectedToolCatalog {
    constructor(
        private readonly records: PrivateRecords,
        private readonly fallback: ProtectedToolCatalog,
        private readonly services?: {
            keys: DataKeys;
            objects: PrivateObjects;
            exports: PortableExports;
            recovery: StorageRecovery;
            health?: StorageHealthService;
            secretExecutor?: SecretHandleExecutor;
            migrations?: GovernedMigrations;
        },
    ) {}
    describe(request: ActionRequestV3) {
        if (!request.toolId.startsWith("data."))
            return this.fallback.describe(request);
        const operation = operations[request.toolId as keyof typeof operations],
            input = DataRequestInputSchema.parse(request.input);
        if (
            !operation ||
            request.environment !== "development" ||
            request.resource !== "owner-data" ||
            input.classification === "D5"
        )
            throw new BoundaryError("DATA_TOOL_SCOPE_DENIED");
        const level = Number(input.classification.slice(1));
        if (
            ([
                "data.migration.execute",
                "data.attachment.reconcile",
                "data.secret.use",
                "data.keys.rotate",
                "data.export",
                "data.backup.create",
                "data.backup.restore",
                "data.migration.probe",
                "data.deletion.purge",
                "data.retention.change",
                "data.retention.plan",
                "data.retention.execute",
            ].includes(request.toolId) &&
                level !== 4) ||
            (request.toolId === "data.inventory" && level < 2) ||
            (request.toolId === "data.health" && level !== 4)
        )
            throw new BoundaryError("DATA_ZONE_UNDERSTATED");
        const factors: RiskFactors = {
            permission: operation.permission,
            reversibility: [
                "data.migration.execute",
                "data.record.forget",
                "data.object.forget",
                "data.deletion.purge",
                "data.retention.execute",
            ].includes(request.toolId)
                ? "IRREVERSIBLE"
                : "REVERSIBLE",
            blastRadius: "record",
            financialMinor: 0,
            privacy: level,
            security: 0,
            physical: 0,
            production: false,
            volume: 1,
            resourceCount: 1,
            identityTrust: "restricted",
            assurance: "A1",
            novelty: false,
            unusual: false,
            confidence: 1,
            verified: true,
            simulated: true,
            testsPassed: true,
            scanPassed: true,
            environment: "development",
            fromZone: "Z2",
            toZone: `Z${level}` as RiskFactors["toZone"],
            external: false,
            network: false,
        };
        return { capability: operation.capability, factors };
    }
    async execute(
        request: ActionRequestV3,
        authorization: AuthorizationV3,
        permit: object,
        transient?: unknown,
    ): Promise<unknown> {
        if (!request.toolId.startsWith("data."))
            return this.fallback.execute(
                request,
                authorization,
                permit,
                transient,
            );
        if (!consumeExecutionPermit(permit, request, authorization))
            throw new BoundaryError("DIRECT_DATA_BYPASS_DENIED");
        this.describe(request);
        const input = DataRequestInputSchema.parse(request.input);
        if (
            (input.payloadHash !== null &&
                (transient === undefined ||
                    digest(canonical(transient)) !== input.payloadHash)) ||
            (input.payloadHash === null && transient !== undefined)
        )
            throw new BoundaryError("DATA_PAYLOAD_BINDING_INVALID");
        const tx = currentDataTransaction();
        await tx.query("SAVEPOINT private_data_operation");
        try {
            let value: unknown;
            if (
                [
                    "data.object.put",
                    "data.object.get",
                    "data.object.forget",
                    "data.deletion.purge",
                    "data.keys.rotate",
                    "data.export",
                    "data.backup.create",
                    "data.backup.restore",
                    "data.migration.probe",
                ].includes(request.toolId)
            ) {
                if (!this.services)
                    throw new BoundaryError("DATA_SERVICE_UNAVAILABLE");
                const s = this.services;
                switch (request.toolId) {
                    case "data.object.put": {
                        const upload = ObjectUploadSchema.parse(transient);
                        if (
                            upload.id !== input.recordId ||
                            upload.policy.classification !==
                                input.classification
                        )
                            throw new BoundaryError(
                                "DATA_CLASS_OR_ID_MISMATCH",
                            );
                        if (
                            upload.policy.retention.mode !== "never-store" &&
                            upload.policy.retention.mode !== "session"
                        )
                            await s.keys.initialize(authorization.ownerId);
                        value = await s.objects.put(authorization, upload);
                        break;
                    }
                    case "data.object.get":
                        if (!input.recordId)
                            throw new BoundaryError("DATA_RECORD_REQUIRED");
                        value = await s.objects.get(
                            authorization,
                            input.recordId,
                            input.classification,
                        );
                        break;
                    case "data.keys.rotate":
                        value = await s.keys.rotate(authorization);
                        break;
                    case "data.object.forget":
                    case "data.deletion.purge": {
                        if (!input.recordId)
                            throw new BoundaryError("DATA_RECORD_REQUIRED");
                        const deletion = new ObjectDeletion(s.objects.store);
                        value =
                            request.toolId === "data.object.forget"
                                ? await deletion.request(
                                      authorization,
                                      input.recordId,
                                  )
                                : await deletion.purge(
                                      authorization,
                                      input.recordId,
                                  );
                        break;
                    }
                    case "data.export":
                        value = await s.exports.create(authorization);
                        break;
                    case "data.backup.create":
                        value = await s.recovery.create(authorization);
                        break;
                    case "data.backup.restore":
                    case "data.migration.probe":
                        if (!input.recordId)
                            throw new BoundaryError("BACKUP_REQUIRED");
                        value =
                            request.toolId === "data.backup.restore"
                                ? await s.recovery.restore(
                                      authorization,
                                      input.recordId,
                                  )
                                : await s.recovery.destructiveProbe(
                                      authorization,
                                      input.recordId,
                                  );
                        break;
                }
            } else if (request.toolId === "data.migration.execute") {
                if (input.recordId !== null || !this.services?.migrations) throw new BoundaryError("MIGRATION_EXECUTOR_UNAVAILABLE");
                value = await this.services.migrations.execute(authorization, transient);
            } else if (request.toolId === "data.attachment.reconcile") {
                if (!input.recordId || transient !== undefined) throw new BoundaryError("ATTACHMENT_INPUT_INVALID");
                value = await this.records.reconcileAttachment(authorization, input.recordId);
            } else if (request.toolId === "data.secret.use") {
                if (input.recordId !== null || !this.services?.secretExecutor)
                    throw new BoundaryError("SECRET_EXECUTOR_UNAVAILABLE");
                value = await this.services.secretExecutor.execute(authorization, transient);
            } else if (request.toolId.startsWith("data.retention.")) {
                if (!input.recordId)
                    throw new BoundaryError("DATA_RECORD_REQUIRED");
                if (request.toolId === "data.retention.plan") {
                    if (transient !== undefined)
                        throw new BoundaryError("RETENTION_PLAN_INPUT_INVALID");
                    value = await this.records.planRetention(authorization, input.recordId);
                } else if (request.toolId === "data.retention.change")
                    value = await this.records.changeRetention(authorization, input.recordId, transient);
                else
                    value = await this.records.executeRetention(authorization, input.recordId, transient);
            } else if (request.toolId === "data.health") {
                if (!this.services?.health)
                    throw new BoundaryError("DATA_SERVICE_UNAVAILABLE");
                value = await this.services.health.inspect(
                    authorization.ownerId,
                );
            } else if (request.toolId === "data.record.put") {
                const record = StorageRecordSchema.parse(transient);
                if (
                    record.id !== input.recordId ||
                    record.policy.classification !== input.classification
                )
                    throw new BoundaryError("DATA_CLASS_OR_ID_MISMATCH");
                if (
                    record.retention.mode !== "NEVER_STORE" &&
                    record.retention.mode !== "DELETE_AFTER_SESSION" &&
                    record.policy.retention.mode !== "never-store" &&
                    record.policy.retention.mode !== "session"
                ) {
                    if (!this.services?.keys)
                        throw new BoundaryError("DATA_SERVICE_UNAVAILABLE");
                    await this.services.keys.initialize(authorization.ownerId);
                }
                value = await this.records.put(authorization, record);
            } else if (request.toolId === "data.inventory")
                value = await this.records.inventory(authorization.ownerId);
            else if (request.toolId === "data.context.prepare") {
                const v = z
                    .strictObject({
                        ids: z.array(z.uuid()).min(1).max(20),
                        provider: z.string().min(1),
                        region: z.string().min(1),
                        limit: z.number().int().min(0).max(16000),
                    })
                    .parse(transient);
                const items = [];
                for (const id of v.ids) {
                    const row = await this.records.catalog(
                        authorization.ownerId,
                        id,
                    );
                    if (
                        Number(row.data_class.slice(1)) >
                        Number(input.classification.slice(1))
                    )
                        throw new BoundaryError("DATA_ZONE_UNDERSTATED");
                    const record = await this.records.read(
                        authorization.ownerId,
                        id,
                    );
                    items.push({
                        id,
                        classification: record.policy.classification,
                        policy:
                            record.policy.privacy === "ai-allow" &&
                            record.policy.consent.externalAI
                                ? record.external
                                : {
                                      ...record.external,
                                      mode: "NEVER_EXTERNAL" as const,
                                  },
                        fields: Object.fromEntries(
                            Object.entries(record.payload).filter(
                                ([, v]) => typeof v === "string",
                            ),
                        ),
                    });
                }
                value = minimizeExternalContext(
                    items,
                    v.provider,
                    v.region,
                    v.ids,
                    v.limit,
                );
            } else {
                if (!input.recordId)
                    throw new BoundaryError("DATA_RECORD_REQUIRED");
                const c = await this.records.catalog(
                    authorization.ownerId,
                    input.recordId,
                );
                // Check the stored classification before decrypting; client labels cannot lower risk.
                if (
                    request.toolId === "data.record.forget"
                        ? Number(c.data_class.slice(1)) >
                          Number(input.classification.slice(1))
                        : c.data_class !== input.classification
                )
                    throw new BoundaryError("DATA_ZONE_UNDERSTATED");
                if (request.toolId === "data.record.read")
                    value = await this.records.read(
                        authorization.ownerId,
                        input.recordId,
                    );
                else if (request.toolId === "data.lineage")
                    value = await this.records.lineage(
                        authorization.ownerId,
                        input.recordId,
                    );
                else if (request.toolId === "data.record.forget") {
                    if (
                        !authorization.approvalId ||
                        authorization.assurance !== "A3"
                    )
                        throw new BoundaryError(
                            "OWNER_DELETE_APPROVAL_REQUIRED",
                        );
                    value = await this.records.forget(
                        authorization,
                        input.recordId,
                    );
                } else throw new BoundaryError("DATA_TOOL_DENIED");
            }
            await tx.query(
                "INSERT INTO security.data_access_events(id,record) VALUES($1,$2)",
                [
                    randomUUID(),
                    JSON.stringify({
                        version: 1,
                        actorId: authorization.actorId,
                        ownerId: authorization.ownerId,
                        capability: authorization.capability,
                        resource: input.recordId,
                        requestId: request.id,
                        authorizationId: authorization.id,
                        policyVersions: authorization.policyVersions,
                        operation: request.toolId,
                        timestamp: Date.now(),
                        result: "success",
                    }),
                ],
            );
            await tx.query("RELEASE SAVEPOINT private_data_operation");
            return { version: 1, verified: true, requestId: request.id, value };
        } catch (error) {
            await tx.query("ROLLBACK TO SAVEPOINT private_data_operation");
            await tx.query("RELEASE SAVEPOINT private_data_operation");
            const sqlState =
                error instanceof Error &&
                "code" in error &&
                typeof error.code === "string" &&
                /^[0-9A-Z]{5}$/.test(error.code)
                    ? error.code
                    : null;
            await tx.query(
                "INSERT INTO security.data_access_events(id,record) VALUES($1,$2)",
                [
                    randomUUID(),
                    JSON.stringify({
                        version: 1,
                        actorId: authorization.actorId,
                        ownerId: authorization.ownerId,
                        capability: authorization.capability,
                        resource: input.recordId,
                        requestId: request.id,
                        authorizationId: authorization.id,
                        policyVersions: authorization.policyVersions,
                        operation: request.toolId,
                        timestamp: Date.now(),
                        result: "denied",
                        reason:
                            error instanceof BoundaryError
                                ? error.code
                                : error instanceof z.ZodError
                                  ? "STORAGE_CONTRACT_INVALID"
                                  : sqlState
                                    ? `POSTGRES_${sqlState}`
                                    : "STORAGE_OPERATION_FAILED",
                    }),
                ],
            );
            throw error;
        }
    }
    verify(request: ActionRequestV3, result: unknown) {
        if (!request.toolId.startsWith("data."))
            return this.fallback.verify(request, result);
        if (request.toolId === "data.secret.use" &&
            !SecretUseReceiptSchema.safeParse((result as { value?: unknown })?.value).success)
            return false;
        return z
            .strictObject({
                version: z.literal(1),
                verified: z.literal(true),
                requestId: z.literal(request.id),
                value: z.unknown(),
            })
            .safeParse(result).success;
    }
}
