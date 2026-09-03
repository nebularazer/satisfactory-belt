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
import conveyorMergerImage from "@/assets/buildables/Desc_ConveyorAttachmentMerger_C.png";
import priorityMergerImage from "@/assets/buildables/Desc_ConveyorAttachmentMergerPriority_C.png";
import programmableSplitterImage from "@/assets/buildables/Desc_ConveyorAttachmentSplitterProgrammable_C.png";
import smartSplitterImage from "@/assets/buildables/Desc_ConveyorAttachmentSplitterSmart_C.png";
import conveyorSplitterImage from "@/assets/buildables/Desc_ConveyorAttachmentSplitter_C.png";
import resourceWellExtractorImage from "@/assets/buildables/Desc_FrackingExtractor_C.png";
import resourceWellPressurizerImage from "@/assets/buildables/Desc_FrackingSmasher_C.png";
import minerMk1Image from "@/assets/buildables/Desc_MinerMk1_C.png";
import minerMk2Image from "@/assets/buildables/Desc_MinerMk2_C.png";
import minerMk3Image from "@/assets/buildables/Desc_MinerMk3_C.png";
import oilExtractorImage from "@/assets/buildables/Desc_OilPump_C.png";
import pipelineJunctionImage from "@/assets/buildables/Desc_PipelineJunction_Cross_C.png";
import pipelineTJunctionImage from "@/assets/buildables/Desc_PipelineJunction_T_C.png";
import awesomeSinkImage from "@/assets/buildables/Desc_ResourceSink_C.png";
import waterExtractorImage from "@/assets/buildables/Desc_WaterPump_C.png";

import itemData from "./items.json";
import recipeData from "./recipes.json";

export type CatalogBuildable = Readonly<{
  id: string;
  imageUrl: string;
  name: string;
  searchTerms?: readonly string[];
}>;

export type ProductionMachine = CatalogBuildable &
  Readonly<{
    basePowerMw: number;
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

export type NodePickerSelection = Readonly<{
  label: string;
  machineId: string;
  recipeId?: string;
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

const MINER_RESOURCE_SEARCH_TERMS = [
  "bauxite",
  "caterium ore",
  "coal",
  "copper ore",
  "iron ore",
  "limestone",
  "raw quartz",
  "sam",
  "sulfur",
  "uranium ore",
];

const RESOURCE_WELL_SEARCH_TERMS = ["crude oil", "nitrogen gas", "water"];

export const RESOURCE_EXTRACTORS: readonly CatalogBuildable[] = [
  {
    id: "Build_MinerMk1_C",
    imageUrl: minerMk1Image,
    name: "Miner Mk.1",
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
  },
  {
    id: "Build_MinerMk2_C",
    imageUrl: minerMk2Image,
    name: "Miner Mk.2",
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
  },
  {
    id: "Build_MinerMk3_C",
    imageUrl: minerMk3Image,
    name: "Miner Mk.3",
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
  },
  {
    id: "Build_OilPump_C",
    imageUrl: oilExtractorImage,
    name: "Oil Extractor",
    searchTerms: ["crude oil"],
  },
  {
    id: "Build_FrackingExtractor_C",
    imageUrl: resourceWellExtractorImage,
    name: "Resource Well Extractor",
    searchTerms: RESOURCE_WELL_SEARCH_TERMS,
  },
  {
    id: "Build_FrackingSmasher_C",
    imageUrl: resourceWellPressurizerImage,
    name: "Resource Well Pressurizer",
    searchTerms: RESOURCE_WELL_SEARCH_TERMS,
  },
  {
    id: "Build_WaterPump_C",
    imageUrl: waterExtractorImage,
    name: "Water Extractor",
    searchTerms: ["water"],
  },
];

export const LOGISTICS_BUILDABLES: readonly CatalogBuildable[] = [
  {
    id: "Build_ConveyorAttachmentMerger_C",
    imageUrl: conveyorMergerImage,
    name: "Conveyor Merger",
  },
  {
    id: "Build_ConveyorAttachmentSplitter_C",
    imageUrl: conveyorSplitterImage,
    name: "Conveyor Splitter",
  },
  {
    id: "Build_PipelineJunction_Cross_C",
    imageUrl: pipelineJunctionImage,
    name: "Pipeline Junction",
  },
  {
    id: "Build_PipelineJunction_T_C",
    imageUrl: pipelineTJunctionImage,
    name: "Pipeline T-Junction",
  },
  {
    id: "Build_ConveyorAttachmentSplitterProgrammable_C",
    imageUrl: programmableSplitterImage,
    name: "Programmable Splitter",
  },
  {
    id: "Build_ConveyorAttachmentMergerPriority_C",
    imageUrl: priorityMergerImage,
    name: "Priority Merger",
  },
  {
    id: "Build_ConveyorAttachmentSplitterSmart_C",
    imageUrl: smartSplitterImage,
    name: "Smart Splitter",
  },
];

export const SPECIAL_BUILDABLES: readonly CatalogBuildable[] = [
  {
    id: "Build_ResourceSink_C",
    imageUrl: awesomeSinkImage,
    name: "AWESOME Sink",
  },
];

export const CATALOG_BUILDABLES: readonly CatalogBuildable[] = [
  ...PRODUCTION_MACHINES,
  ...RESOURCE_EXTRACTORS,
  ...LOGISTICS_BUILDABLES,
  ...SPECIAL_BUILDABLES,
];

export const PRODUCTION_ITEMS = itemData as readonly ProductionItem[];
export const PRODUCTION_RECIPES = recipeData as readonly ProductionRecipe[];

const machinesById = new Map(
  PRODUCTION_MACHINES.map((machine) => [machine.id, machine]),
);
const buildablesById = new Map(
  CATALOG_BUILDABLES.map((buildable) => [buildable.id, buildable]),
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

export const CATALOG_BUILDABLE_IMAGE_URLS = CATALOG_BUILDABLES.map(
  ({ imageUrl }) => imageUrl,
);

export function catalogBuildable(buildableId: string) {
  return buildablesById.get(buildableId);
}

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
