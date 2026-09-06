import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const WEBP_OPTIONS = {
  alphaQuality: 100,
  effort: 6,
  quality: 82,
  smartSubsample: true,
};

export async function generateImageVariants(
  sourcePath,
  outputDirectory,
  widths,
) {
  await mkdir(outputDirectory, { recursive: true });
  const fileName = path.basename(sourcePath, path.extname(sourcePath));

  await Promise.all(
    widths.map((width) =>
      sharp(sourcePath)
        .resize(width, width, { fit: "inside", withoutEnlargement: true })
        .webp(WEBP_OPTIONS)
        .toFile(path.join(outputDirectory, `${fileName}-${width}.webp`)),
    ),
  );
}

export async function mapConcurrent(values, concurrency, operation) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const value = values[nextIndex++];
        await operation(value);
      }
    },
  );
  await Promise.all(workers);
}

export async function removeUnexpectedWebpAssets(
  assetDirectory,
  expectedFileNames,
) {
  const staleFileNames = (await readdir(assetDirectory)).filter(
    (fileName) =>
      fileName.endsWith(".webp") && !expectedFileNames.has(fileName),
  );
  await Promise.all(
    staleFileNames.map((fileName) =>
      rm(path.join(assetDirectory, fileName), { force: true }),
    ),
  );
}

export async function writeAssetVersionManifest(
  assetDirectories,
  manifestPath,
) {
  const manifest = await assetVersionManifest(assetDirectories);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function assetVersionManifest(assetDirectories) {
  const hash = createHash("sha256");
  const buildables = [];
  for (const assetDirectory of assetDirectories) {
    const fileNames = (await readdir(assetDirectory))
      .filter((fileName) => fileName.endsWith(".webp"))
      .sort();
    for (const fileName of fileNames) {
      hash.update(fileName);
      hash.update(await readFile(path.join(assetDirectory, fileName)));
      if (path.basename(assetDirectory) === "buildables") {
        const descriptorId = fileName.match(/^(.*)-(?:128|256)\.webp$/)?.[1];
        if (descriptorId && !buildables.includes(descriptorId)) {
          buildables.push(descriptorId);
        }
      }
    }
  }
  return {
    buildables: buildables.sort(),
    version: hash.digest("hex").slice(0, 12),
  };
}
