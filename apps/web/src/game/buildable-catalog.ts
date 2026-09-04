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

import type {
  CatalogBuildable,
  ProductionMachine,
  ResourceExtractor,
} from "./catalog-types";

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

const MINER_RESOURCE_ITEM_IDS = [
  "Desc_OreBauxite_C",
  "Desc_OreGold_C",
  "Desc_Coal_C",
  "Desc_OreCopper_C",
  "Desc_OreIron_C",
  "Desc_Stone_C",
  "Desc_RawQuartz_C",
  "Desc_SAM_C",
  "Desc_Sulfur_C",
  "Desc_OreUranium_C",
];

const RESOURCE_WELL_SEARCH_TERMS = ["crude oil", "nitrogen gas", "water"];
const RESOURCE_WELL_ITEM_IDS = [
  "Desc_LiquidOil_C",
  "Desc_NitrogenGas_C",
  "Desc_Water_C",
];

export const RESOURCE_EXTRACTORS: readonly ResourceExtractor[] = [
  {
    id: "Build_MinerMk1_C",
    imageUrl: minerMk1Image,
    name: "Miner Mk.1",
    resourceItemIds: MINER_RESOURCE_ITEM_IDS,
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
  },
  {
    id: "Build_MinerMk2_C",
    imageUrl: minerMk2Image,
    name: "Miner Mk.2",
    resourceItemIds: MINER_RESOURCE_ITEM_IDS,
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
  },
  {
    id: "Build_MinerMk3_C",
    imageUrl: minerMk3Image,
    name: "Miner Mk.3",
    resourceItemIds: MINER_RESOURCE_ITEM_IDS,
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
  },
  {
    id: "Build_OilPump_C",
    imageUrl: oilExtractorImage,
    name: "Oil Extractor",
    resourceItemIds: ["Desc_LiquidOil_C"],
    searchTerms: ["crude oil"],
  },
  {
    id: "Build_FrackingExtractor_C",
    imageUrl: resourceWellExtractorImage,
    name: "Resource Well Extractor",
    resourceItemIds: RESOURCE_WELL_ITEM_IDS,
    searchTerms: RESOURCE_WELL_SEARCH_TERMS,
  },
  {
    id: "Build_FrackingSmasher_C",
    imageUrl: resourceWellPressurizerImage,
    name: "Resource Well Pressurizer",
    resourceItemIds: RESOURCE_WELL_ITEM_IDS,
    searchTerms: RESOURCE_WELL_SEARCH_TERMS,
  },
  {
    id: "Build_WaterPump_C",
    imageUrl: waterExtractorImage,
    name: "Water Extractor",
    resourceItemIds: ["Desc_Water_C"],
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

const buildablesById = new Map(
  CATALOG_BUILDABLES.map((buildable) => [buildable.id, buildable]),
);

export const CATALOG_BUILDABLE_IMAGE_URLS = CATALOG_BUILDABLES.map(
  ({ imageUrl }) => imageUrl,
);

export function catalogBuildable(buildableId: string) {
  return buildablesById.get(buildableId);
}
