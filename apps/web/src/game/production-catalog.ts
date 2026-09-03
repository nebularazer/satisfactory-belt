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

import recipeData from "./recipes.json";

export type ProductionMachine = Readonly<{
  id: string;
  imageUrl: string;
  name: string;
}>;

export type ProductionRecipe = Readonly<{
  id: string;
  machineIds: readonly string[];
  name: string;
}>;

export type MachineRecipeSelection = Readonly<{
  machineId: string;
  recipeId: string;
  recipeName: string;
}>;

export const PRODUCTION_MACHINES: readonly ProductionMachine[] = [
  {
    id: "Build_ConstructorMk1_C",
    imageUrl: constructorImage,
    name: "Constructor",
  },
  {
    id: "Build_SmelterMk1_C",
    imageUrl: smelterImage,
    name: "Smelter",
  },
  {
    id: "Build_FoundryMk1_C",
    imageUrl: foundryImage,
    name: "Foundry",
  },
  {
    id: "Build_OilRefinery_C",
    imageUrl: refineryImage,
    name: "Refinery",
  },
  {
    id: "Build_Packager_C",
    imageUrl: packagerImage,
    name: "Packager",
  },
  {
    id: "Build_ManufacturerMk1_C",
    imageUrl: manufacturerImage,
    name: "Manufacturer",
  },
  {
    id: "Build_AssemblerMk1_C",
    imageUrl: assemblerImage,
    name: "Assembler",
  },
  {
    id: "Build_Blender_C",
    imageUrl: blenderImage,
    name: "Blender",
  },
  {
    id: "Build_HadronCollider_C",
    imageUrl: particleAcceleratorImage,
    name: "Particle Accelerator",
  },
  {
    id: "Build_Converter_C",
    imageUrl: converterImage,
    name: "Converter",
  },
  {
    id: "Build_QuantumEncoder_C",
    imageUrl: quantumEncoderImage,
    name: "Quantum Encoder",
  },
];

export const PRODUCTION_RECIPES = recipeData as readonly ProductionRecipe[];

const machinesById = new Map(
  PRODUCTION_MACHINES.map((machine) => [machine.id, machine]),
);

export const PRODUCTION_MACHINE_IMAGE_URLS = PRODUCTION_MACHINES.map(
  ({ imageUrl }) => imageUrl,
);

export function productionMachine(machineId: string) {
  return machinesById.get(machineId);
}

export function recipesForMachine(machineId: string) {
  return PRODUCTION_RECIPES.filter((recipe) =>
    recipe.machineIds.includes(machineId),
  );
}
