import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  IconManifest,
  IconSize,
  IconVariant,
  PreparedIcon,
} from "@satisfactory-belt/game-data";
import sharp, { type WebpOptions } from "sharp";

export const iconSizes = [64, 128, 256] as const;
const options = {
  lossless: { lossless: true, effort: 6 },
  quality90: { quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true },
} satisfies Record<IconManifest["encoding"], WebpOptions>;
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export interface ImageSource {
  descriptorId: string;
  file: string;
  sha256: string;
}
export interface ImageStats {
  descriptorCount: number;
  sourceFiles: number;
  uniqueImages: number;
  outputFiles: number;
  sourcePngBytes: number;
  outputBytes: number;
  bytesBySize: Record<IconSize, number>;
  /** Same resized pixels encoded in three formats; totals after source-pixel deduplication. */
  comparison?: Record<IconSize, { png: number; lossless: number; quality90: number }>;
}

/** Four workers bound memory; identical pixel content is encoded only once. */
// oxlint-disable no-await-in-loop
export async function prepareImages(
  sources: ImageSource[],
  output: string,
  encoding: IconManifest["encoding"],
  compare: boolean,
): Promise<{ manifest: IconManifest; descriptorIcons: Map<string, string>; stats: ImageStats }> {
  const icons: Record<string, PreparedIcon> = {};
  const descriptorIcons = new Map<string, string>();
  const files = new Map<string, string>();
  const written = new Set<string>();
  const stats: ImageStats = {
    descriptorCount: sources.length,
    sourceFiles: 0,
    uniqueImages: 0,
    outputFiles: 0,
    sourcePngBytes: 0,
    outputBytes: 0,
    bytesBySize: { 64: 0, 128: 0, 256: 0 },
    ...(compare
      ? {
          comparison: {
            64: { png: 0, lossless: 0, quality90: 0 },
            128: { png: 0, lossless: 0, quality90: 0 },
            256: { png: 0, lossless: 0, quality90: 0 },
          },
        }
      : {}),
  };
  const sourcesByFile = new Map<string, ImageSource>();
  for (const source of sources) {
    const previous = sourcesByFile.get(source.file);
    if (previous && previous.sha256 !== source.sha256)
      throw new Error(`Conflicting source hashes: ${source.file}`);
    sourcesByFile.set(source.file, source);
  }
  const reserved = new Set<string>();
  async function processSource(source: ImageSource) {
    const png = await readFile(source.file);
    if (sha256(png) !== source.sha256) throw new Error(`Source PNG hash mismatch: ${source.file}`);
    const { data, info } = await sharp(png, { failOn: "warning" })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== 256 || info.height !== 256 || info.channels !== 4)
      throw new Error(`Expected extracted 256px RGBA icon: ${source.file}`);
    const id = sha256(data);
    files.set(source.file, id);
    stats.sourceFiles++;
    stats.sourcePngBytes += png.length;
    if (reserved.has(id)) return;
    reserved.add(id);
    const variants: Partial<Record<IconSize, IconVariant>> = {};
    for (const size of iconSizes) {
      // Resize first, then encode each mode from exactly the same RGBA pixels.
      const resized = await sharp(data, { raw: info }).resize(size, size).raw().toBuffer();
      const image = () => sharp(resized, { raw: { width: size, height: size, channels: 4 } });
      const encoded = await image().webp(options[encoding]).toBuffer();
      const decoded = await sharp(encoded, { failOn: "warning" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (
        decoded.info.width !== size ||
        decoded.info.height !== size ||
        decoded.info.channels !== 4
      )
        throw new Error(`Invalid WebP dimensions for ${source.descriptorId}.`);
      for (let i = 0; i < resized.length; i += 4) {
        if (decoded.data[i + 3] !== resized[i + 3])
          throw new Error(`WebP changed transparency for ${source.descriptorId}.`);
        // Fully transparent RGB is immaterial and may be discarded by the WebP encoder.
        if (
          encoding === "lossless" &&
          resized[i + 3] !== 0 &&
          !decoded.data.subarray(i, i + 3).equals(resized.subarray(i, i + 3))
        )
          throw new Error(`Lossless WebP changed visible pixels for ${source.descriptorId}.`);
      }
      const hash = sha256(encoded);
      const path = `icons/${hash}.webp`;
      if (!written.has(path)) {
        written.add(path);
        await writeFile(join(output, path), encoded, { flag: "wx" });
        stats.outputBytes += encoded.length;
      }
      stats.bytesBySize[size] += encoded.length;
      variants[size] = { path, width: size, height: size, bytes: encoded.length, sha256: hash };
      if (stats.comparison) {
        const other = encoding === "lossless" ? "quality90" : "lossless";
        stats.comparison[size][encoding] += encoded.length;
        stats.comparison[size][other] += (await image().webp(options[other]).toBuffer()).length;
        stats.comparison[size].png += (await image().png().toBuffer()).length;
      }
    }
    if (!variants[64] || !variants[128] || !variants[256])
      throw new Error(`Incomplete variants for ${id}.`);
    icons[id] = { id, variants: { 64: variants[64], 128: variants[128], 256: variants[256] } };
    stats.uniqueImages++;
    if (stats.uniqueImages % 25 === 0) console.log(`Prepared ${stats.uniqueImages} unique icons…`);
  }
  const queue = [...sourcesByFile.values()];
  let next = 0;
  const workers = await Promise.allSettled(
    Array.from({ length: 4 }, async () => {
      while (next < queue.length) {
        const source = queue[next++];
        if (source) await processSource(source);
      }
    }),
  );
  for (const worker of workers) if (worker.status === "rejected") throw worker.reason;
  for (const source of sources) {
    const id = files.get(source.file);
    if (!id) throw new Error(`Missing prepared image for ${source.descriptorId}.`);
    descriptorIcons.set(source.descriptorId, id);
  }
  stats.outputFiles = written.size;
  return {
    manifest: {
      schemaVersion: 1,
      format: "webp",
      encoding,
      icons: Object.fromEntries(
        Object.entries(icons).toSorted(([a], [b]) => a.localeCompare(b, "en")),
      ),
    },
    descriptorIcons,
    stats,
  };
}
