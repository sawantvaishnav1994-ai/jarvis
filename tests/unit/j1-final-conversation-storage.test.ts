import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
    J112GovernedStorageLifecycle,
    type J112GovernedStorageAuthorityPort,
    type J112StorageRequest,
} from "@jarvis/core";

const request: J112StorageRequest = {
    ownerId: "owner-test",
    actorId: "service-conversation-writer",
    requestId: "request-j112-storage",
    recordId: "11111111-1111-4111-8111-111111111111",
    kind: "conversation",
    payloadDigest: createHash("sha256").update("payload").digest("hex"),
    securityEpoch: 4,
};

function authority(): J112GovernedStorageAuthorityPort {
    return {
        request: vi.fn(async (input) => ({
            state: "PENDING_APPROVAL" as const,
            requestId: input.requestId,
            approvalId: "approval-j112-storage",
            requestHash: createHash("sha256")
                .update(input.requestId)
                .digest("hex"),
        })),
        authorize: vi.fn(async (input) => ({
            requestId: input.request.requestId,
            authorizationReference: "authorization-j112-storage",
        })),
        execute: vi.fn(async (input) => ({
            requestId: input.request.requestId,
            recordId: input.request.recordId,
            stored: true,
        })),
    };
}

describe("J1.12 governed storage approval lifecycle", () => {
    it("returns an exact pending approval without any execution", async () => {
        const port = authority();
        const lifecycle = new J112GovernedStorageLifecycle(port);
        const pending = await lifecycle.request(request);
        expect(pending.state).toBe("PENDING_APPROVAL");
        expect(port.authorize).not.toHaveBeenCalled();
        expect(port.execute).not.toHaveBeenCalled();
    });

    it("resumes only after external owner decision and executes the exact request", async () => {
        const port = authority();
        const lifecycle = new J112GovernedStorageLifecycle(port);
        const pending = await lifecycle.request(request);
        if (pending.state !== "PENDING_APPROVAL")
            throw new Error("pending approval expected");
        const stored = await lifecycle.resumeAfterOwnerDecision({ pending });
        expect(stored.state).toBe("STORED");
        expect(port.authorize).toHaveBeenCalledWith({
            request,
            approvalId: pending.approvalId,
            requestHash: pending.requestHash,
        });
        expect(port.execute).toHaveBeenCalledTimes(1);
    });

    it("rejects owner self-request before contacting J0 authority", async () => {
        const port = authority();
        const lifecycle = new J112GovernedStorageLifecycle(port);
        await expect(
            lifecycle.request({ ...request, actorId: request.ownerId }),
        ).rejects.toThrow("J112_STORAGE_REQUEST_INVALID");
        expect(port.request).not.toHaveBeenCalled();
    });

    it("fails closed on cross-request authorization binding mutation", async () => {
        const port = authority();
        vi.mocked(port.authorize).mockResolvedValueOnce({
            requestId: "request-attacker",
            authorizationReference: "authorization-attacker",
        });
        const lifecycle = new J112GovernedStorageLifecycle(port);
        const pending = await lifecycle.request(request);
        if (pending.state !== "PENDING_APPROVAL")
            throw new Error("pending approval expected");
        await expect(
            lifecycle.resumeAfterOwnerDecision({ pending }),
        ).rejects.toThrow("J112_STORAGE_REQUEST_BINDING_INVALID");
        expect(port.execute).not.toHaveBeenCalled();
    });

    it("fails closed when J0 execution does not confirm the exact stored record", async () => {
        const port = authority();
        vi.mocked(port.request).mockResolvedValueOnce({
            state: "AUTHORIZED",
            requestId: request.requestId,
            authorizationReference: "authorization-direct",
        });
        vi.mocked(port.execute).mockResolvedValueOnce({
            requestId: request.requestId,
            recordId: "22222222-2222-4222-8222-222222222222",
            stored: true,
        });
        const lifecycle = new J112GovernedStorageLifecycle(port);
        await expect(lifecycle.request(request)).rejects.toThrow(
            "J112_STORAGE_EXECUTION_NOT_STORED",
        );
    });
});
