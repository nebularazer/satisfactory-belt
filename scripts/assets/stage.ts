import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { validateGameData } from "@satisfactory-belt/game-data";
import type { GameCatalog, IconManifest } from "@satisfactory-belt/game-data";

/** Validate everything in a temporary directory before replacing generated browser assets. */
export async function stageAssets(input: string, publicDirectory: string): Promise<void> {
  const preparation = JSON.parse(await readFile(join(input, "preparation.json"), "utf8"));
  if (preparation.status !== "complete")
    throw new Error("Input must be a completed assets:prepare run.");
  const catalog: GameCatalog = JSON.parse(await readFile(join(input, "catalog.json"), "utf8"));
  const icons: IconManifest = JSON.parse(await readFile(join(input, "icons.json"), "utf8"));
  validateGameData(catalog, icons);
  await mkdir(publicDirectory, { recursive: true });
  const staging = await mkdtemp(join(publicDirectory, ".game-data-"));
  try {
    await mkdir(join(staging, "icons"));
    const paths = new Set<string>();
    for (const icon of Object.values(icons.icons)) {
      for (const variant of Object.values(icon.variants)) {
        if (paths.has(variant.path)) continue;
        // oxlint-disable-next-line no-await-in-loop -- Bound file buffers to one icon while staging.
        const bytes = await readFile(join(input, variant.path));
        if (
          bytes.length !== variant.bytes ||
          createHash("sha256").update(bytes).digest("hex") !== variant.sha256
        )
          throw new Error(`Invalid prepared icon ${variant.path}.`);
        // oxlint-disable-next-line no-await-in-loop -- Finish each validated file before releasing its buffer.
        await writeFile(join(staging, variant.path), bytes);
        paths.add(variant.path);
      }
    }
    await writeFile(join(staging, "catalog.json"), JSON.stringify(catalog));
    await writeFile(join(staging, "icons.json"), JSON.stringify(icons));
    // This destination contains only generated, gitignored assets.
    await rm(join(publicDirectory, "game-data"), { recursive: true, force: true });
    await rename(staging, join(publicDirectory, "game-data"));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function main() {
  const { values } = parseArgs({ options: { input: { type: "string" } } });
  if (!values.input) throw new Error("Pass --input .assets/prepared/<completed-run>.");
  const publicDirectory = fileURLToPath(new URL("../../apps/web/public/", import.meta.url));
  await stageAssets(resolve(values.input), publicDirectory);
  console.log(`Staged game data in ${join(publicDirectory, "game-data")}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
