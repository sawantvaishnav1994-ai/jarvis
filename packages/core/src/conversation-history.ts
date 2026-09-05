import { createHash } from "node:crypto";
import { BoundaryError } from "@jarvis/shared";
import type { J14TurnPipelineInput, J14TurnPipelineResult } from "./turn-pipeline.js";

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digestPattern = /^[a-f0-9]{64}$/;

export type ConversationHistoryState = "ACTIVE" | "ARCHIVED";
export type ConversationHistoryRole = "user" | "assistant" | "system" | "tool";
export type ConversationTerminalState =
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | "REVOKED"
    | "TIMED_OUT"
    | "SAFE_MODE_BLOCKED"
    | "EMERGENCY_STOPPED";

export type ConversationHistoryCursor = {
    updatedAt: string;
    conversationId: string;
};

export type ConversationHistoryConversation = {
    ownerId: string;
    conversationId: string;
    projectId: string | null;
    securityEpoch: number;
    state: ConversationHistoryState;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    version: number;
};

export type ConversationHistoryMessage = {
    ownerId: string;
    messageId: string;
    conversationId: string;
    turnId: string | null;
    role: ConversationHistoryRole;
    ordinal: number;
    contentDigest: string;
    createdAt: string;
};

export type ConversationTurnResult = {
    ownerId: string;
    turnId: string;
    responseMessageId: string | null;
    terminalState: ConversationTerminalState;
    inputDigest: string;
    contextDigest: string | null;
    modelDigest: string | null;
    responseDigest: string | null;
    completedAt: string;
};

export interface ConversationHistoryRepository {
    registerConversation(input: {
        ownerId: string;
        conversationId: string;
        projectId: string | null;
        securityEpoch: number;
    }): Promise<ConversationHistoryConversation>;
    archiveConversation(
        ownerId: string,
        conversationId: string,
        expectedVersion: number,
    ): Promise<ConversationHistoryConversation>;
    appendMessage(input: {
        ownerId: string;
        messageId: string;
        conversationId: string;
        turnId: string | null;
        role: ConversationHistoryRole;
        contentDigest: string;
    }): Promise<ConversationHistoryMessage>;
    listConversations(input: {
        ownerId: string;
        limit: number;
        cursor: ConversationHistoryCursor | null;
        includeArchived: boolean;
    }): Promise<ConversationHistoryConversation[]>;
    listMessages(input: {
        ownerId: string;
        conversationId: string;
        afterOrdinal: number;
        limit: number;
    }): Promise<ConversationHistoryMessage[]>;
    persistTurnResult(
        result: Omit<ConversationTurnResult, "completedAt">,
    ): Promise<ConversationTurnResult>;
    getTurnResult(
        ownerId: string,
        turnId: string,
    ): Promise<ConversationTurnResult | null>;
}

function invalid(): never {
    throw new BoundaryError("J15_HISTORY_INPUT_INVALID");
}
function requireId(value: unknown): string {
    if (typeof value !== "string" || !idPattern.test(value)) invalid();
    return value;
}
function requireUuid(value: unknown): string {
    if (typeof value !== "string" || !uuidPattern.test(value)) invalid();
    return value;
}
function requireNullableUuid(value: unknown): string | null {
    return value === null ? null : requireUuid(value);
}
function requireDigest(value: unknown): string {
    if (typeof value !== "string" || !digestPattern.test(value)) invalid();
    return value;
}
function requireNullableDigest(value: unknown): string | null {
    return value === null ? null : requireDigest(value);
}
function requireEpoch(value: unknown): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
        invalid();
    return value;
}
function requireLimit(value: unknown): number {
    if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > 200
    )
        invalid();
    return value;
}
function requireOrdinal(value: unknown): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
        invalid();
    return value;
}

export function historyDigest(content: string): string {
    if (typeof content !== "string") invalid();
    return createHash("sha256").update(content, "utf8").digest("hex");
}

export class ConversationHistoryService {
    constructor(private readonly repository: ConversationHistoryRepository) {}

    registerConversation(input: {
        ownerId: string;
        conversationId: string;
        projectId?: string | null;
        securityEpoch: number;
    }) {
        return this.repository.registerConversation({
            ownerId: requireId(input.ownerId),
            conversationId: requireUuid(input.conversationId),
            projectId:
                input.projectId == null ? null : requireId(input.projectId),
            securityEpoch: requireEpoch(input.securityEpoch),
        });
    }

