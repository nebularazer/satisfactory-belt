import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { expect, it } from "vitest";

import { prepareImages, sha256 } from "./images.ts";

it("reuses unchanged conversions, rebuilds only new or corrupt images, and isolates output files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "satisfactory-image-cache-"));
  const cache = join(dir, "cache");
  try {
    async function source(name: string, red: number) {
      const bytes = await sharp({
        create: {
          width: 256,
          height: 256,
          channels: 4,
          background: { r: red, g: 80, b: 120, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();
      const file = join(dir, `${name}.png`);
      await writeFile(file, bytes);
      return { descriptorId: name, file, sha256: sha256(bytes) };
    }
    async function prepare(
      name: string,
      sources: Parameters<typeof prepareImages>[0],
      encoding: "quality90" | "lossless" = "quality90",
      compare = false,
    ) {
      const output = join(dir, name);
      await mkdir(join(output, "icons"), { recursive: true });
      return prepareImages(sources, output, encoding, compare, cache);
    }
    const a = await source("A", 20);
    const b = await source("B", 100);
    const cold = await prepare("cold", [a, b]);
    expect(cold.stats).toMatchObject({ reusedImages: 0, convertedImages: 2 });
    const warm = await prepare("warm", [a, b]);
    expect(warm.stats).toMatchObject({ reusedImages: 2, convertedImages: 0 });
    expect(warm.manifest).toEqual(cold.manifest);
    expect(warm.stats.outputBytes).toBe(cold.stats.outputBytes);
    const c = await source("C", 220);
    const extended = await prepare("extended", [a, b, c]);
    expect(extended.stats).toMatchObject({ reusedImages: 2, convertedImages: 1 });
    const namespace = (await readdir(cache))[0]!;
    const aId = cold.descriptorIcons.get("A")!;
    const variant = cold.manifest.icons[aId]!.variants[64];
    const original = await readFile(join(dir, "cold", variant.path));
    // A damaged cache must not change prior outputs or poison future preparations.
    await writeFile(join(cache, namespace, aId, `${variant.sha256}.webp`), "corrupt");
    expect(await readFile(join(dir, "cold", variant.path))).toEqual(original);
    const repaired = await prepare("repaired", [a, b, c]);
    expect(repaired.stats).toMatchObject({ reusedImages: 2, convertedImages: 1 });
    expect(repaired.manifest).toEqual(extended.manifest);
    // Incomplete and malformed entries are repaired, too.
    await rm(join(cache, namespace, aId, "entry.json"));
    expect((await prepare("missing", [a, b])).stats).toMatchObject({
      reusedImages: 1,
      convertedImages: 1,
    });
    await writeFile(join(cache, namespace, aId, "entry.json"), "{");
    expect((await prepare("malformed", [a, b])).stats).toMatchObject({
      reusedImages: 1,
      convertedImages: 1,
    });
    // Paths and descriptor names do not determine reuse; decoded source content does.
    const changed = await source("A", 230);
    expect((await prepare("changed", [changed, b])).stats).toMatchObject({
      reusedImages: 1,
      convertedImages: 1,
    });
    expect((await prepare("renamed", [{ ...b, descriptorId: "Renamed" }])).stats).toMatchObject({
      reusedImages: 1,
      convertedImages: 0,
    });
    await expect(prepare("invalid-source", [a])).rejects.toThrow("Source PNG hash mismatch");
    expect((await prepare("lossless", [b], "lossless")).stats).toMatchObject({
      reusedImages: 0,
      convertedImages: 1,
    });
    const compared = await prepare("compared", [b], "quality90", true);
    expect(compared.stats).toMatchObject({ reusedImages: 0, convertedImages: 1 });
    expect(compared.stats.comparison![64].lossless).toBeGreaterThan(0);
    expect(compared.stats.comparison![64].png).toBeGreaterThan(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);

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
