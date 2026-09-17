import type { Building, BuildingKind, Item } from "@satisfactory-belt/game-data";

import { classId, parseUnreal } from "./unreal.ts";

type SourceClass = { native: string; data: Record<string, unknown> };
/** Select supported factory buildings by game class, never by translated display names. */
export function parseBuildings(
  classes: ReadonlyMap<string, SourceClass>,
  items: Record<string, Item>,
): Record<string, Building> {
  const kinds: Record<string, BuildingKind> = {
    FGBuildableGeneratorFuel: "generator",
    FGBuildableGeneratorNuclear: "generator",
    FGBuildablePowerBooster: "augmenter",
    FGBuildableFrackingActivator: "well",
    FGCentralStorageContainer: "depot",
    FGBuildableDockingStation: "truck-station",
    FGBuildableRailroadStation: "train-station",
    FGBuildableTrainPlatformCargo: "freight-platform",
    FGBuildableDroneStation: "drone-port",
    FGBuildableSpaceElevator: "space-elevator",
  };
  const result: Record<string, Building> = {};
  for (const [id, { native, data }] of classes) {
    if (!id.startsWith("Build_")) continue;
    const kind =
      /^Build_StorageContainerMk[12]_C$/.test(id) || native === "FGBuildablePipeReservoir"
        ? "storage"
        : kinds[native];
    if (!kind) continue;
    const descriptorId = id.replace(/^Build_/, "Desc_");
    if (!classes.has(descriptorId)) throw new Error(`Missing building descriptor for ${id}.`);
    const n = (key: string) => {
      const value = Number(data[key] ?? 0);
      if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${id}.${key}.`);
      return value;
    };
    const fluid =
      data.mIsFluidStorageInventory === "True" ||
      native === "FGBuildablePipeReservoir" ||
      id === "Build_TrainDockingStationLiquid_C";
    const power = n("mPowerProduction") || n("mBasePowerProduction") || n("mPowerConsumption");
    const fuels: Building["fuels"] = [];
    if (Array.isArray(data.mFuel))
      for (const row of data.mFuel) {
        if (!record(row) || typeof row.mFuelClass !== "string")
          throw new Error(`Invalid fuel on ${id}.`);
        const fuel: Building["fuels"][number] = {
          itemId: row.mFuelClass,
          supplementalPerMinute: (power * n("mSupplementalToPowerRatio") * 60) / 1000,
        };
        if (typeof row.mSupplementalResourceClass === "string" && row.mSupplementalResourceClass)
          fuel.supplementalItemId = row.mSupplementalResourceClass;
        if (typeof row.mByproduct === "string" && row.mByproduct)
          fuel.byproduct = { itemId: row.mByproduct, amount: Number(row.mByproductAmount) };
        fuels.push(fuel);
      }
    const resourceIds: string[] = [];
    if (kind === "well") {
      const resources = parseUnreal(text(data, "mAllowedResources"));
      if (!Array.isArray(resources) || resources.some((resource) => typeof resource !== "string"))
        throw new Error(`Invalid well resources on ${id}.`);
      for (const resource of resources)
        if (typeof resource === "string") resourceIds.push(classId(resource));
    }
    const building: Building = {
      id,
      descriptorId,
      iconId: descriptorId,
      name: text(data, "mDisplayName"),
      description: text(data, "mDescription"),
      kind,
      powerMegawatts: power,
      canOverclock: data.mCanChangePotential === "True",
      powerConsumptionExponent: n("mPowerConsumptionExponent"),
      transport: fluid ? "pipe" : "belt",
      capacity:
        native === "FGBuildablePipeReservoir"
          ? n("mStorageCapacity")
          : fluid
            ? 2400
            : n("mInventorySizeX") * n("mInventorySizeY") ||
              n("mStorageSizeX") * n("mStorageSizeY") ||
              n("mStorageInventorySize"),
      fuels,
      resourceIds,
      baseRate: kind === "well" ? 60 : 0,
      loadFollowing: id === "Build_GeneratorBiomass_Automated_C",
    };
    if (kind === "truck-station" && fluid) building.capacity = 3200;
    // Docs omits drone fuel descriptors. The supported 1.2 list is explicit, not inferred from energy alone.
    if (kind === "drone-port")
      building.fuels = [
        "Desc_Battery_C",
        "Desc_Fuel_C",
        "Desc_TurboFuel_C",
        "Desc_PackagedRocketFuel_C",
        "Desc_PackagedIonizedFuel_C",
        "Desc_NuclearFuelRod_C",
        "Desc_PlutoniumFuelRod_C",
      ]
        .filter((itemId) => items[itemId])
        .map((itemId) => ({ itemId, supplementalPerMinute: 0 }));
    result[id] = building;
  }
  return result;
}
function text(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string") throw new Error(`Missing ${key}.`);
  return value;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
