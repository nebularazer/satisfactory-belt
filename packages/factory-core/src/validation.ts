import type { GameCatalog } from "@satisfactory-belt/game-data";

import { validateFacility } from "./facilities";
import type { FactoryNode } from "./index";
import { validateMachineMembers } from "./machine-settings";
import { validateSplitterProgram } from "./splitters";

/** Domain validation must not require icons, labels or canvas geometry. */
export function validateFactoryNode(node: FactoryNode, catalog: GameCatalog): void {
  if (!node.id || !Number.isFinite(node.x) || !Number.isFinite(node.y))
    throw new Error("Invalid node identity or position.");
  if (node.kind === "logistics") {
    const part = catalog.logistics[node.partId];
    if (!part) throw new Error("Missing logistics part.");
    validateSplitterProgram(part.kind, node.program, catalog);
    return;
  }
  validateMachineMembers(node, catalog);
  switch (node.kind) {
    case "manufacturing": {
      const recipe = catalog.recipes[node.recipeId];
      if (!catalog.machines[node.machineId] || !recipe?.machineIds.includes(node.machineId))
        throw new Error("Incompatible machine or recipe.");
      break;
    }
    case "extractor":
      if (!catalog.extractors[node.extractorId]?.resourceIds.includes(node.resourceId))
        throw new Error("Incompatible extractor or resource.");
      break;
    case "fixed-producer":
      if (!catalog.fixedProducers[node.producerId]) throw new Error("Missing producer.");
      break;
    case "sink":
      validateSinkRate(node, catalog);
      if (!catalog.sinks[node.sinkId]) throw new Error("Missing Sink.");
      break;
    case "facility":
      validateFacility(node, catalog);
      break;
    default:
      throw new Error("Unknown node kind.");
  }
}

export function validateSinkRate(
  node: Extract<FactoryNode, { kind: "sink" }>,
  catalog: GameCatalog,
): void {
  if (
    node.sinkRate &&
    (!catalog.items[node.sinkRate.itemId]?.sinkable ||
      !Number.isFinite(node.sinkRate.perMinute) ||
      node.sinkRate.perMinute <= 0 ||
      node.sinkRate.perMinute > 1e9)
  )
    throw new Error(
      "Sinking rate requires a sinkable item and a positive rate up to 1 billion/min.",
    );
}
