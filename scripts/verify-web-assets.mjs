import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { assetVersionManifest, mapConcurrent } from "./image-assets.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const itemDirectory = path.join(repositoryRoot, "apps/web/public/items");
const buildableDirectory = path.join(
  repositoryRoot,
  "apps/web/public/buildables",
);
const manifestPath = path.join(
  repositoryRoot,
  "apps/web/src/game/image-assets.generated.json",
);
const items = JSON.parse(
  await readFile(
    path.join(repositoryRoot, "packages/production/src/data/items.json"),
    "utf8",
  ),
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sourceBuildables = (
  await Promise.all(
    ["buildables", "machines"].map((directory) =>
      readdir(path.join(repositoryRoot, "apps/web/src/assets", directory)),
    ),
  )
)
  .flat()
  .filter((fileName) => fileName.endsWith(".png"))
  .map((fileName) => path.basename(fileName, ".png"))
  .sort();
assert.deepEqual(manifest.buildables, sourceBuildables);

const expectedFiles = [
  ...items.flatMap(({ id }) =>
    [64, 128, 256].map((width) => ({
      path: path.join(itemDirectory, `${id}-${width}.webp`),
      width,
    })),
  ),
  ...manifest.buildables.flatMap((descriptorId) =>
    [128, 256].map((width) => ({
      path: path.join(buildableDirectory, `${descriptorId}-${width}.webp`),
      width,
    })),
  ),
];

await mapConcurrent(expectedFiles, 16, async (asset) => {
  const metadata = await sharp(asset.path).metadata();
  assert.equal(metadata.format, "webp", asset.path);
  assert.equal(metadata.width, asset.width, asset.path);
  assert.equal(metadata.height, asset.width, asset.path);
});

const actualWebpFiles = [
  ...(await readdir(itemDirectory)).map((fileName) => `items/${fileName}`),
  ...(await readdir(buildableDirectory)).map(
    (fileName) => `buildables/${fileName}`,
  ),
]
  .filter((fileName) => fileName.endsWith(".webp"))
  .sort();
const expectedWebpFiles = expectedFiles
  .map(({ path: assetPath }) =>
    path.relative(path.join(repositoryRoot, "apps/web/public"), assetPath),
  )
  .sort();
assert.deepEqual(actualWebpFiles, expectedWebpFiles);

const publicPngs = [
  ...(await readdir(itemDirectory)),
  ...(await readdir(buildableDirectory)),
].filter((fileName) => fileName.endsWith(".png"));
assert.deepEqual(publicPngs, [], "Public artwork must use responsive WebP");
assert.deepEqual(
  manifest,
  await assetVersionManifest([itemDirectory, buildableDirectory]),
  "Regenerate assets after changing source artwork",
);

console.log(`Verified ${expectedFiles.length} responsive WebP assets.`);
