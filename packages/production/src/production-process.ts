import { RECIPES, findDescriptor } from "./catalog";
import { POWER_GENERATORS, RESOURCE_EXTRACTORS } from "./data/buildables";
import type {
  ExtractionProductionProcess,
  PowerGenerationProductionProcess,
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

const powerGenerationProcesses: readonly PowerGenerationProductionProcess[] =
  POWER_GENERATORS.flatMap(
    (generator): readonly PowerGenerationProductionProcess[] => {
      if (generator.generatorKind === "geothermal") {
        return [
          {
            buildableIds: [generator.id],
            generationKind: "geothermal",
            id: `power-generation:${generator.id}`,
            inputItemIds: [],
            kind: "power-generation",
            name: generator.name,
            outputItemIds: [],
          } as const,
        ];
      }

      return generator.fuels.map((fuel) => ({
        buildableIds: [generator.id] as const,
        fuelItemId: fuel.itemId,
        generationKind: "fuel" as const,
        id: `power-generation:${generator.id}:${fuel.itemId}`,
        inputItemIds: [
          fuel.itemId,
          ...(fuel.supplemental ? [fuel.supplemental.itemId] : []),
        ],
        kind: "power-generation" as const,
        name: `${generator.name}: ${findDescriptor(fuel.itemId)?.name ?? fuel.itemId}`,
        outputItemIds: fuel.byproduct ? [fuel.byproduct.itemId] : [],
      }));
    },
  );

const productionProcesses: readonly ProductionProcess[] = [
  ...recipeProcesses,
  ...extractionProcesses,
  ...powerGenerationProcesses,
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
