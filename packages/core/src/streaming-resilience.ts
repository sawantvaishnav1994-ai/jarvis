import type { ContextAssemblyAuthority } from "./context-assembly.js";
import type {
    J14ResponseEvent,
    J14TurnPipelineResult,
} from "./turn-pipeline.js";

export interface J110StreamCursor {
    ownerId: string;
    projectId?: string | null;
    conversationId: string;
    sessionId: string;
    turnId: string;
    securityEpoch: number;
    afterSequence: number;
}

export interface J110StreamAuthorityCheck {
    valid: boolean;
    reason:
        | "OK"
        | "INVALID"
        | "REVOKED"
        | "SECURITY_EPOCH_CHANGED"
        | "SAFE_MODE"
        | "FREEZE"
        | "SHUTDOWN";
}

export interface J110StreamAuthorityPort {
    verify(
        authority: ContextAssemblyAuthority,
    ): Promise<J110StreamAuthorityCheck>;
}

export interface J110StreamSnapshot {
    authority: ContextAssemblyAuthority;
    events: readonly J14ResponseEvent[];
    terminal: J14TurnPipelineResult["state"] | null;
}

export interface J110StreamStorePort {
    read(
        authority: ContextAssemblyAuthority,
    ): Promise<J110StreamSnapshot | null>;
}

export interface J110ResumeResult {
    events: readonly J14ResponseEvent[];
    nextSequence: number;
    terminal: J14TurnPipelineResult["state"] | null;
    replayedProtectedSideEffects: false;
}

export class J110StreamingResilienceError extends Error {
    constructor(readonly code: string) {
        super(code);
        this.name = "J110StreamingResilienceError";
    }
}

function sameProject(a?: string | null, b?: string | null): boolean {
    return (a ?? null) === (b ?? null);
}

function sameAuthority(
    a: ContextAssemblyAuthority,
    b: ContextAssemblyAuthority,
): boolean {
    return (
        a.ownerId === b.ownerId &&
        sameProject(a.projectId, b.projectId) &&
        a.conversationId === b.conversationId &&
        a.sessionId === b.sessionId &&
        a.turnId === b.turnId &&
        a.securityEpoch === b.securityEpoch
    );
}

export class J110StreamingResilienceCoordinator {
    constructor(
        private readonly authority: J110StreamAuthorityPort,
        private readonly store: J110StreamStorePort,
    ) {}

    async resume(
        trusted: ContextAssemblyAuthority,
        cursor: J110StreamCursor,
        signal: AbortSignal,
    ): Promise<J110ResumeResult> {
        if (signal.aborted)
            throw new J110StreamingResilienceError("J110_CANCELLED");
        if (
            cursor.ownerId !== trusted.ownerId ||
            !sameProject(cursor.projectId, trusted.projectId) ||
            cursor.conversationId !== trusted.conversationId ||
            cursor.sessionId !== trusted.sessionId ||
            cursor.turnId !== trusted.turnId ||
            cursor.securityEpoch !== trusted.securityEpoch ||
            !Number.isSafeInteger(cursor.afterSequence) ||
            cursor.afterSequence < -1
        )
            throw new J110StreamingResilienceError(
                "J110_CURSOR_BINDING_INVALID",
            );

        const check = await this.authority.verify(trusted);
        if (!check.valid || check.reason !== "OK")
            throw new J110StreamingResilienceError(
                `J110_AUTHORITY_${check.reason}`,
            );
        if (signal.aborted)
            throw new J110StreamingResilienceError("J110_CANCELLED");

        const snapshot = await this.store.read(trusted);
        if (!snapshot)
            throw new J110StreamingResilienceError("J110_STREAM_NOT_FOUND");
        if (!sameAuthority(snapshot.authority, trusted))
            throw new J110StreamingResilienceError(
                "J110_STREAM_BINDING_INVALID",
            );

        let expected = 0;
        for (const event of snapshot.events) {
            if (event.sequence !== expected)
                throw new J110StreamingResilienceError("J110_SEQUENCE_INVALID");
            expected += 1;
        }

        const events = snapshot.events.filter(
            (event) => event.sequence > cursor.afterSequence,
        );
        return {
            events,
            nextSequence: expected,
            terminal: snapshot.terminal,
            replayedProtectedSideEffects: false,
        };
    }
}
