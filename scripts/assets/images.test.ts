import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { expect, it } from "vitest";

import { prepareImages, sha256 } from "./images.ts";

it("deduplicates pixels across PNG encodings, preserves alpha and generates all hashed variants", async () => {
  const dir = await mkdtemp(join(tmpdir(), "satisfactory-icons-"));
  try {
    await mkdir(join(dir, "icons"));
    const pixels = Buffer.alloc(256 * 256 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 200;
      pixels[i + 1] = 100;
      pixels[i + 2] = 50;
      pixels[i + 3] = (i / 4) % 256;
    }
    const input = sharp(pixels, { raw: { width: 256, height: 256, channels: 4 } });
    const a = await input.clone().png({ compressionLevel: 0 }).toBuffer();
    const b = await input.clone().png({ compressionLevel: 9 }).toBuffer();
    await writeFile(join(dir, "a.png"), a);
    await writeFile(join(dir, "b.png"), b);
    const sources = [
      { descriptorId: "A", file: join(dir, "a.png"), sha256: sha256(a) },
      { descriptorId: "B", file: join(dir, "b.png"), sha256: sha256(b) },
    ];
    const result = await prepareImages(sources, dir, "lossless", true);
    expect(result.stats.uniqueImages).toBe(1);
    expect(result.stats.outputFiles).toBe(3);
    expect(result.descriptorIcons.get("A")).toBe(result.descriptorIcons.get("B"));
    const icon = Object.values(result.manifest.icons)[0]!;
    for (const size of [64, 128, 256] as const) {
      const variant = icon.variants[size];
      // oxlint-disable-next-line no-await-in-loop -- Three small image files.
      const bytes = await readFile(join(dir, variant.path));
      expect(sha256(bytes)).toBe(variant.sha256);
      expect(bytes.length).toBe(variant.bytes);
      expect(variant.path).toBe(`icons/${variant.sha256}.webp`);
      expect(result.stats.comparison![size].quality90).toBeGreaterThan(0);
    }
    await expect(
      prepareImages([{ ...sources[0]!, sha256: "invalid" }], dir, "quality90", false),
    ).rejects.toThrow("hash mismatch");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
