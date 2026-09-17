import type { GameCatalog, Ingredient } from "@satisfactory-belt/game-data";

import { facilityProduction } from "./facilities";
import { resolveFactoryNode } from "./index";
import type { FactoryNode } from "./index";
import { scopedMachines } from "./machine-settings";
import type { MachineScope } from "./machine-settings";

export type MaterialRate = Readonly<{ itemId: string; perMinute: number | null }>;
export type Production = Readonly<{
  inputs: readonly MaterialRate[];
  outputs: readonly MaterialRate[];
  unavailableReason: string | null;
}>;

/** Configured rates, independent of network supply and throughput. Null means unknown, never zero. */
export function resolveProduction(
  node: FactoryNode,
  catalog: GameCatalog,
  scope: MachineScope = "all",
): Production {
  resolveFactoryNode(node, catalog);
  if (node.kind === "logistics" || node.kind === "sink")
    return {
      inputs: [],
      outputs: [],
      unavailableReason: "Rates depend on connected material flow.",
    };
  const members = scopedMachines(node, scope);
  if (node.kind === "facility") return facilityProduction({ ...node, machines: members }, catalog);
  if (node.kind === "extractor")
    return {
      inputs: [],
      outputs: [
        {
          itemId: node.resourceId,
          perMinute:
            catalog.extractors[node.extractorId]!.baseRate === undefined
              ? null
              : members.reduce(
                  (sum, member) =>
                    sum +
                    ((catalog.extractors[node.extractorId]!.baseRate! * member.clockPercent) /
                      100) *
                      (catalog.extractors[node.extractorId]!.hasPurity ? (member.purity ?? 1) : 1),
                  0,
                ),
        },
      ],
      unavailableReason:
        catalog.extractors[node.extractorId]!.baseRate === undefined
          ? "Extraction rates are not available yet."
          : null,
    };
  if (node.kind === "fixed-producer") {
    const producer = catalog.fixedProducers[node.producerId]!;
    return {
      inputs: [],
      outputs: rates(producer.products, (members.length * 60) / producer.durationSeconds),
      unavailableReason: null,
    };
  }
  const recipe = catalog.recipes[node.recipeId]!;
  const machine = catalog.machines[node.machineId]!;
  const cycles = (60 / recipe.durationSeconds) * machine.manufacturingSpeed;
  const inputMultiplier = members.reduce(
    (sum, member) => sum + (cycles * member.clockPercent) / 100,
    0,
  );
  const outputMultiplier = members.reduce(
    (sum, member) =>
      sum +
      ((cycles * member.clockPercent) / 100) *
        (machine.productionBoost.base + member.sloopsUsed * machine.productionBoost.perSloop),
    0,
  );
  return {
    inputs: rates(recipe.ingredients, inputMultiplier),
    outputs: rates(recipe.products, outputMultiplier),
    unavailableReason: null,
  };
}

function rates(ingredients: readonly Ingredient[], multiplier: number): MaterialRate[] {
  const totals = new Map<string, number>();
  for (const { itemId, amount } of ingredients)
    totals.set(itemId, (totals.get(itemId) ?? 0) + amount * multiplier);
  return [...totals].map(([itemId, perMinute]) => ({ itemId, perMinute }));
}