    archiveConversation(input: {
        ownerId: string;
        conversationId: string;
        expectedVersion: number;
    }) {
        if (
            !Number.isInteger(input.expectedVersion) ||
            input.expectedVersion < 1
        )
            invalid();
        return this.repository.archiveConversation(
            requireId(input.ownerId),
            requireUuid(input.conversationId),
            input.expectedVersion,
        );
    }

    appendMessage(input: {
        ownerId: string;
        messageId: string;
        conversationId: string;
        turnId?: string | null;
        role: ConversationHistoryRole;
        content: string;
    }) {
        if (!["user", "assistant", "system", "tool"].includes(input.role))
            invalid();
        return this.repository.appendMessage({
            ownerId: requireId(input.ownerId),
            messageId: requireUuid(input.messageId),
            conversationId: requireUuid(input.conversationId),
            turnId: requireNullableUuid(input.turnId ?? null),
            role: input.role,
            contentDigest: historyDigest(input.content),
        });
    }

    listConversations(input: {
        ownerId: string;
        limit?: number;
        cursor?: ConversationHistoryCursor | null;
        includeArchived?: boolean;
    }) {
        const cursor = input.cursor ?? null;
        if (
            cursor &&
            (Number.isNaN(Date.parse(cursor.updatedAt)) ||
                !uuidPattern.test(cursor.conversationId))
        )
            invalid();
        return this.repository.listConversations({
            ownerId: requireId(input.ownerId),
            limit: requireLimit(input.limit ?? 50),
            cursor,
            includeArchived: input.includeArchived ?? false,
        });
    }

    listMessages(input: {
        ownerId: string;
        conversationId: string;
        afterOrdinal?: number;
        limit?: number;
    }) {
        return this.repository.listMessages({
            ownerId: requireId(input.ownerId),
            conversationId: requireUuid(input.conversationId),
            afterOrdinal: requireOrdinal(input.afterOrdinal ?? 0),
            limit: requireLimit(input.limit ?? 100),
        });
    }

    persistTurnResult(input: {
        ownerId: string;
        turnId: string;
        responseMessageId?: string | null;
        terminalState: ConversationTerminalState;
        inputDigest: string;
        contextDigest?: string | null;
        modelDigest?: string | null;
        responseDigest?: string | null;
    }) {
        const terminalStates: ConversationTerminalState[] = [
            "COMPLETED",
            "FAILED",
            "CANCELLED",
            "REVOKED",
            "TIMED_OUT",
            "SAFE_MODE_BLOCKED",
            "EMERGENCY_STOPPED",
        ];
        if (!terminalStates.includes(input.terminalState)) invalid();
        return this.repository.persistTurnResult({
            ownerId: requireId(input.ownerId),
            turnId: requireUuid(input.turnId),
            responseMessageId: requireNullableUuid(
                input.responseMessageId ?? null,
            ),
            terminalState: input.terminalState,
            inputDigest: requireDigest(input.inputDigest),
            contextDigest: requireNullableDigest(input.contextDigest ?? null),
            modelDigest: requireNullableDigest(input.modelDigest ?? null),
            responseDigest: requireNullableDigest(input.responseDigest ?? null),
        });
    }

    persistPipelineResult(input: {
        ownerId: string;
        pipelineInput: J14TurnPipelineInput;
        pipelineResult: J14TurnPipelineResult;
        responseMessageId?: string | null;
    }) {
        const ownerId = requireId(input.ownerId);
        if (
            input.pipelineInput.authority.ownerId !== ownerId ||
            input.pipelineResult.turnId !== input.pipelineInput.turnId ||
            input.pipelineResult.conversationId !==
                input.pipelineInput.conversationId
        )
            throw new BoundaryError("J15_PIPELINE_BINDING_INVALID");
        return this.persistTurnResult({
            ownerId,
            turnId: input.pipelineResult.turnId,
            responseMessageId: input.responseMessageId ?? null,
            terminalState: input.pipelineResult.state,
            inputDigest: input.pipelineInput.inputDigest,
            contextDigest: input.pipelineInput.contextDigest,
            modelDigest: input.pipelineInput.modelOperationDigest,
            responseDigest:
                input.pipelineResult.response === null
                    ? null
                    : historyDigest(input.pipelineResult.response),
        });
    }

    getTurnResult(ownerId: string, turnId: string) {
        return this.repository.getTurnResult(
            requireId(ownerId),
            requireUuid(turnId),
        );
    }
}
