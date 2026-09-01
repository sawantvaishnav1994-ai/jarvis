import { describe, it, expect, vi } from "vitest";
import { JarvisCore } from "@jarvis/core";
import { MemoryService, MemoryRecordSchema } from "@jarvis/memory";
import {
    MockModel,
    ModelRequestSchema,
    type ModelProvider,
    type ModelRequest,
} from "@jarvis/models";
import { TestMemoryRepository, owner, memory } from "../fixtures/foundation.js";
const request: ModelRequest = {
    version: 1,
    messages: [{ role: "user", content: "Synthetic hello" }],
    capabilities: ["text"],
    privacyLevel: "local-only",
    maxCost: 0,
    timeoutMs: 1000,
};
const signal = () => new AbortController().signal;
describe("provider-independent contracts", () => {
    it("changes model providers while preserving owner, project and memory", async () => {
        const repository = new TestMemoryRepository();
        const service = new MemoryService(repository);
        const record = memory();
        await service.remember(owner, record);
        for (const id of ["mock-a", "mock-b"]) {
            const core = new JarvisCore(new MockModel(id), service);
            expect(
                (await core.generate(owner, request, signal())).provider,
            ).toBe(id);
            expect(await core.recall(owner, record.projectId)).toEqual([
                record,
            ]);
        }
    });
    it("blocks private context before calling a cloud provider", async () => {
        const generate = vi.fn();
        const core = new JarvisCore(
            { id: "external", local: false, generate },
            new MemoryService(new TestMemoryRepository()),
        );
        await expect(core.generate(owner, request, signal())).rejects.toThrow(
            "MODEL_PRIVACY_DENIED",
        );
        expect(generate).not.toHaveBeenCalled();
    });
    it("handles provider outage and refuses inconsistent cost or identity", async () => {
        for (const generate of [
            async () => {
                throw new Error("offline");
            },
            async () => ({
                version: 1 as const,
                provider: "other",
                text: "x",
                cost: 0,
            }),
            async () => ({
                version: 1 as const,
                provider: "mock",
                text: "x",
                cost: 1,
            }),
        ]) {
            const provider: ModelProvider = {
                id: "mock",
                local: true,
                generate,
            };
            await expect(
                new JarvisCore(
                    provider,
                    new MemoryService(new TestMemoryRepository()),
                ).generate(owner, request, signal()),
            ).rejects.toThrow();
        }
    });
    it("bounds waiting even when an adapter ignores cancellation", async () => {
        let observed: AbortSignal | undefined;
        const provider: ModelProvider = {
            id: "stuck",
            local: true,
            generate: async (_r, s) => {
                observed = s;
                return new Promise(() => {});
            },
        };
        await expect(
            new JarvisCore(
                provider,
                new MemoryService(new TestMemoryRepository()),
            ).generate(owner, { ...request, timeoutMs: 20 }, signal()),
        ).rejects.toThrow("MODEL_CANCELLED");
        expect(observed?.aborted).toBe(true);
    });
    it("refuses unknown contract versions and never-store persistence", async () => {
        expect(() =>
            ModelRequestSchema.parse({ ...request, version: 2 }),
        ).toThrow();
        expect(() =>
            MemoryRecordSchema.parse(memory({ retention: "temporary" })),
        ).toThrow();
        await expect(
            new MemoryService(new TestMemoryRepository()).remember(
                owner,
                memory({ retention: "never-store" }),
            ),
        ).rejects.toThrow("MEMORY_DENIED");
    });
    it("separates owners and projects and filters expired temporary memory", async () => {
        const service = new MemoryService(new TestMemoryRepository());
        await service.remember(owner, memory());
        await service.remember(
            owner,
            memory({
                retention: "temporary",
                expiresAt: "2020-01-01T00:00:00.000Z",
            }),
        );
        expect(
            await service.recall(
                { ...owner, id: "different-owner" },
                "project-test",
            ),
        ).toEqual([]);
        expect(await service.recall(owner, "different-project")).toEqual([]);
        expect(await service.recall(owner, "project-test")).toHaveLength(1);
        await expect(
            service.remember({ ...owner, kind: "agent" }, memory()),
        ).rejects.toThrow("MEMORY_DENIED");
    });
});
