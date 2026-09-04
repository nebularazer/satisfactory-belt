import { PRODUCTION_MACHINES, RESOURCE_EXTRACTORS } from "./buildable-catalog";
import type { ProductionItem, ProductionRecipe } from "./catalog-types";
import itemData from "./items.json";
import recipeData from "./recipes.json";

export * from "./buildable-catalog";
export type * from "./catalog-types";

export const PRODUCTION_ITEMS = itemData as readonly ProductionItem[];
export const PRODUCTION_RECIPES = recipeData as readonly ProductionRecipe[];

const machinesById = new Map(
  PRODUCTION_MACHINES.map((machine) => [machine.id, machine]),
);
const extractorsById = new Map(
  RESOURCE_EXTRACTORS.map((extractor) => [extractor.id, extractor]),
);
const itemsById = new Map(PRODUCTION_ITEMS.map((item) => [item.id, item]));
const recipesById = new Map(
  PRODUCTION_RECIPES.map((recipe) => [recipe.id, recipe]),
);
const recipesByMachineId = new Map(
  [
    ...Map.groupBy(
      PRODUCTION_RECIPES.flatMap((recipe) =>
        recipe.machineIds.map((machineId) => ({ machineId, recipe })),
      ),
      ({ machineId }) => machineId,
    ),
  ].map(([machineId, entries]) => [
    machineId,
    entries.map(({ recipe }) => recipe),
  ]),
);
const recipesByOutputItemId = new Map(
  [
    ...Map.groupBy(
      PRODUCTION_RECIPES.flatMap((recipe) =>
        recipe.outputs.map(({ itemId }) => ({ itemId, recipe })),
      ),
      ({ itemId }) => itemId,
    ),
  ].map(([itemId, entries]) => [
    itemId,
    entries
      .map(({ recipe }) => recipe)
      .toSorted(
        (left, right) =>
          Number(left.alternate) - Number(right.alternate) ||
          left.name.localeCompare(right.name),
      ),
  ]),
);

export function productionMachine(machineId: string) {
  return machinesById.get(machineId);
}

export function resourceExtractor(extractorId: string) {
  return extractorsById.get(extractorId);
}

export function resourcesForExtractor(extractorId: string) {
  return (
    extractorsById.get(extractorId)?.resourceItemIds.flatMap((itemId) => {
      const item = itemsById.get(itemId);
      return item ? [item] : [];
    }) ?? []
  );
}

export function productionItem(itemId: string) {
  return itemsById.get(itemId);
}

export function productionRecipe(recipeId: string) {
  return recipesById.get(recipeId);
}

export function recipesForMachine(machineId: string) {
  return recipesByMachineId.get(machineId) ?? [];
}

export function recipesProducing(itemId: string) {
  return recipesByOutputItemId.get(itemId) ?? [];
}
