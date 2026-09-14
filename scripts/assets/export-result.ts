/** The upstream process can exit zero even when some textures failed. */
export function reportedPngHashes(
  report: unknown,
  manifest: { assetPath: string; objectName: string }[],
): Map<string, string> {
  if (
    !record(report) ||
    report.total !== manifest.length ||
    report.ok !== manifest.length ||
    report.failed !== 0 ||
    !Array.isArray(report.assets) ||
    report.assets.length !== manifest.length
  )
    throw new Error("Exporter reported incomplete results; see icons/extraction-result.json.");

  const expected = new Map(manifest.map((entry) => [entry.assetPath, entry.objectName]));
  const hashes = new Map<string, string>();
  for (const asset of report.assets) {
    if (
      !record(asset) ||
      typeof asset.assetPath !== "string" ||
      typeof asset.objectName !== "string" ||
      asset.ok !== true ||
      !expected.has(asset.assetPath) ||
      hashes.has(asset.assetPath) ||
      asset.objectName !== expected.get(asset.assetPath) ||
      !record(asset.sizes)
    )
      throw new Error("Exporter reported an unexpected or failed asset.");
    const png = asset.sizes["256"];
    if (
      !record(png) ||
      png.path !== `256/${asset.objectName}.png` ||
      typeof png.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(png.sha256)
    )
      throw new Error(`Exporter reported an invalid PNG for ${asset.assetPath}.`);
    hashes.set(asset.assetPath, png.sha256);
  }
  return hashes;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
