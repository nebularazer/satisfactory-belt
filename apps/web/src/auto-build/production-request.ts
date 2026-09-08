import {
  findDescriptor,
  findRecipe,
  listProductionProcesses,
  recipesProducing,
} from "@satisfactory-belt/production";
import type {
  PlanningRequest,
  RequestedOutput,
} from "@satisfactory-belt/planning";

export type AutoBuildSettings = Readonly<{
  outputs: readonly RequestedOutput[];
  allowedAlternateIds: readonly string[];
  pinnedRecipes: Readonly<Record<string, string>>;
}>;

/** Translate user recipe choices into the solver's ordered candidate set. */
export function productionRequest(
  settings: AutoBuildSettings,
): PlanningRequest {
  if (!settings.outputs.length) throw new Error("Add at least one output.");
  const outputs = new Map<string, number>();
  for (const output of settings.outputs) {
    if (
      !findDescriptor(output.itemId) ||
      !recipesProducing(output.itemId).length
    )
      throw new Error("Choose an item that can be produced by a recipe.");
    if (!Number.isFinite(output.ratePerMinute) || output.ratePerMinute <= 0)
      throw new Error("Output rates must be greater than zero.");
    outputs.set(
      output.itemId,
      (outputs.get(output.itemId) ?? 0) + output.ratePerMinute,
    );
  }
  const allowed = new Set(settings.allowedAlternateIds);
  for (const id of allowed) {
    if (!findRecipe(id)?.alternate)
      throw new Error("An alternative recipe is no longer available.");
  }
  const pins = Object.entries(settings.pinnedRecipes);
  for (const [itemId, recipeId] of pins) {
    if (
      !findRecipe(recipeId)?.outputs.some((output) => output.itemId === itemId)
    )
      throw new Error("A required recipe does not produce its selected item.");
    allowed.add(recipeId);
  }
  const processes = listProductionProcesses().filter(
    (process) =>
      process.kind !== "consumption" &&
      (process.kind !== "recipe" ||
        !findRecipe(process.recipeId)?.alternate ||
        allowed.has(process.id)) &&
      pins.every(
        ([itemId, recipeId]) =>
          !process.outputItemIds.some((outputId) => outputId === itemId) ||
          process.id === recipeId,
      ),
  );
  if (
    pins.some(
      ([, recipeId]) => !processes.some((process) => process.id === recipeId),
    )
  )
    throw new Error(
      "Required recipes conflict because they produce the same item. Choose compatible recipes.",
    );
  // Enabled alternatives get first consideration; pins exclude competing recipes.
  const priority = (id: string) =>
    pins.some(([, recipeId]) => recipeId === id) ? 0 : allowed.has(id) ? 1 : 2;
  return {
    outputs: [...outputs].map(([itemId, ratePerMinute]) => ({
      itemId,
      ratePerMinute,
    })),
    allowedProcessIds: processes
      .toSorted(
        (a, b) =>
          priority(a.id) - priority(b.id) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      )
      .map((process) => process.id),
  };
}
