import {
  createNode,
  findDescriptor,
  findResourceExtractor,
  listProductionProcesses,
  type ResourcePurity,
} from "@satisfactory-belt/production";
import type { CanvasDocument } from "@/canvas/document";

export type ResourceNodeBudget = Readonly<{
  itemId: string;
  buildableId: string;
  impure: number;
  normal: number;
  pure: number;
  maximumClockPercent: number;
}>;

export const nodeResources = listProductionProcesses()
  .filter(
    (process) =>
      process.kind === "extraction" &&
      process.buildableIds.some((id) => {
        const extractor = findResourceExtractor(id);
        return (
          extractor &&
          !("resourceWell" in extractor) &&
          extractor.usesResourcePurity
        );
      }),
  )
  .map((process) => ({
    itemId: process.outputItemIds[0]!,
    name: findDescriptor(process.outputItemIds[0]!)!.name,
    processId: process.id,
    buildableIds: process.buildableIds,
  }))
  .toSorted((a, b) => a.name.localeCompare(b.name));

const purities = ["pure", "normal", "impure"] as const;

function rateFor(
  budget: ResourceNodeBudget,
  purity: ResourcePurity,
  clock = budget.maximumClockPercent,
) {
  const node = createNode({
    kind: "process",
    id: "capacity",
    processId: `extraction:${budget.itemId}`,
    buildableId: budget.buildableId,
    instances: [
      { id: "capacity:1", clockSpeedPercent: clock, resourcePurity: purity },
    ],
  });
  if (node.profile.materials.kind !== "calculated")
    throw new Error("Invalid resource extractor.");
  return node.profile.materials.outputs[0]!.ratePerMinute;
}

export function resourceNodeCapacity(budget: ResourceNodeBudget) {
  const resource = nodeResources.find(
    (resource) => resource.itemId === budget.itemId,
  );
  if (!resource?.buildableIds.includes(budget.buildableId))
    throw new Error("Choose a compatible extractor for each resource.");
  if (
    !Number.isFinite(budget.maximumClockPercent) ||
    budget.maximumClockPercent < 1 ||
    budget.maximumClockPercent > 250
  )
    throw new Error("Extractor clocks must be between 1% and 250%.");
  if (
    purities.some(
      (purity) =>
        !Number.isSafeInteger(budget[purity]) ||
        budget[purity] < 0 ||
        budget[purity] > 10000,
    )
  )
    throw new Error("Node counts must be whole numbers between 0 and 10,000.");
  return purities.reduce(
    (sum, purity) => sum + budget[purity] * rateFor(budget, purity),
    0,
  );
}

export function validateResourceNodes(budgets: readonly ResourceNodeBudget[]) {
  if (new Set(budgets.map((budget) => budget.itemId)).size !== budgets.length)
    throw new Error("List each resource once, with its counts by purity.");
  budgets.forEach(resourceNodeCapacity);
}

/** Preserve the generated topology while allocating real extractors within the node budget. */
export function applyResourceNodes(
  document: CanvasDocument,
  budgets: readonly ResourceNodeBudget[],
): CanvasDocument {
  validateResourceNodes(budgets);
  const nodes = document.nodes.map((node) => {
    const configuration = node.configuration;
    if (configuration.kind !== "process") return node;
    const resource = nodeResources.find(
      (resource) => resource.processId === configuration.processId,
    );
    if (!resource) return node;
    const resolved = createNode(configuration);
    if (resolved.profile.materials.kind !== "calculated") return node;
    const required = resolved.profile.materials.outputs[0]!.ratePerMinute;
    const budget = budgets.find((budget) => budget.itemId === resource.itemId);
    const capacity = budget ? resourceNodeCapacity(budget) : 0;
    if (!budget || required > capacity + 0.0001) {
      const format = (rate: number) =>
        new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
          rate,
        );
      const unit =
        findDescriptor(resource.itemId)?.form === "solid"
          ? "items/min"
          : "m³/min";
      throw new Error(
        `${resource.name} needs ${format(required)} ${unit}; your listed nodes can supply ${format(capacity)} ${unit}. Add nodes, increase the extractor tier or clock, or change the outputs or recipes.`,
      );
    }
    let remaining = required;
    const selected = [];
    let baseCapacity = 0;
    for (const purity of purities) {
      const baseRate = rateFor(budget, purity, 100);
      if (required < baseRate / 100 - 0.000001) continue;
      const maximum = rateFor(budget, purity);
      for (
        let index = 0;
        index < budget[purity] && remaining > 0.000001;
        index++
      ) {
        selected.push({
          id: `${configuration.id}:instance-${selected.length + 1}`,
          resourcePurity: purity,
        });
        baseCapacity += baseRate;
        remaining -= maximum;
      }
    }
    const clock = (required / baseCapacity) * 100;
    if (
      !selected.length ||
      clock < 1 - 0.000001 ||
      clock > budget.maximumClockPercent + 0.000001
    )
      throw new Error(
        `${resource.name} cannot match the requested rate within your extractor clock limits. Adjust the rate, nodes, or extractor tier.`,
      );
    const instances = selected.map((instance) => ({
      ...instance,
      clockSpeedPercent: Math.max(
        1,
        Math.min(budget.maximumClockPercent, clock),
      ),
    }));
    const allocated = createNode({
      ...configuration,
      buildableId: budget.buildableId,
      instances,
    }).configuration;
    return { ...node, configuration: allocated };
  });
  return { ...document, nodes };
}
