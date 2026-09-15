import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { IconSize, IconVariant, PreparedIcon } from "@satisfactory-belt/game-data";

export const iconSizes = [64, 128, 256] as const;
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const isHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type CachedImage = { icon: PreparedIcon; images: Map<IconSize, Buffer> };

/** A disposable conversion cache. Completed output directories never share mutable files with it. */
export function createImageCache(directory: string, conversion: unknown) {
  const root = join(directory, hash(JSON.stringify(conversion)));
  return {
    async read(id: string): Promise<CachedImage | undefined> {
      if (!isHash(id)) throw new Error("Invalid source image hash.");
      try {
        const entry: unknown = JSON.parse(await readFile(join(root, id, "entry.json"), "utf8"));
        if (!record(entry) || entry.id !== id || !record(entry.variants)) return undefined;
        const variants: Partial<Record<IconSize, IconVariant>> = {};
        const images = new Map<IconSize, Buffer>();
        for (const size of iconSizes) {
          const variant = entry.variants[size];
          if (
            !record(variant) ||
            !isHash(variant.sha256) ||
            variant.path !== `icons/${variant.sha256}.webp` ||
            variant.width !== size ||
            variant.height !== size ||
            typeof variant.bytes !== "number" ||
            !Number.isSafeInteger(variant.bytes) ||
            variant.bytes <= 0
          )
            return undefined;
          // Derive the filename from a validated hash, never from cached paths.
          // oxlint-disable-next-line no-await-in-loop -- Three small files per entry.
          const bytes = await readFile(join(root, id, `${variant.sha256}.webp`));
          if (bytes.length !== variant.bytes || hash(bytes) !== variant.sha256) return undefined;
          variants[size] = {
            path: variant.path,
            width: size,
            height: size,
            bytes: variant.bytes,
            sha256: variant.sha256,
          };
          images.set(size, bytes);
        }
        return {
          icon: { id, variants: { 64: variants[64]!, 128: variants[128]!, 256: variants[256]! } },
          images,
        };
      } catch (error) {
        // Interrupted writes and corrupt metadata are cache misses; permission/disk errors are not.
        if (error instanceof SyntaxError || (record(error) && error.code === "ENOENT"))
          return undefined;
        throw error;
      }
    },
    async write({ icon, images }: CachedImage): Promise<void> {
      if (!isHash(icon.id)) throw new Error("Invalid source image hash.");
      const entry = join(root, icon.id);
      await mkdir(entry, { recursive: true });
      for (const size of iconSizes) {
        const variant = icon.variants[size];
        const bytes = images.get(size);
        if (
          !bytes ||
          !isHash(variant.sha256) ||
          hash(bytes) !== variant.sha256 ||
          bytes.length !== variant.bytes
        )
          throw new Error("Invalid converted image for cache.");
        // oxlint-disable-next-line no-await-in-loop -- Publish the three files before their manifest.
        await atomicWrite(join(entry, `${variant.sha256}.webp`), bytes);
      }
      await atomicWrite(join(entry, "entry.json"), JSON.stringify(icon));
    },
  };
}

async function atomicWrite(path: string, data: Uint8Array | string) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
