import { RECIPES, findDescriptor } from "./catalog";
import { RESOURCE_EXTRACTORS } from "./data/buildables";
import type {
  ExtractionProductionProcess,
  ProductionProcess,
  RecipeProductionProcess,
} from "./types";

const recipeProcesses: readonly RecipeProductionProcess[] = RECIPES.map(
  (recipe) => ({
    buildableIds: recipe.machineIds,
    id: recipe.id,
    inputItemIds: [...new Set(recipe.inputs.map(({ itemId }) => itemId))],
    kind: "recipe",
    name: recipe.name,
    outputItemIds: [...new Set(recipe.outputs.map(({ itemId }) => itemId))],
    recipeId: recipe.id,
  }),
);

const extractorsByResourceItemId = Map.groupBy(
  RESOURCE_EXTRACTORS.flatMap((extractor) =>
    extractor.resourceItemIds.map((resourceItemId) => ({
      extractor,
      resourceItemId,
    })),
  ),
  ({ resourceItemId }) => resourceItemId,
);

const extractionProcesses: readonly ExtractionProductionProcess[] = [
  ...extractorsByResourceItemId,
]
  .map(([resourceItemId, entries]) => ({
    buildableIds: entries.map(({ extractor }) => extractor.id),
    id: `extraction:${resourceItemId}`,
    inputItemIds: [] as const,
    kind: "extraction" as const,
    name: `${findDescriptor(resourceItemId)?.name ?? resourceItemId} Extraction`,
    outputItemIds: [resourceItemId] as const,
    resourceItemId,
  }))
  .toSorted((left, right) => left.name.localeCompare(right.name));

const productionProcesses: readonly ProductionProcess[] = [
  ...recipeProcesses,
  ...extractionProcesses,
];
const productionProcessesById = new Map(
  productionProcesses.map((process) => [process.id, process]),
);
const productionProcessesByBuildableId = new Map(
  [
    ...Map.groupBy(
      productionProcesses.flatMap((process) =>
        process.buildableIds.map((buildableId) => ({ buildableId, process })),
      ),
      ({ buildableId }) => buildableId,
    ),
  ].map(([buildableId, entries]) => [
    buildableId,
    entries.map(({ process }) => process),
  ]),
);

export function findProductionProcess(processId: string) {
  return productionProcessesById.get(processId);
}

export function listProductionProcesses() {
  return productionProcesses;
}

export function productionProcessesForBuildable(buildableId: string) {
  return productionProcessesByBuildableId.get(buildableId) ?? [];
}
