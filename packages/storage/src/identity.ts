import type pg from "pg";
import {
    emptyIdentityState,
    type IdentityRepository,
    type IdentityState,
    type SecurityEvent,
    type OwnerProfile,
} from "@jarvis/identity";
import { RecordCipher } from "@jarvis/security";
const collections = [
    "devices",
    "passkeys",
    "sessions",
    "subjects",
    "delegations",
    "challenges",
    "approvals",
    "replays",
] as const;
export class PostgresIdentityRepository implements IdentityRepository {
    constructor(
        private readonly pool: pg.Pool,
        private readonly cipher: RecordCipher,
    ) {}
    async transaction<T>(
        work: (state: IdentityState, events: SecurityEvent[]) => Promise<T>,
    ): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            await client.query("SET LOCAL lock_timeout='5s'");
            await client.query("SELECT pg_advisory_xact_lock(7247662)");
            const state = emptyIdentityState();
            const owner = await client.query<{ id: string; payload: string }>(
                "SELECT id,payload FROM identity.root_owner WHERE singleton=true",
            );
            if (owner.rows[0])
                state.owner = this.cipher.decrypt(
                    owner.rows[0].payload,
                    "identity:development:owner:" + owner.rows[0].id,
                ) as OwnerProfile;
            for (const name of collections) {
                const result = await client.query<{
                    id: string;
                    payload: string;
                }>(`SELECT id,payload FROM identity.${name}`);
                const records: Record<string, unknown> = Object.create(null);
                for (const row of result.rows)
                    records[row.id] = this.cipher.decrypt(
                        row.payload,
                        "identity:development:" + name + ":" + row.id,
                    );
                Object.assign(state, { [name]: records });
            }
            const before = structuredClone(state),
                events: SecurityEvent[] = [];
            const security = await client.query<{ payload: string }>(
                "SELECT payload FROM security.governance_state WHERE singleton=true",
            );
            if (security.rows[0])
                state.security = this.cipher.decrypt(
                    security.rows[0].payload,
                    "security:development:governance:v1",
                );
            before.security = structuredClone(state.security);
            const result = await work(state, events);
            if (
                JSON.stringify(before.security) !==
                JSON.stringify(state.security)
            ) {
                if (state.security === undefined)
                    throw new Error("SECURITY_STATE_REMOVAL_DENIED");
                await client.query(
                    "INSERT INTO security.governance_state(singleton,payload) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET payload=EXCLUDED.payload",
                    [
                        this.cipher.encrypt(
                            state.security,
                            "security:development:governance:v1",
                        ),
                    ],
                );
            }
            if (JSON.stringify(before.owner) !== JSON.stringify(state.owner)) {
                if (
                    !state.owner ||
                    (before.owner && before.owner.id !== state.owner.id)
                )
                    throw new Error("OWNER_IMMUTABLE");
                const saved = await client.query(
                    "INSERT INTO identity.root_owner(singleton,id,payload) VALUES(true,$1,$2) ON CONFLICT(singleton) DO UPDATE SET payload=EXCLUDED.payload WHERE identity.root_owner.id=EXCLUDED.id",
                    [
                        state.owner.id,
                        this.cipher.encrypt(
                            state.owner,
                            "identity:development:owner:" + state.owner.id,
                        ),
                    ],
                );
                if (saved.rowCount !== 1) throw new Error("OWNER_IMMUTABLE");
            }
            for (const name of collections) {
                const current: Record<string, unknown> = state[name],
                    old: Record<string, unknown> = before[name];
                for (const [id, value] of Object.entries(current))
                    if (JSON.stringify(value) !== JSON.stringify(old[id]))
                        await client.query(
                            `INSERT INTO identity.${name}(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload`,
                            [
                                id,
                                this.cipher.encrypt(
                                    value,
                                    "identity:development:" + name + ":" + id,
                                ),
                            ],
                        );
                for (const id of Object.keys(old))
                    if (!Object.hasOwn(current, id))
                        await client.query(
                            `DELETE FROM identity.${name} WHERE id=$1`,
                            [id],
                        );
            }
            for (const event of events)
                await client.query(
                    "INSERT INTO audit.identity_events(id,event_type,occurred_at,payload) VALUES($1,$2,$3,$4)",
                    [
                        event.id,
                        event.type,
                        new Date(event.timestamp),
                        this.cipher.encrypt(
                            event,
                            "identity:audit:" + event.id,
                        ),
                    ],
                );
            await client.query("COMMIT");
            return result;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
    async audit(limit: number): Promise<SecurityEvent[]> {
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
            throw new Error("AUDIT_LIMIT_INVALID");
        const rows = await this.pool.query<{ id: string; payload: string }>(
            "SELECT id,payload FROM audit.identity_events ORDER BY sequence DESC LIMIT $1",
            [limit],
        );
        return rows.rows.map(
            (row) =>
                this.cipher.decrypt(
                    row.payload,
                    "identity:audit:" + row.id,
                ) as SecurityEvent,
        );
    }
}
