import type { GameCatalog, Ingredient, Item, Machine, Recipe } from "@satisfactory-belt/game-data";

import { classId, parseUnreal } from "./unreal.ts";

export interface ExcludedRecipe {
  id: string;
  reason: "building" | "handcrafting" | "no-producer";
}

/** iconId initially identifies a descriptor; preparation resolves it to the image content ID. */
export function parseCatalog(
  docs: unknown,
  source: GameCatalog["source"],
): {
  catalog: GameCatalog;
  excludedRecipes: ExcludedRecipe[];
} {
  if (!Array.isArray(docs) || docs.length === 0) throw new Error("Expected a nonempty Docs array.");
  const classes = new Map<string, { native: string; data: Record<string, unknown> }>();
  for (const group of docs) {
    if (!record(group) || typeof group.NativeClass !== "string" || !Array.isArray(group.Classes))
      throw new Error("Invalid Docs group.");
    const native = classId(group.NativeClass.slice(group.NativeClass.indexOf("'") + 1));
    for (const entry of group.Classes) {
      if (!record(entry)) throw new Error(`Invalid entry in ${native}.`);
      const id = string(entry, "ClassName");
      if (!/^[A-Za-z0-9_-]+$/.test(id) || classes.has(id))
        throw new Error(`Invalid or duplicate class ${id}.`);
      classes.set(id, { native, data: entry });
    }
  }
  const items: Record<string, Item> = {};
  const machines: Record<string, Machine> = {};
  const recipes: Record<string, Recipe> = {};
  const excludedRecipes: ExcludedRecipe[] = [];
  for (const [id, { native, data }] of classes) {
    if (typeof data.mForm === "string" && data.mForm !== "RF_INVALID") {
      const form =
        data.mForm === "RF_SOLID"
          ? "solid"
          : data.mForm === "RF_LIQUID"
            ? "liquid"
            : data.mForm === "RF_GAS"
              ? "gas"
              : undefined;
      if (!form) throw new Error(`Unknown item form ${data.mForm} on ${id}.`);
      items[id] = {
        id,
        name: string(data, "mDisplayName"),
        description: string(data, "mDescription"),
        form,
        unit: form === "solid" ? "item" : "m3",
        iconId: id,
      };
    }
    if (native === "FGBuildableManufacturer" || native === "FGBuildableManufacturerVariablePower") {
      // Docs omits the buildable-class link; validate the paired descriptor class explicitly.
      const descriptorId = id.replace(/^Build_/, "Desc_");
      if (classes.get(descriptorId)?.native !== "FGBuildingDescriptor")
        throw new Error(`Missing building descriptor for ${id}.`);
      machines[id] = {
        id,
        descriptorId,
        iconId: descriptorId,
        name: string(data, "mDisplayName"),
        description: string(data, "mDescription"),
        manufacturingSpeed: number(data, "mManufacturingSpeed"),
        power:
          native === "FGBuildableManufacturerVariablePower"
            ? { kind: "variable" }
            : { kind: "fixed", megawatts: number(data, "mPowerConsumption") },
        powerConsumptionExponent: number(data, "mPowerConsumptionExponent"),
      };
    }
  }
  const handcrafting = new Set([
    "BP_WorkBenchComponent_C",
    "BP_WorkshopComponent_C",
    "FGBuildableAutomatedWorkBench",
    "Build_AutomatedWorkBench_C",
  ]);
  const building = new Set(["BP_BuildGun_C", "FGBuildGun"]);
  for (const [id, { native, data }] of classes) {
    if (native !== "FGRecipe") continue;
    const producers = list(data, "mProducedIn").map((value) => classId(value));
    const machineIds = [
      ...new Set(producers.filter((producer) => Object.hasOwn(machines, producer))),
    ].toSorted();
    for (const producer of producers) {
      if (
        !Object.hasOwn(machines, producer) &&
        !handcrafting.has(producer) &&
        !building.has(producer)
      )
        throw new Error(`Unknown producer ${producer} in ${id}; update the catalog selection.`);
    }
    if (machineIds.length === 0) {
      excludedRecipes.push({
        id,
        reason: producers.some((p) => building.has(p))
          ? "building"
          : producers.length
            ? "handcrafting"
            : "no-producer",
      });
      continue;
    }
    const fullName = string(data, "FullName");
    recipes[id] = {
      id,
      name: string(data, "mDisplayName"),
      durationSeconds: number(data, "mManufactoringDuration"),
      ingredients: quantities(data, "mIngredients", items),
      products: quantities(data, "mProduct", items),
      machineIds,
      alternate: fullName.includes("/AlternateRecipes/"),
      events: data.mRelevantEvents === undefined ? [] : list(data, "mRelevantEvents"),
      variablePower: {
        constantMegawatts: number(data, "mVariablePowerConsumptionConstant"),
        factorMegawatts: number(data, "mVariablePowerConsumptionFactor"),
      },
    };
  }
  if (
    Object.keys(items).length === 0 ||
    Object.keys(machines).length === 0 ||
    Object.keys(recipes).length === 0
  )
    throw new Error("No manufacturing catalog found in Docs.");
  return {
    catalog: {
      schemaVersion: 1,
      source,
      items: sorted(items),
      machines: sorted(machines),
      recipes: sorted(recipes),
    },
    excludedRecipes: excludedRecipes.toSorted((a, b) => a.id.localeCompare(b.id, "en")),
  };
}

function quantities(
  data: Record<string, unknown>,
  field: string,
  items: Record<string, Item>,
): Ingredient[] {
  const entries = parseUnreal(string(data, field));
  if (!Array.isArray(entries)) throw new Error(`Expected a list in ${field}.`);
  return entries.map((entry) => {
    if (!record(entry)) throw new Error(`Expected ItemClass/Amount in ${field}.`);
    const itemId = classId(string(entry, "ItemClass"));
    const item = items[itemId];
    if (!item) throw new Error(`Missing item ${itemId} in ${String(data.ClassName)}.${field}.`);
    // Unreal stores fluid amounts in litres; the planner uses cubic metres, including gases.
    return { itemId, amount: number(entry, "Amount") / (item.form === "solid" ? 1 : 1000) };
  });
}

function list(data: Record<string, unknown>, field: string): string[] {
  const result = parseUnreal(string(data, field));
  if (
    !Array.isArray(result) ||
    !result.every((entry): entry is string => typeof entry === "string")
  )
    throw new Error(`Expected a string list in ${field}.`);
  return result;
}
function string(data: Record<string, unknown>, field: string): string {
  const value = data[field];
  if (typeof value !== "string")
    throw new Error(`Expected string ${field} on ${String(data.ClassName)}.`);
  return value;
}
function number(data: Record<string, unknown>, field: string): number {
  const value = string(data, field);
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) ||
    !Number.isFinite(Number(value))
  )
    throw new Error(`Invalid number in ${String(data.ClassName)}.${field}.`);
  return Number(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sorted<T>(entries: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(entries).toSorted(([a], [b]) => a.localeCompare(b, "en")),
  );
}
