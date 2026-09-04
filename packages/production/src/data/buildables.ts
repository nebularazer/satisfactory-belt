import type { Buildable, ProductionMachine, ResourceExtractor } from "../types";

const CLOCK_SPEED = {
  maximumPercent: 250,
  minimumPercent: 1,
  powerConsumptionExponent: 1.321929,
} as const;

function productionAmplification(somersloopSlots: number) {
  return {
    multiplierPerSomersloop: 1 / somersloopSlots,
    powerConsumptionExponent: 2,
    somersloopSlots,
  } as const;
}

export const PRODUCTION_MACHINES: readonly ProductionMachine[] = [
  {
    basePowerMw: 4,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_ConstructorMk1_C",
    name: "Constructor",
    productionAmplification: productionAmplification(1),
  },
  {
    basePowerMw: 4,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_SmelterMk1_C",
    name: "Smelter",
    productionAmplification: productionAmplification(1),
  },
  {
    basePowerMw: 16,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_FoundryMk1_C",
    name: "Foundry",
    productionAmplification: productionAmplification(2),
  },
  {
    basePowerMw: 30,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_OilRefinery_C",
    name: "Refinery",
    productionAmplification: productionAmplification(2),
  },
  {
    basePowerMw: 10,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_Packager_C",
    name: "Packager",
  },
  {
    basePowerMw: 55,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_ManufacturerMk1_C",
    name: "Manufacturer",
    productionAmplification: productionAmplification(4),
  },
  {
    basePowerMw: 15,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_AssemblerMk1_C",
    name: "Assembler",
    productionAmplification: productionAmplification(2),
  },
  {
    basePowerMw: 75,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_Blender_C",
    name: "Blender",
    productionAmplification: productionAmplification(4),
  },
  {
    basePowerMw: 0,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_HadronCollider_C",
    name: "Particle Accelerator",
    productionAmplification: productionAmplification(4),
  },
  {
    basePowerMw: 0,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_Converter_C",
    name: "Converter",
    productionAmplification: productionAmplification(2),
  },
  {
    basePowerMw: 0,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_QuantumEncoder_C",
    name: "Quantum Encoder",
    productionAmplification: productionAmplification(4),
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
    basePowerMw: 5,
    baseRatePerMinute: 60,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_MinerMk1_C",
    name: "Miner Mk.1",
    resourceItemIds: MINER_RESOURCE_ITEM_IDS,
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
    usesResourcePurity: true,
  },
  {
    basePowerMw: 15,
    baseRatePerMinute: 120,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_MinerMk2_C",
    name: "Miner Mk.2",
    resourceItemIds: MINER_RESOURCE_ITEM_IDS,
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
    usesResourcePurity: true,
  },
  {
    basePowerMw: 45,
    baseRatePerMinute: 240,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_MinerMk3_C",
    name: "Miner Mk.3",
    resourceItemIds: MINER_RESOURCE_ITEM_IDS,
    searchTerms: MINER_RESOURCE_SEARCH_TERMS,
    usesResourcePurity: true,
  },
  {
    basePowerMw: 40,
    baseRatePerMinute: 120,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_OilPump_C",
    name: "Oil Extractor",
    resourceItemIds: ["Desc_LiquidOil_C"],
    searchTerms: ["crude oil"],
    usesResourcePurity: true,
  },
  {
    basePowerMw: 0,
    baseRatePerMinute: 60,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_FrackingExtractor_C",
    name: "Resource Well Extractor",
    resourceItemIds: RESOURCE_WELL_ITEM_IDS,
    searchTerms: RESOURCE_WELL_SEARCH_TERMS,
    usesResourcePurity: true,
  },
  {
    basePowerMw: 20,
    baseRatePerMinute: 120,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    id: "Build_WaterPump_C",
    name: "Water Extractor",
    resourceItemIds: ["Desc_Water_C"],
    searchTerms: ["water"],
    usesResourcePurity: false,
  },
];

const PRODUCTION_SUPPORT_BUILDABLES: readonly Buildable[] = [
  {
    category: "production",
    id: "Build_FrackingSmasher_C",
    name: "Resource Well Pressurizer",
    searchTerms: RESOURCE_WELL_SEARCH_TERMS,
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
  ...PRODUCTION_SUPPORT_BUILDABLES,
  ...LOGISTICS_BUILDABLES,
  ...SPECIAL_BUILDABLES,
];
