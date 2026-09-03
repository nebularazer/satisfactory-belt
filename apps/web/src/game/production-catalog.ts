import assemblerImage from "@/assets/machines/Desc_AssemblerMk1_C.png";
import blenderImage from "@/assets/machines/Desc_Blender_C.png";
import constructorImage from "@/assets/machines/Desc_ConstructorMk1_C.png";
import converterImage from "@/assets/machines/Desc_Converter_C.png";
import foundryImage from "@/assets/machines/Desc_FoundryMk1_C.png";
import particleAcceleratorImage from "@/assets/machines/Desc_HadronCollider_C.png";
import manufacturerImage from "@/assets/machines/Desc_ManufacturerMk1_C.png";
import refineryImage from "@/assets/machines/Desc_OilRefinery_C.png";
import packagerImage from "@/assets/machines/Desc_Packager_C.png";
import quantumEncoderImage from "@/assets/machines/Desc_QuantumEncoder_C.png";
import smelterImage from "@/assets/machines/Desc_SmelterMk1_C.png";

import itemData from "./items.json";
import recipeData from "./recipes.json";

export type ProductionMachine = Readonly<{
  basePowerMw: number;
  id: string;
  imageUrl: string;
  name: string;
}>;

export type ProductionItem = Readonly<{
  form: "gas" | "liquid" | "solid";
  id: string;
  name: string;
}>;

export type ProductionMaterial = Readonly<{
  amount: number;
  itemId: string;
  ratePerMinute: number;
}>;

export type ProductionRecipe = Readonly<{
  alternate: boolean;
  durationSeconds: number;
  id: string;
  inputs: readonly ProductionMaterial[];
  machineIds: readonly string[];
  name: string;
  outputs: readonly ProductionMaterial[];
  power?: Readonly<{
    maximumMw: number;
    minimumMw: number;
  }>;
}>;

export type MachineRecipeSelection = Readonly<{
  machineId: string;
  recipeId: string;
  recipeName: string;
}>;

export const PRODUCTION_MACHINES: readonly ProductionMachine[] = [
  {
    basePowerMw: 4,
    id: "Build_ConstructorMk1_C",
    imageUrl: constructorImage,
    name: "Constructor",
  },
  {
    basePowerMw: 4,
    id: "Build_SmelterMk1_C",
    imageUrl: smelterImage,
    name: "Smelter",
  },
  {
    basePowerMw: 16,
    id: "Build_FoundryMk1_C",
    imageUrl: foundryImage,
    name: "Foundry",
  },
  {
    basePowerMw: 30,
    id: "Build_OilRefinery_C",
    imageUrl: refineryImage,
    name: "Refinery",
  },
  {
    basePowerMw: 10,
    id: "Build_Packager_C",
    imageUrl: packagerImage,
    name: "Packager",
  },
  {
    basePowerMw: 55,
    id: "Build_ManufacturerMk1_C",
    imageUrl: manufacturerImage,
    name: "Manufacturer",
  },
  {
    basePowerMw: 15,
    id: "Build_AssemblerMk1_C",
    imageUrl: assemblerImage,
    name: "Assembler",
  },
  {
    basePowerMw: 75,
    id: "Build_Blender_C",
    imageUrl: blenderImage,
    name: "Blender",
  },
  {
    basePowerMw: 0,
    id: "Build_HadronCollider_C",
    imageUrl: particleAcceleratorImage,
    name: "Particle Accelerator",
  },
  {
    basePowerMw: 0,
    id: "Build_Converter_C",
    imageUrl: converterImage,
    name: "Converter",
  },
  {
    basePowerMw: 0,
    id: "Build_QuantumEncoder_C",
    imageUrl: quantumEncoderImage,
    name: "Quantum Encoder",
  },
];

export const PRODUCTION_ITEMS = itemData as readonly ProductionItem[];
export const PRODUCTION_RECIPES = recipeData as readonly ProductionRecipe[];

const machinesById = new Map(
  PRODUCTION_MACHINES.map((machine) => [machine.id, machine]),
);
const itemsById = new Map(PRODUCTION_ITEMS.map((item) => [item.id, item]));
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

export const PRODUCTION_MACHINE_IMAGE_URLS = PRODUCTION_MACHINES.map(
  ({ imageUrl }) => imageUrl,
);

export function productionMachine(machineId: string) {
  return machinesById.get(machineId);
}

export function productionItem(itemId: string) {
  return itemsById.get(itemId);
}

export function recipesForMachine(machineId: string) {
  return recipesByMachineId.get(machineId) ?? [];
}

export function recipesProducing(itemId: string) {
  return recipesByOutputItemId.get(itemId) ?? [];
}
