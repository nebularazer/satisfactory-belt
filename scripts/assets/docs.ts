import { createHash } from "node:crypto";

export interface Icon {
  className: string;
  source: string;
  assetPath: string;
  objectName: string;
  file: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** CommunityResources JSON is UTF-16LE with a BOM; also accept UTF-8 exports. */
export function decodeJson(bytes: Uint8Array): unknown {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  return JSON.parse(new TextDecoder(encoding, { fatal: true }).decode(bytes));
}

export function collectIcons(docs: unknown): Icon[] {
  if (!Array.isArray(docs) || docs.length === 0) {
    throw new Error("Expected a nonempty CommunityResources Docs array.");
  }

  const icons: Icon[] = [];
  for (const group of docs) {
    if (!record(group) || typeof group.NativeClass !== "string" || !Array.isArray(group.Classes)) {
      throw new Error("Expected NativeClass and Classes in every Docs group.");
    }
    for (const entry of group.Classes) {
      if (!record(entry) || typeof entry.ClassName !== "string") {
        throw new Error(`Missing ClassName in ${group.NativeClass}.`);
      }
      // Export one useful resolution per descriptor, including building descriptors.
      const source = [entry.mPersistentBigIcon, entry.mSmallIcon].find(
        (value) => value !== undefined && value !== "" && value !== "None" && value !== null,
      );
      if (source === undefined) continue;
      if (typeof source !== "string") {
        throw new Error(`Invalid icon reference for ${entry.ClassName}.`);
      }
      // Accept Unreal's Texture2D'/Game/Package.Object' and bare /Game/Package.Object forms.
      const match =
        /(?:^|[\s'"])(\/Game\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)['"]?$/.exec(
          source,
        );
      if (!match?.[1] || !match[2]) {
        throw new Error(`Unsupported icon reference for ${entry.ClassName}: ${source}`);
      }
      const assetPath = `${match[1]}.${match[2]}`;
      // The exporter uses objectName as a flat filename; different packages can share a name.
      const objectName = `${match[2]}-${createHash("sha256").update(assetPath).digest("hex").slice(0, 12)}`;
      icons.push({
        className: entry.ClassName,
        source,
        assetPath,
        objectName,
        file: `icons/256/${objectName}.png`,
      });
    }
  }
  return icons.toSorted((a, b) => a.className.localeCompare(b.className, "en"));
}
