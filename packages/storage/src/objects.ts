import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, lstat, open, readdir, unlink, statfs } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import { BoundaryError } from "@jarvis/shared";

export const storageHash = (value: Uint8Array | string): string =>
    createHash("sha256").update(value).digest("hex");
const Key = z.string().regex(/^[a-f0-9]{64}$/);
/** Encrypted bytes only; callers own authorization, envelope encryption and metadata. */
export interface ObjectStorage {
    put(ownerId: string, encrypted: Uint8Array): Promise<string>;
    get(ownerId: string, key: string): Promise<Buffer>;
    head(
        ownerId: string,
        key: string,
    ): Promise<{ size: number; sha256: string }>;
    list(ownerId: string): Promise<string[]>;
    delete(ownerId: string, key: string): Promise<void>;
    verify(ownerId: string, key: string): Promise<boolean>;
    availableBytes(): Promise<number>;
}
export class LocalEncryptedObjects implements ObjectStorage {
    private readonly root: string;
    constructor(directory: string) {
        this.root = resolve(directory);
        if (this.root === "/") throw new BoundaryError("OBJECT_ROOT_INVALID");
    }
    private async directory(ownerId: string) {
        z.string().min(1).max(128).parse(ownerId);
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const directory = join(this.root, storageHash(ownerId));
        for (const path of [this.root, directory]) {
            await mkdir(path, { recursive: true, mode: 0o700 });
            const s = await lstat(path);
            if (
                !s.isDirectory() ||
                s.isSymbolicLink() ||
                (s.mode & 0o077) !== 0
            )
                throw new BoundaryError("OBJECT_DIRECTORY_UNSAFE");
        }
        return directory;
    }
    async put(ownerId: string, input: Uint8Array) {
        const bytes = Buffer.from(input);
        if (bytes.length === 0 || bytes.length > 100000)
            throw new BoundaryError("OBJECT_SIZE_LIMIT");
        const key = storageHash(bytes),
            path = join(await this.directory(ownerId), key);
        try {
            const handle = await open(
                path,
                constants.O_WRONLY |
                    constants.O_CREAT |
                    constants.O_EXCL |
                    constants.O_NOFOLLOW,
                0o600,
            );
            try {
                await handle.writeFile(bytes);
                await handle.sync();
            } finally {
                await handle.close();
            }
        } catch (error) {
            if (!(
                error instanceof Error &&
                "code" in error &&
                error.code === "EEXIST"
            ))
                throw error;
            const existing = await this.get(ownerId, key);
            if (!existing.equals(bytes))
                throw new BoundaryError("OBJECT_COLLISION_OR_CORRUPTION");
        }
        return key;
    }
    async get(ownerId: string, key: string) {
        Key.parse(key);
        const handle = await open(
            join(await this.directory(ownerId), key),
            constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
            const s = await handle.stat();
            if (!s.isFile() || (s.mode & 0o077) !== 0 || s.size > 100000)
                throw new BoundaryError("OBJECT_FILE_UNSAFE");
            const bytes = await handle.readFile();
            if (storageHash(bytes) !== key)
                throw new BoundaryError("OBJECT_HASH_MISMATCH");
            return bytes;
        } finally {
            await handle.close();
        }
    }
    async head(ownerId: string, key: string) {
        const b = await this.get(ownerId, key);
        return { size: b.length, sha256: storageHash(b) };
    }
    async list(ownerId: string) {
        return (await readdir(await this.directory(ownerId)))
            .filter((x) => Key.safeParse(x).success)
            .sort();
    }
    async delete(ownerId: string, key: string) {
        Key.parse(key);
        await unlink(join(await this.directory(ownerId), key));
    }
    async verify(ownerId: string, key: string) {
        try {
            await this.get(ownerId, key);
            return true;
        } catch {
            return false;
        }
    }
    async availableBytes() {
        const s = await statfs(this.root);
        return s.bavail * s.bsize;
    }
}
