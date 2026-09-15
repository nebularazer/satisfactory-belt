import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { stageAssets } from "./stage.ts";

it("stages verified artifacts and retains the previous assets when the next input is corrupt", async () => {
  const root = await mkdtemp(join(tmpdir(), "machine-assets-"));
  const input = join(root, "input");
  const output = join(root, "public");
  try {
    await mkdir(join(input, "icons"), { recursive: true });
    // Staging verifies integrity against preparation; image decoding belongs to preparation.
    const bytes = Buffer.from("prepared image bytes");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const variant = { path: `icons/${hash}.webp`, sha256: hash, bytes: bytes.length };
    const catalog = {
      schemaVersion: 1,
      extractors: {},
      logistics: {},
      source: { locale: "en", docsSha256: hash },
      items: {},
      machines: {},
      recipes: {},
      fixedProducers: {},
    };
    const icons = {
      schemaVersion: 1,
      format: "webp",
      encoding: "quality90",
      icons: {
        [hash]: {
          id: hash,
          variants: Object.fromEntries(
            [64, 128, 256].map((size) => [size, { ...variant, width: size, height: size }]),
          ),
        },
      },
    };
    await writeFile(join(input, "preparation.json"), JSON.stringify({ status: "complete" }));
    await writeFile(join(input, "catalog.json"), JSON.stringify(catalog));
    await writeFile(join(input, "icons.json"), JSON.stringify(icons));
    await writeFile(join(input, variant.path), bytes);
    await stageAssets(input, output);
    expect(JSON.parse(await readFile(join(output, "game-data/catalog.json"), "utf8"))).toEqual(
      catalog,
    );
    expect(await readFile(join(output, "game-data", variant.path))).toEqual(bytes);
    await writeFile(join(input, variant.path), "corrupt image");
    await expect(stageAssets(input, output)).rejects.toThrow("Invalid prepared icon");
    expect(await readFile(join(output, "game-data", variant.path))).toEqual(bytes);
    await writeFile(join(input, "preparation.json"), JSON.stringify({ status: "incomplete" }));
    await expect(stageAssets(input, output)).rejects.toThrow("completed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
