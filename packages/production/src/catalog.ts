import {
  BUILDABLES,
  POWER_GENERATORS,
  PRODUCTION_MACHINES,
  RESOURCE_EXTRACTORS,
} from "./data/buildables";
import descriptorData from "./data/items.json";
import recipeData from "./data/recipes.json";
import type { Descriptor, Recipe } from "./types";

export const DESCRIPTORS = descriptorData as readonly Descriptor[];
export const RECIPES = recipeData as readonly Recipe[];

const buildablesById = new Map(
  BUILDABLES.map((buildable) => [buildable.id, buildable]),
);
const machinesById = new Map(
  PRODUCTION_MACHINES.map((machine) => [machine.id, machine]),
);
const extractorsById = new Map(
  RESOURCE_EXTRACTORS.map((extractor) => [extractor.id, extractor]),
);
const powerGeneratorsById = new Map(
  POWER_GENERATORS.map((generator) => [generator.id, generator]),
);
const descriptorsById = new Map(
  DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]),
);
const recipesById = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));
const recipesByMachineId = new Map(
  [
    ...Map.groupBy(
      RECIPES.flatMap((recipe) =>
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
      RECIPES.flatMap((recipe) =>
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

export function findBuildable(buildableId: string) {
  return buildablesById.get(buildableId);
}

export function listBuildables() {
  return BUILDABLES;
}

export function findProductionMachine(machineId: string) {
  return machinesById.get(machineId);
}

export function findResourceExtractor(extractorId: string) {
  return extractorsById.get(extractorId);
}

export function findPowerGenerator(generatorId: string) {
  return powerGeneratorsById.get(generatorId);
}

export function resourcesForExtractor(extractorId: string) {
  return (
    extractorsById.get(extractorId)?.resourceItemIds.flatMap((itemId) => {
      const descriptor = descriptorsById.get(itemId);
      return descriptor ? [descriptor] : [];
    }) ?? []
  );
}

export function findDescriptor(descriptorId: string) {
  return descriptorsById.get(descriptorId);
}

export function findRecipe(recipeId: string) {
  return recipesById.get(recipeId);
}

export function recipesForMachine(machineId: string) {
  return recipesByMachineId.get(machineId) ?? [];
}

export function recipesProducing(descriptorId: string) {
  return recipesByOutputItemId.get(descriptorId) ?? [];
}
