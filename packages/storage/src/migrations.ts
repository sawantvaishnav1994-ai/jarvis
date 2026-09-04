import { access, readFile, readdir } from "node:fs/promises";
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

async function migrationSet(directory: string, startVersion: number) {
    const entries = ManifestSchema.parse(
        JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
    );
    const files = (await readdir(directory))
        .filter((file) => file.endsWith(".sql"))
        .sort();
    if (
        files.join() !== entries.map((entry) => entry.file).sort().join() ||
        entries.some((entry, index) => entry.version !== startVersion + index)
    )
        throw new BoundaryError("INVALID_MIGRATION_MANIFEST");
    return Promise.all(
        entries.map(async (entry) => {
            const sql = await readFile(join(directory, entry.file), "utf8");
            if (
                createHash("sha256").update(sql).digest("hex") !== entry.sha256
            )
                throw new BoundaryError("MIGRATION_CHECKSUM_MISMATCH");
            if (entry.destructive || /^\s*(DROP|TRUNCATE)\b/im.test(sql))
                throw new BoundaryError(
                    "DESTRUCTIVE_MIGRATION_REQUIRES_RECOVERY_GATE",
                );
            return { ...entry, sql };
        }),
    );
}

export async function migrationFiles(directory: string) {
    return migrationSet(directory, 1);
}

async function runtimeMigrationFiles(directory: string, foundationLength: number) {
    const j1 = join(directory, "j1");
    try {
        await access(join(j1, "manifest.json"));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
    }
    return migrationSet(j1, foundationLength + 1);
}

function matchesMigrationSet(
    rows: { version: number; checksum: string }[],
    expected: { version: number; sha256: string }[],
) {
    return (
        rows.length === expected.length &&
        rows.every(
            (row, index) =>
                row.version === expected[index]?.version &&
                row.checksum === expected[index]?.sha256,
        )
    );
}

export async function verifyMigrations(
    pool: pg.Pool,
    directory: string,
): Promise<boolean> {
    try {
        const foundation = await migrationFiles(directory);
        const runtime = await runtimeMigrationFiles(directory, foundation.length);
        const baseResult = await pool.query<{
            version: number;
            checksum: string;
        }>("SELECT version, checksum FROM settings.schema_migrations ORDER BY version");
        if (!matchesMigrationSet(baseResult.rows, foundation)) return false;
        if (runtime.length === 0) return true;
        const runtimeResult = await pool.query<{
            version: number;
            checksum: string;
        }>(
            "SELECT version, checksum FROM settings.runtime_schema_migrations ORDER BY version",
        );
        return matchesMigrationSet(runtimeResult.rows, runtime);
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

    const foundation = await migrationFiles(directory);
    const runtime = await runtimeMigrationFiles(directory, foundation.length);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SELECT pg_advisory_xact_lock(7247661)");
        await client.query("CREATE SCHEMA IF NOT EXISTS settings");
        await client.query(
            "CREATE TABLE IF NOT EXISTS settings.schema_migrations(version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
        );
        await client.query(
            "CREATE TABLE IF NOT EXISTS settings.runtime_schema_migrations(version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
        );

        const existingFoundation = await client.query<{
            version: number;
            checksum: string;
        }>("SELECT version, checksum FROM settings.schema_migrations ORDER BY version");
        if (
            existingFoundation.rows.some(
                (row, index) =>
                    row.version !== index + 1 ||
                    !foundation.some(
                        (migration) =>
                            migration.version === row.version &&
                            migration.sha256 === row.checksum,
                    ),
            )
        )
            throw new BoundaryError("MIGRATION_HISTORY_MISMATCH");
        for (const migration of foundation) {
            if (
                existingFoundation.rows.some(
                    (row) => row.version === migration.version,
                )
            )
                continue;
            await client.query(migration.sql);
            await client.query(
                "INSERT INTO settings.schema_migrations(version,checksum) VALUES($1,$2)",
                [migration.version, migration.sha256],
            );
        }

        const existingRuntime = await client.query<{
            version: number;
            checksum: string;
        }>(
            "SELECT version, checksum FROM settings.runtime_schema_migrations ORDER BY version",
        );
        if (
            existingRuntime.rows.some(
                (row, index) =>
                    row.version !== foundation.length + index + 1 ||
                    !runtime.some(
                        (migration) =>
                            migration.version === row.version &&
                            migration.sha256 === row.checksum,
                    ),
            )
        )
            throw new BoundaryError("RUNTIME_MIGRATION_HISTORY_MISMATCH");
        for (const migration of runtime) {
            if (
                existingRuntime.rows.some(
                    (row) => row.version === migration.version,
                )
            )
                continue;
            await client.query(migration.sql);
            await client.query(
                "INSERT INTO settings.runtime_schema_migrations(version,checksum) VALUES($1,$2)",
                [migration.version, migration.sha256],
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
            "GRANT SELECT ON settings.schema_migrations,settings.runtime_schema_migrations TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,DELETE ON memory.records TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,UPDATE,DELETE ON memory.lifecycle,memory.revisions,memory.conflicts,memory.conflict_members,memory.admission_decisions TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,DELETE ON memory.restrictions TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,UPDATE,DELETE ON memory.context_cache TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT ON audit.memory_events TO jarvis_development_runtime",
        );
        await client.query(
            "REVOKE UPDATE,DELETE ON audit.memory_events FROM jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT ON events.envelopes,audit.entries,audit.policy_entries TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT ON audit.records_v3,audit.checkpoints,audit.trace_spans,audit.export_manifests TO jarvis_development_runtime",
        );
        await client.query(
            "REVOKE UPDATE,DELETE ON audit.records_v3,audit.checkpoints,audit.trace_spans,audit.export_manifests FROM jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,UPDATE,DELETE ON events.event_log,events.outbox,events.inbox,events.subscriptions,events.delivery_attempts,events.dead_letters,events.schedules,events.ingress_receipts,events.sequence_checkpoints TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT USAGE,SELECT ON SEQUENCE events.delivery_attempts_attempt_id_seq,events.dead_letters_dead_letter_id_seq TO jarvis_development_runtime",
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
        await client.query(
            "GRANT USAGE ON SCHEMA storage,recovery,conversations,knowledge,projects TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA storage,conversations,knowledge,projects TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,UPDATE,DELETE ON memory.sources,memory.embeddings,settings.owner_records TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT UPDATE ON memory.records TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,UPDATE ON security.key_metadata,security.secret_metadata TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT ON security.data_access_events TO jarvis_development_runtime",
        );
        await client.query(
            "REVOKE DELETE ON storage.backups,storage.backup_items FROM jarvis_development_runtime",
        );
        await client.query(
            "REVOKE UPDATE,DELETE ON storage.backup_retention,storage.backup_deletion_obligations FROM jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,DELETE ON recovery.migration_probe TO jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT ON recovery.manifests,recovery.checkpoints,recovery.evidence TO jarvis_development_runtime",
        );
        await client.query(
            "REVOKE UPDATE,DELETE ON recovery.manifests,recovery.checkpoints,recovery.evidence FROM jarvis_development_runtime",
        );
        await client.query(
            "GRANT SELECT,INSERT,UPDATE ON recovery.restore_plans,recovery.executions,recovery.cutover_markers,recovery.safe_mode TO jarvis_development_runtime",
        );
        await client.query(
            "REVOKE DELETE ON recovery.restore_plans,recovery.executions,recovery.cutover_markers,recovery.safe_mode FROM jarvis_development_runtime",
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
