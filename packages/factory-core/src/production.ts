import type { GameCatalog, Ingredient } from "@satisfactory-belt/game-data";

import { resolveFactoryNode } from "./index";
import type { FactoryNode } from "./index";
import {
  machineCapabilities,
  resizeMachineGroup,
  scopedMachines,
  setMachineSetting,
} from "./machine-settings";
import type { MachineGroup, MachineScope } from "./machine-settings";

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
  if (node.kind === "extractor")
    return {
      inputs: [],
      outputs: [{ itemId: node.resourceId, perMinute: null }],
      unavailableReason: "Extraction rates are not available yet.",
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

/** Output is derived, not a stored constraint: direct count/clock edits change it again. */
export function setDesiredOutput(
  node: MachineGroup,
  catalog: GameCatalog,
  scope: MachineScope,
  itemId: string,
  perMinute: number,
  createId: () => string,
): MachineGroup {
  if (node.kind !== "manufacturing" || !machineCapabilities(node, catalog).clock)
    throw new Error("Desired output requires a machine with adjustable clock speed.");
  if (!Number.isFinite(perMinute) || perMinute <= 0)
    throw new Error("Desired output must be greater than zero.");
  const current = resolveProduction(node, catalog, scope).outputs.find(
    (rate) => rate.itemId === itemId,
  );
  if (!current) throw new Error("Choose an item produced by this recipe.");
  // Avoid rewriting mixed clocks or adding history for a displayed value's rounding noise.

  if (current.perMinute !== null && close(perMinute, current.perMinute)) return node;
  const recipe = catalog.recipes[node.recipeId]!;
  const machine = catalog.machines[node.machineId]!;
  const amount = recipe.products
    .filter((entry) => entry.itemId === itemId)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const baseRate = ((amount * 60) / recipe.durationSeconds) * machine.manufacturingSpeed;
  const capacity = (member: MachineGroup["machines"][number]) =>
    baseRate *
    (machine.productionBoost.base + member.sloopsUsed * machine.productionBoost.perSloop);
  if (scope !== "all") {
    const member = scopedMachines(node, scope)[0]!;
    return setMachineSetting(
      node,
      catalog,
      scope,
      "clockPercent",
      (perMinute / capacity(member)) * 100,
    );
  }

  // Keep a prefix of the current group, preserving identities and amplification settings.
  let count = 0;
  let total = 0;
  for (const member of node.machines) {
    count++;
    total += capacity(member);
    if (total >= perMinute || close(total, perMinute)) break;
  }
  if (total < perMinute && !close(total, perMinute)) {
    const extraCapacity = capacity(node.machines.at(-1)!);
    const needed = (perMinute - total) / extraCapacity;
    const extra = close(needed, Math.round(needed)) ? Math.round(needed) : Math.ceil(needed);
    count += extra;
    total += extra * extraCapacity;
  }
  const clock = (perMinute / total) * 100;
  if (clock < 1 && !close(clock, 1))
    throw new Error("This output is below the minimum 1% clock speed of one machine.");
  const resized = resizeMachineGroup(node, count, createId);
  return setMachineSetting(
    resized,
    catalog,
    "all",
    "clockPercent",
    Math.max(1, Math.min(100, clock)),
  );
}

function close(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-12;
}
