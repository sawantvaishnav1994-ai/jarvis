import { mkdtemp, readFile, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { it, expect } from "vitest";
import { migrationFiles } from "@jarvis/storage";
it("accepts reviewed append-only baseline SQL", async () => {
    expect(await migrationFiles("infrastructure/migrations")).toHaveLength(4);
});
it("refuses modified, unlisted and destructive migrations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jarvis-migration-"));
    try {
        await cp("infrastructure/migrations", directory, { recursive: true });
        const manifest = JSON.parse(
            await readFile(join(directory, "manifest.json"), "utf8"),
        );
        await writeFile(join(directory, manifest[0].file), "SELECT 'changed';");
        await expect(migrationFiles(directory)).rejects.toThrow(
            "MIGRATION_CHECKSUM_MISMATCH",
        );
        const sql = "DROP TABLE memory.records;";
        manifest[0].sha256 = createHash("sha256").update(sql).digest("hex");
        await writeFile(join(directory, manifest[0].file), sql);
        await writeFile(
            join(directory, "manifest.json"),
            JSON.stringify(manifest),
        );
        await expect(migrationFiles(directory)).rejects.toThrow(
            "DESTRUCTIVE_MIGRATION_REQUIRES_RECOVERY_GATE",
        );
        await writeFile(join(directory, "0002_unlisted.sql"), "SELECT 1;");
        await expect(migrationFiles(directory)).rejects.toThrow(
            "INVALID_MIGRATION_MANIFEST",
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
