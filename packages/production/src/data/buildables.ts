import type { Buildable, ProductionMachine, ResourceExtractor } from "../types";

export const PRODUCTION_MACHINES: readonly ProductionMachine[] = [
  {
    basePowerMw: 4,
    category: "production",
    id: "Build_ConstructorMk1_C",
    name: "Constructor",
  },
  {
    basePowerMw: 4,
    category: "production",
    id: "Build_SmelterMk1_C",
    name: "Smelter",
  },
  {
    basePowerMw: 16,
    category: "production",
    id: "Build_FoundryMk1_C",
    name: "Foundry",
  },
  {
    basePowerMw: 30,
    category: "production",
    id: "Build_OilRefinery_C",
    name: "Refinery",
  },
  {
    basePowerMw: 10,
    category: "production",
    id: "Build_Packager_C",
    name: "Packager",
  },
  {
    basePowerMw: 55,
    category: "production",
    id: "Build_ManufacturerMk1_C",
    name: "Manufacturer",
  },
  {
    basePowerMw: 15,
    category: "production",
    id: "Build_AssemblerMk1_C",
    name: "Assembler",
  },
  {
    basePowerMw: 75,
    category: "production",
    id: "Build_Blender_C",
    name: "Blender",
  },
  {
    basePowerMw: 0,
    category: "production",
    id: "Build_HadronCollider_C",
    name: "Particle Accelerator",
  },
  {
    basePowerMw: 0,
    category: "production",
    id: "Build_Converter_C",
    name: "Converter",
  },
  {
    basePowerMw: 0,
    category: "production",
    id: "Build_QuantumEncoder_C",
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
    category: "production",
    id: "Build_MinerMk1_C",
    name: "Miner Mk.1",
    resourceItemIds: MINER_RESOURCE_ITEM_IDS,
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
  },
  {
    category: "production",
    id: "Build_MinerMk2_C",
    name: "Miner Mk.2",
    resourceItemIds: MINER_RESOURCE_ITEM_IDS,
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
  },
  {
    category: "production",
    id: "Build_MinerMk3_C",
    name: "Miner Mk.3",
    resourceItemIds: MINER_RESOURCE_ITEM_IDS,
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
  },
  {
    category: "production",
    id: "Build_OilPump_C",
    name: "Oil Extractor",
    resourceItemIds: ["Desc_LiquidOil_C"],
    searchTerms: ["crude oil"],
  },
  {
    category: "production",
    id: "Build_FrackingExtractor_C",
    name: "Resource Well Extractor",
    resourceItemIds: RESOURCE_WELL_ITEM_IDS,
    searchTerms: RESOURCE_WELL_SEARCH_TERMS,
  },
  {
    category: "production",
    id: "Build_FrackingSmasher_C",
    name: "Resource Well Pressurizer",
    resourceItemIds: RESOURCE_WELL_ITEM_IDS,
    searchTerms: RESOURCE_WELL_SEARCH_TERMS,
  },
  {
    category: "production",
    id: "Build_WaterPump_C",
    name: "Water Extractor",
    resourceItemIds: ["Desc_Water_C"],
    searchTerms: ["water"],
  },
];

export const LOGISTICS_BUILDABLES: readonly Buildable[] = [
  {
    category: "logistics",
    id: "Build_ConveyorAttachmentMerger_C",
    name: "Conveyor Merger",
  },
  {
    category: "logistics",
    id: "Build_ConveyorAttachmentSplitter_C",
    name: "Conveyor Splitter",
  },
  {
    category: "logistics",
    id: "Build_PipelineJunction_Cross_C",
    name: "Pipeline Junction",
  },
  {
    category: "logistics",
    id: "Build_PipelineJunction_T_C",
    name: "Pipeline T-Junction",
  },
  {
    category: "logistics",
    id: "Build_ConveyorAttachmentSplitterProgrammable_C",
    name: "Programmable Splitter",
  },
  {
    category: "logistics",
    id: "Build_ConveyorAttachmentMergerPriority_C",
    name: "Priority Merger",
  },
  {
    category: "logistics",
    id: "Build_ConveyorAttachmentSplitterSmart_C",
    name: "Smart Splitter",
  },
];

export const SPECIAL_BUILDABLES: readonly Buildable[] = [
  {
    category: "special",
    id: "Build_ResourceSink_C",
    name: "AWESOME Sink",
  },
];

export const BUILDABLES: readonly Buildable[] = [
  ...PRODUCTION_MACHINES,
  ...RESOURCE_EXTRACTORS,
  ...LOGISTICS_BUILDABLES,
  ...SPECIAL_BUILDABLES,
];
