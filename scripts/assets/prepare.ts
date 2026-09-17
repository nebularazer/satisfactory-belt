import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { validateGameData } from "@satisfactory-belt/game-data";
import sharp from "sharp";

import { parseCatalog } from "./catalog.ts";
import { collectIcons, decodeJson } from "./docs.ts";
import { reportedPngHashes } from "./export-result.ts";
import { prepareImages, sha256 } from "./images.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      encoding: { type: "string", default: "quality90" },
      compare: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(`Prepare typed game data and 64/128/256px WebP icons from a completed extraction.

pnpm assets:prepare --input .assets/extracted/<run> [--encoding quality90|lossless] [--compare]

Writes a fresh gitignored .assets/prepared/<locale>-<suffix>/ directory.
Reuses validated image conversions from .assets/cache/images/.
--compare bypasses cache reads to measure PNG, lossless WebP and quality-90 WebP sizes.
Setup and scope: docs/asset-extraction.md`);
    return;
  }
  if (!values.input)
    throw new Error("Pass --input with the output directory printed by assets:extract.");
  const encoding = values.encoding;
  if (encoding !== "quality90" && encoding !== "lossless")
    throw new Error("--encoding must be quality90 or lossless.");
  const input = resolve(values.input);
  const extraction: unknown = JSON.parse(await readFile(join(input, "extraction.json"), "utf8"));
  if (
    !record(extraction) ||
    extraction.status !== "complete" ||
    typeof extraction.locale !== "string" ||
    !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(extraction.locale)
  )
    throw new Error("Input must be a completed assets:extract run.");
  const bytes = await readFile(join(input, "docs.json"));
  const docs = decodeJson(bytes);
  const { catalog, excludedRecipes } = parseCatalog(docs, {
    locale: extraction.locale,
    docsSha256: sha256(bytes),
  });
  const sourceIcons = collectIcons(docs);
  const sourceManifest = [
    ...new Map(
      sourceIcons.map(({ assetPath, objectName }) => [assetPath, { assetPath, objectName }]),
    ).values(),
  ];
  const hashes = reportedPngHashes(
    JSON.parse(await readFile(join(input, "icons/extraction-result.json"), "utf8")),
    sourceManifest,
  );
  const entities = [
    ...Object.values(catalog.items),
    ...Object.values(catalog.machines),
    ...Object.values(catalog.fixedProducers),
    ...Object.values(catalog.extractors),
    ...Object.values(catalog.logistics),
    ...Object.values(catalog.sinks),
    ...Object.values(catalog.buildings ?? {}),
  ];
  const needed = new Set(entities.map((entry) => entry.iconId));
  const byDescriptor = new Map(sourceIcons.map((icon) => [icon.className, icon]));
  const sources = [...needed].toSorted().map((descriptorId) => {
    const icon = byDescriptor.get(descriptorId);
    if (!icon) throw new Error(`Missing extracted icon for ${descriptorId}.`);
    const hash = hashes.get(icon.assetPath);
    if (!hash) throw new Error(`Missing export result for ${descriptorId}.`);
    return { descriptorId, file: join(input, icon.file), sha256: hash };
  });
  const outputRoot = join(root, ".assets/prepared");
  await mkdir(outputRoot, { recursive: true });
  const output = await mkdtemp(join(outputRoot, `${extraction.locale}-`));
  await mkdir(join(output, "icons"));
  const writeJson = (file: string, value: unknown, pretty = false) =>
    writeFile(join(output, file), `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`);
  const metadata = { input, sourceExtraction: extraction, encoding, sharpVersions: sharp.versions };
  await writeJson("preparation.json", { ...metadata, status: "incomplete" }, true);
  console.log(
    `Output: ${output}\nCatalog: ${Object.keys(catalog.items).length} items, ${Object.keys(catalog.recipes).length} recipes, ${Object.keys(catalog.machines).length} machines, ${Object.keys(catalog.fixedProducers).length} fixed producers, ${Object.keys(catalog.extractors).length} extractors.`,
  );
  const { manifest, descriptorIcons, stats } = await prepareImages(
    sources,
    output,
    encoding,
    values.compare,
    join(root, ".assets/cache/images"),
  );
  for (const entry of entities) {
    const iconId = descriptorIcons.get(entry.iconId);
    if (!iconId) throw new Error(`Missing prepared icon for ${entry.id}.`);
    entry.iconId = iconId;
  }
  validateGameData(catalog, manifest);
  await writeJson("catalog.json", catalog);
  await writeJson("icons.json", manifest);
  await writeJson(
    "preparation.json",
    { ...metadata, status: "complete", stats, excludedRecipes },
    true,
  );
  console.log(
    `Prepared ${stats.uniqueImages} unique images (${stats.reusedImages} reused, ${stats.convertedImages} converted) in ${stats.outputFiles} WebP files (${(stats.outputBytes / 1024 / 1024).toFixed(2)} MiB across all sizes).\nResults: ${output}`,
  );
  if (stats.comparison) console.table(stats.comparison);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
