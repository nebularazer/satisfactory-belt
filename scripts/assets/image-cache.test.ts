import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { createImageCache, iconSizes } from "./image-cache.ts";
import { sha256 } from "./images.ts";

it("isolates conversion versions and supports simultaneous publication of the same entry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "satisfactory-cache-version-"));
  try {
    // Cache integrity checks bytes; image validation belongs to the conversion pipeline.
    const bytes = Buffer.from("validated conversion");
    const digest = sha256(bytes);
    const variant = (size: 64 | 128 | 256) => ({
      path: `icons/${digest}.webp`,
      width: size,
      height: size,
      bytes: bytes.length,
      sha256: digest,
    });
    const entry = {
      icon: {
        id: "a".repeat(64),
        variants: { 64: variant(64), 128: variant(128), 256: variant(256) },
      },
      images: new Map(iconSizes.map((size) => [size, bytes])),
    };
    const config = { pipelineVersion: 1, encoderVersion: "1" };
    const cache = createImageCache(dir, config);
    await Promise.all([cache.write(entry), createImageCache(dir, config).write(entry)]);
    expect(await cache.read(entry.icon.id)).toEqual(entry);
    expect(
      await createImageCache(dir, { ...config, encoderVersion: "2" }).read(entry.icon.id),
    ).toBeUndefined();
    expect(
      await createImageCache(dir, { ...config, pipelineVersion: 2 }).read(entry.icon.id),
    ).toBeUndefined();
    expect(await cache.read("b".repeat(64))).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
