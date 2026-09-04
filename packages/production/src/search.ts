import {
  LOGISTICS_BUILDABLES,
  PRODUCTION_MACHINES,
  RESOURCE_EXTRACTORS,
  SPECIAL_BUILDABLES,
} from "./data/buildables";
import { RECIPES, findDescriptor, resourcesForExtractor } from "./catalog";
import type { Buildable, Descriptor, Recipe } from "./types";

type SearchDocument<T> = Readonly<{
  haystack: string;
  value: T;
}>;

type RecipeSearchDocument = Readonly<{
  haystack: string;
  inputNames: readonly string[];
  name: string;
  outputNames: readonly string[];
  recipe: Recipe;
}>;

function normalize(value: string) {
  return value.toLocaleLowerCase();
}

function normalizeQuery(query: string) {
  const value = normalize(query).trim();
  return { terms: value.split(/\s+/).filter(Boolean), value };
}

function createBuildableDocuments<T extends Buildable>(
  buildables: readonly T[],
  categoryKeywords: readonly string[],
) {
  return buildables
    .map((buildable): SearchDocument<T> => ({
      haystack: normalize(
        [
          buildable.name,
          buildable.id,
          ...categoryKeywords,
          ...(buildable.searchTerms ?? []),
        ].join(" "),
      ),
      value: buildable,
    }))
    .toSorted((left, right) => left.value.name.localeCompare(right.value.name));
}

const machineDocuments = createBuildableDocuments(PRODUCTION_MACHINES, [
  "production",
  "machine",
]);
const extractorDocuments = createBuildableDocuments(RESOURCE_EXTRACTORS, [
  "production",
  "resource",
  "extraction",
  "extractor",
  "miner",
]);
const logisticsDocuments = createBuildableDocuments(LOGISTICS_BUILDABLES, [
  "logistics",
  "conveyor",
  "pipeline",
]);
const specialDocuments = createBuildableDocuments(SPECIAL_BUILDABLES, [
  "special",
  "sink",
]);
const machineHaystacksById = new Map(
  PRODUCTION_MACHINES.map((machine) => [
    machine.id,
    normalize(`${machine.name} ${machine.id}`),
  ]),
);

const recipeDocuments = RECIPES.map((recipe) => {
  const inputNames = recipe.inputs.map(({ itemId }) =>
    normalize(findDescriptor(itemId)?.name ?? ""),
  );
  const outputNames = recipe.outputs.map(({ itemId }) =>
    normalize(findDescriptor(itemId)?.name ?? ""),
  );
  return {
    haystack: normalize(
      [
        recipe.name,
        recipe.id,
        recipe.alternate ? "alternate" : "standard",
        ...inputNames,
        ...outputNames,
      ].join(" "),
    ),
    inputNames,
    name: normalize(recipe.name),
    outputNames,
    recipe,
  } satisfies RecipeSearchDocument;
});

const recipeDocumentsByMachineId = new Map(
  [
    ...Map.groupBy(
      recipeDocuments.flatMap((document) =>
        document.recipe.machineIds.map((machineId) => ({
          document,
          machineId,
        })),
      ),
      ({ machineId }) => machineId,
    ),
  ].map(([machineId, entries]) => [
    machineId,
    entries.map(({ document }) => document),
  ]),
);
const recipeDocumentsByOutputItemId = new Map(
  [
    ...Map.groupBy(
      recipeDocuments.flatMap((document) =>
        document.recipe.outputs.map(({ itemId }) => ({ document, itemId })),
      ),
      ({ itemId }) => itemId,
    ),
  ].map(([itemId, entries]) => [
    itemId,
    entries.map(({ document }) => document),
  ]),
);
const resourceDocumentsByExtractorId = new Map(
  RESOURCE_EXTRACTORS.map((extractor) => [
    extractor.id,
    resourcesForExtractor(extractor.id).map(
      (resource): SearchDocument<Descriptor> => ({
        haystack: normalize(
          `${resource.name} ${resource.id} ${extractor.name}`,
        ),
        value: resource,
      }),
    ),
  ]),
);

function searchDocuments<T>(
  documents: readonly SearchDocument<T>[],
  query: string,
) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery.value) return documents.map(({ value }) => value);
  return documents
    .filter(
      ({ haystack }) =>
        haystack.includes(normalizedQuery.value) ||
        normalizedQuery.terms.every((term) => haystack.includes(term)),
    )
    .map(({ value }) => value);
}

function recipeScore(
  document: RecipeSearchDocument,
  machineId: string | undefined,
  query: ReturnType<typeof normalizeQuery>,
) {
  if (!query.value) return 1;
  if (document.name === query.value) return 100;
  if (document.name.startsWith(query.value)) return 90;
  if (document.name.includes(query.value)) return 80;
  if (document.outputNames.some((name) => name.includes(query.value))) {
    return 60;
  }
  if (document.inputNames.some((name) => name.includes(query.value))) {
    return 40;
  }

  const machineHaystack = machineHaystacksById.get(machineId ?? "") ?? "";
  return query.terms.every(
    (term) =>
      document.haystack.includes(term) || machineHaystack.includes(term),
  )
    ? 10
    : 0;
}

export function searchMachines(query: string) {
  return searchDocuments(machineDocuments, query);
}

export function searchExtractors(query: string) {
  return searchDocuments(extractorDocuments, query);
}

export function searchLogistics(query: string) {
  return searchDocuments(logisticsDocuments, query);
}

export function searchSpecialBuildables(query: string) {
  return searchDocuments(specialDocuments, query);
}

export function searchRecipes(
  query: string,
  scope?: Readonly<{ machineId?: string; outputItemId?: string }>,
) {
  const normalizedQuery = normalizeQuery(query);
  const documents = scope?.machineId
    ? (recipeDocumentsByMachineId.get(scope.machineId) ?? [])
    : scope?.outputItemId
      ? (recipeDocumentsByOutputItemId.get(scope.outputItemId) ?? [])
      : recipeDocuments;

  return documents
    .map((document, index) => ({
      document,
      index,
      score: recipeScore(
        document,
        scope?.machineId ? scope.machineId : document.recipe.machineIds[0],
        normalizedQuery,
      ),
    }))
    .filter(({ score }) => score > 0)
    .toSorted(
      (left, right) => right.score - left.score || left.index - right.index,
    )
    .map(({ document }) => document.recipe);
}

export function recipeCountForMachine(machineId: string) {
  return recipeDocumentsByMachineId.get(machineId)?.length ?? 0;
}

export function searchExtractorResources(extractorId: string, query: string) {
  return searchDocuments(
    resourceDocumentsByExtractorId.get(extractorId) ?? [],
    query,
  );
}
