import type { NodeConfiguration } from "@satisfactory-belt/factory-core";
import type { SearchEntry, SearchScope } from "@satisfactory-belt/game-data/search";

/** Alternatives keep the selected machine when supported, otherwise use their displayed default. */
export function catalogConfiguration(entry: SearchEntry, scope?: SearchScope): NodeConfiguration {
  switch (entry.kind) {
    case "recipe": {
      const machineId =
        scope?.kind === "machine" && entry.machineIds.includes(scope.id)
          ? scope.id
          : entry.machineIds[0];
      if (!machineId) throw new Error("This recipe has no supported machine.");
      return { kind: "manufacturing", recipeId: entry.entityId, machineId };
    }
    case "resource":
      if (!entry.extractorId) throw new Error("This resource has no extractor.");
      return { kind: "extractor", extractorId: entry.extractorId, resourceId: entry.entityId };
    case "logistics":
      return { kind: "logistics", partId: entry.entityId };
    case "sink":
      return { kind: "sink", sinkId: entry.entityId };
    case "fixed-producer":
      return { kind: "fixed-producer", producerId: entry.entityId };
    default:
      throw new Error("Choose a recipe or resource first.");
  }
}

export function eligibleCatalogEntries(
  index: readonly SearchEntry[],
  canPlace: (configuration: NodeConfiguration) => boolean,
): ReadonlySet<string> {
  const allowed = new Set<string>();
  const machines = new Set<string>();
  const extractors = new Set<string>();
  for (const entry of index) {
    if (entry.kind === "machine" || entry.kind === "extractor") continue;
    if (entry.kind === "recipe") {
      for (const machineId of entry.machineIds) {
        if (canPlace(catalogConfiguration(entry, { kind: "machine", id: machineId }))) {
          allowed.add(entry.id);
          machines.add(machineId);
        }
      }
    } else if (canPlace(catalogConfiguration(entry))) {
      allowed.add(entry.id);
      if (entry.extractorId) extractors.add(entry.extractorId);
    }
  }
  for (const entry of index) {
    if (
      (entry.kind === "machine" && machines.has(entry.entityId)) ||
      (entry.kind === "extractor" && extractors.has(entry.entityId))
    )
      allowed.add(entry.id);
  }
  return allowed;
}
