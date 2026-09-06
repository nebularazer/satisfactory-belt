import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  generateImageVariants,
  mapConcurrent,
  removeUnexpectedWebpAssets,
  writeAssetVersionManifest,
} from "./image-assets.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const items = JSON.parse(
  await readFile(
    path.join(repositoryRoot, "packages/production/src/data/items.json"),
    "utf8",
  ),
);

await mapConcurrent(items, 8, ({ id }) =>
  generateImageVariants(
    path.join(repositoryRoot, ".dev/assets/game/items", `${id}.png`),
    path.join(repositoryRoot, "apps/web/public/items"),
    [64, 128, 256],
  ),
);
await removeUnexpectedWebpAssets(
  path.join(repositoryRoot, "apps/web/public/items"),
  new Set(
    items.flatMap(({ id }) =>
      [64, 128, 256].map((width) => `${id}-${width}.webp`),
    ),
  ),
);
const buildableDescriptorIds = [];
for (const directory of ["buildables", "machines"]) {
  const assetDirectory = path.join(
    repositoryRoot,
    "apps/web/src/assets",
    directory,
  );
  const sourceFiles = (await readdir(assetDirectory)).filter((fileName) =>
    fileName.endsWith(".png"),
  );
  buildableDescriptorIds.push(
    ...sourceFiles.map((fileName) => path.basename(fileName, ".png")),
  );
  await mapConcurrent(sourceFiles, 8, (fileName) =>
    generateImageVariants(
      path.join(assetDirectory, fileName),
      path.join(repositoryRoot, "apps/web/public/buildables"),
      [128, 256],
    ),
  );
}
await removeUnexpectedWebpAssets(
  path.join(repositoryRoot, "apps/web/public/buildables"),
  new Set(
    buildableDescriptorIds.flatMap((descriptorId) =>
      [128, 256].map((width) => `${descriptorId}-${width}.webp`),
    ),
  ),
);

await writeAssetVersionManifest(
  [
    path.join(repositoryRoot, "apps/web/public/items"),
    path.join(repositoryRoot, "apps/web/public/buildables"),
  ],
  path.join(repositoryRoot, "apps/web/src/game/image-assets.generated.json"),
);

console.log(
  `Generated responsive WebP assets for ${items.length} items and all buildables.`,
);
