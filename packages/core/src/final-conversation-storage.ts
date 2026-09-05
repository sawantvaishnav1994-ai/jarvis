import { BoundaryError } from "@jarvis/shared";

export type J112StorageRecordKind = "conversation" | "message";

export type J112StorageRequest = {
    ownerId: string;
    actorId: string;
    requestId: string;
    recordId: string;
    kind: J112StorageRecordKind;
    payloadDigest: string;
    securityEpoch: number;
};

export type J112StorageAuthorityRequestResult =
    | {
          state: "PENDING_APPROVAL";
          requestId: string;
          approvalId: string;
          requestHash: string;
      }
    | {
          state: "AUTHORIZED";
          requestId: string;
          authorizationReference: string;
      };

export interface J112GovernedStorageAuthorityPort {
    request(
        input: J112StorageRequest,
    ): Promise<J112StorageAuthorityRequestResult>;
    authorize(input: {
        request: J112StorageRequest;
        approvalId: string;
        requestHash: string;
    }): Promise<{ requestId: string; authorizationReference: string }>;
    execute(input: {
        request: J112StorageRequest;
        authorizationReference: string;
    }): Promise<{ requestId: string; recordId: string; stored: boolean }>;
}

export type J112StorageLifecycleResult =
    | {
          state: "PENDING_APPROVAL";
          request: J112StorageRequest;
          approvalId: string;
          requestHash: string;
      }
    | {
          state: "STORED";
          request: J112StorageRequest;
          recordId: string;
      };

function validDigest(value: string): boolean {
    return /^[a-f0-9]{64}$/.test(value);
}

function assertRequest(request: J112StorageRequest): void {
    if (
        !request.ownerId ||
        !request.actorId ||
        request.actorId === request.ownerId ||
        !request.requestId ||
        !request.recordId ||
        !["conversation", "message"].includes(request.kind) ||
        !validDigest(request.payloadDigest) ||
        !Number.isSafeInteger(request.securityEpoch) ||
        request.securityEpoch < 0
    )
        throw new BoundaryError("J112_STORAGE_REQUEST_INVALID");
}

function assertRequestBinding(
    request: J112StorageRequest,
    requestId: string,
): void {
    if (requestId !== request.requestId)
        throw new BoundaryError("J112_STORAGE_REQUEST_BINDING_INVALID");
}

export class J112GovernedStorageLifecycle {
    constructor(private readonly authority: J112GovernedStorageAuthorityPort) {}

    private async execute(
        request: J112StorageRequest,
        authorizationReference: string,
    ): Promise<J112StorageLifecycleResult> {
        if (!authorizationReference)
            throw new BoundaryError("J112_STORAGE_AUTHORIZATION_INVALID");
        const result = await this.authority.execute({
            request,
            authorizationReference,
        });
        assertRequestBinding(request, result.requestId);
        if (!result.stored || result.recordId !== request.recordId)
            throw new BoundaryError("J112_STORAGE_EXECUTION_NOT_STORED");
        return { state: "STORED", request, recordId: result.recordId };
    }

    async request(
        request: J112StorageRequest,
    ): Promise<J112StorageLifecycleResult> {
        assertRequest(request);
        const result = await this.authority.request(request);
        assertRequestBinding(request, result.requestId);
        if (result.state === "PENDING_APPROVAL") {
            if (!result.approvalId || !result.requestHash)
                throw new BoundaryError("J112_STORAGE_APPROVAL_INVALID");
            return {
                state: "PENDING_APPROVAL",
                request,
                approvalId: result.approvalId,
                requestHash: result.requestHash,
            };
        }
        return this.execute(request, result.authorizationReference);
    }

    async resumeAfterOwnerDecision(input: {
        pending: Extract<
            J112StorageLifecycleResult,
            { state: "PENDING_APPROVAL" }
        >;
    }): Promise<J112StorageLifecycleResult> {
        assertRequest(input.pending.request);
        const authorized = await this.authority.authorize({
            request: input.pending.request,
            approvalId: input.pending.approvalId,
            requestHash: input.pending.requestHash,
        });
        assertRequestBinding(input.pending.request, authorized.requestId);
        return this.execute(
            input.pending.request,
            authorized.authorizationReference,
        );
    }
}
