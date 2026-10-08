import type { RecipeUnlock, UnlockSchematic } from "@satisfactory-belt/game-data";

import { classId, parseUnreal } from "./unreal.ts";

/** Resolve automatic background grants to their player-visible milestone/research. */
export function parseRecipeUnlocks(
  classes: ReadonlyMap<string, { native: string; data: Record<string, unknown> }>,
  recipeIds: ReadonlySet<string>,
): Map<string, RecipeUnlock[]> {
  const schematics = new Map(
    [...classes]
      .filter(([, entry]) => entry.native === "FGSchematic")
      .map(([id, entry]) => [id, entry.data]),
  );
  const parents = new Map<string, string[]>();
  for (const [id, data] of schematics) {
    for (const unlock of records(data.mUnlocks)) {
      if (unlock.Class !== "BP_UnlockSchematic_C") continue;
      for (const child of references(unlock.mSchematics)) {
        if (!schematics.has(child)) throw new Error(`Missing unlock schematic ${child}.`);
        parents.set(child, [...(parents.get(child) ?? []), id]);
      }
    }
  }
  function visibleSources(id: string, path: ReadonlySet<string> = new Set()): string[] {
    if (path.has(id)) throw new Error(`Cyclic schematic unlock ${id}.`);
    const data = schematics.get(id)!;
    const sources = parents.get(id);
    if (data.mType !== "EST_Custom" || !sources?.length) return [id];
    return sources.flatMap((parent) => visibleSources(parent, new Set([...path, id])));
  }
  function schematic(id: string): UnlockSchematic {
    const data = schematics.get(id);
    if (!data) throw new Error(`Missing unlock schematic ${id}.`);
    if (typeof data.mDisplayName !== "string" || !data.mDisplayName.trim())
      throw new Error(`Missing schematic name ${id}.`);
    const kinds: Record<string, UnlockSchematic["kind"]> = {
      EST_Milestone: "milestone",
      EST_MAM: "research",
      EST_Alternate: "hard-drive",
      EST_Tutorial: "tutorial",
    };
    const kind =
      id === "Schematic_StartingRecipes_C"
        ? "starting"
        : (kinds[String(data.mType)] ?? (id.startsWith("Ficsmas_") ? "event" : "other"));
    const tier = Number(data.mTechTier);
    if (
      (kind === "milestone" || kind === "hard-drive") &&
      (!Number.isSafeInteger(tier) || tier < 0)
    )
      throw new Error(`Invalid schematic tier ${id}.`);
    return {
      id,
      name: data.mDisplayName,
      kind,
      ...(kind === "milestone" || (kind === "hard-drive" && tier > 0) ? { tier } : {}),
    };
  }
  function route(id: string): RecipeUnlock {
    return {
      ...schematic(id),
      requirements: records(schematics.get(id)!.mSchematicDependencies).map((dependency) => {
        if (dependency.Class !== "BP_SchematicPurchasedDependency_C")
          throw new Error(
            `Unsupported recipe unlock dependency ${String(dependency.Class)} in ${id}.`,
          );
        if (!["True", "False"].includes(String(dependency.mRequireAllSchematicsToBePurchased)))
          throw new Error(`Invalid schematic dependency mode in ${id}.`);
        return {
          all: dependency.mRequireAllSchematicsToBePurchased === "True",
          schematics: references(dependency.mSchematics).map(schematic),
        };
      }),
    };
  }
  const result = new Map<string, RecipeUnlock[]>();
  for (const [id, data] of schematics) {
    for (const unlock of records(data.mUnlocks)) {
      if (unlock.Class !== "BP_UnlockRecipe_C") continue;
      // Only manufacturing recipes belong to this catalog. Resolve routes lazily.
      for (const recipeId of references(unlock.mRecipes)) {
        if (!recipeIds.has(recipeId)) continue;
        const routes = result.get(recipeId) ?? [];
        for (const source of visibleSources(id))
          if (!routes.some((entry) => entry.id === source)) routes.push(route(source));
        result.set(recipeId, routes);
      }
    }
  }
  return result;
}

function references(value: unknown): string[] {
  if (typeof value !== "string") throw new Error("Expected schematic references.");
  const parsed = parseUnreal(value);
  if (!Array.isArray(parsed)) throw new Error("Expected a schematic reference list.");
  return parsed.map((entry) => {
    if (typeof entry !== "string") throw new Error("Expected a schematic reference.");
    return classId(entry);
  });
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("Expected schematic entries.");
  return value.map((entry: unknown) => {
    if (!record(entry)) throw new Error("Expected a schematic entry.");
    return entry;
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
