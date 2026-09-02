import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import type pg from "pg";
import { BoundaryError } from "@jarvis/shared";
const ManifestSchema = z
    .array(
        z.strictObject({
            version: z.number().int().positive(),
            file: z.string().regex(/^[0-9]{4}_[a-z0-9_]+\.sql$/),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            destructive: z.boolean(),
        }),
    )
    .min(1);
export async function migrationFiles(directory: string) {
    const entries = ManifestSchema.parse(
        JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
    );
    const files = (await readdir(directory))
        .filter((f) => f.endsWith(".sql"))
        .sort();
    if (
        files.join() !==
            entries
                .map((e) => e.file)
                .sort()
                .join() ||
        entries.some((e, i) => e.version !== i + 1)
    )
        throw new BoundaryError("INVALID_MIGRATION_MANIFEST");
    return Promise.all(
        entries.map(async (e) => {
            const sql = await readFile(join(directory, e.file), "utf8");
            if (createHash("sha256").update(sql).digest("hex") !== e.sha256)
                throw new BoundaryError("MIGRATION_CHECKSUM_MISMATCH");
            if (e.destructive || /^\s*(DROP|TRUNCATE)\b/im.test(sql))
                throw new BoundaryError(
                    "DESTRUCTIVE_MIGRATION_REQUIRES_RECOVERY_GATE",
                );
            return { ...e, sql };
        }),
    );
}
export async function verifyMigrations(
    pool: pg.Pool,
    directory: string,
): Promise<boolean> {
    try {
        const expected = await migrationFiles(directory);
        const result = await pool.query<{ version: number; checksum: string }>(
            "SELECT version, checksum FROM settings.schema_migrations ORDER BY version",
        );
        return (
            result.rows.length === expected.length &&
            result.rows.every(
                (r, i) =>
                    r.version === expected[i]?.version &&
                    r.checksum === expected[i]?.sha256,
            )
        );
    } catch {
        return false;
    }
}
export async function migrate(
    pool: pg.Pool,
    directory: string,
    environment: string,
    runtimeUser: string,
    runtimePassword: string,
): Promise<void> {
    if (
        environment !== "development" ||
        runtimeUser !== "jarvis_development_runtime"
    )
        throw new BoundaryError("MIGRATION_ENVIRONMENT_DENIED");
    const migrations = await migrationFiles(directory);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SELECT pg_advisory_xact_lock(7247661)");
        await client.query("CREATE SCHEMA IF NOT EXISTS settings");
        await client.query(
            "CREATE TABLE IF NOT EXISTS settings.schema_migrations(version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
        );
        const existing = await client.query<{
            version: number;
            checksum: string;
        }>(
            "SELECT version, checksum FROM settings.schema_migrations ORDER BY version",
        );
        if (
            existing.rows.some(
                (r, i) =>
                    r.version !== i + 1 ||
                    !migrations.some(
                        (m) =>
                            m.version === r.version && m.sha256 === r.checksum,
                    ),
            )
        )
            throw new BoundaryError("MIGRATION_HISTORY_MISMATCH");
        for (const m of migrations) {
            if (existing.rows.some((r) => r.version === m.version)) continue;
            await client.query(m.sql);
            await client.query(
                "INSERT INTO settings.schema_migrations(version,checksum) VALUES($1,$2)",
                [m.version, m.sha256],
            );
        }
        const roles = await client.query(
            "SELECT 1 FROM pg_roles WHERE rolname=$1",
            [runtimeUser],
        );
        if (roles.rowCount === 0) {
            const statement = await client.query<{ statement: string }>(
                "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS statement",
                [runtimeUser, runtimePassword],
            );
            await client.query(statement.rows[0]!.statement);
        }
        await client.query(
            "GRANT CONNECT ON DATABASE jarvis_development TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT USAGE ON SCHEMA memory,events,audit,settings TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT ON settings.schema_migrations TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,DELETE ON memory.records TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT ON events.envelopes,audit.entries,audit.policy_entries TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT USAGE ON SCHEMA identity TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT USAGE ON SCHEMA security TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,UPDATE ON security.governance_state TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,UPDATE ON identity.root_owner TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,UPDATE,DELETE ON identity.devices,identity.passkeys,identity.sessions,identity.subjects,identity.delegations,identity.challenges,identity.approvals,identity.replays TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT ON audit.identity_events TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT USAGE ON SEQUENCE audit.identity_events_sequence_seq TO jarvis_development_runtime",
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
