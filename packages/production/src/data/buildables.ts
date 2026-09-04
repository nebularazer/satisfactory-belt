import type {
  BufferBuildable,
  Buildable,
  MaterialConsumer,
  MaterialPort,
  ProductionMachine,
  ResourceExtractor,
  ResourceWellPressurizer,
  RouterBuildable,
  TransportBuildable,
} from "../types";
import { POWER_GENERATORS } from "./power-generators";

export { POWER_GENERATORS } from "./power-generators";

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
    category: "production",
    id: "Build_FrackingExtractor_C",
    name: "Resource Well Extractor",
    resourceItemIds: RESOURCE_WELL_ITEM_IDS,
    resourceWell: true,
    searchTerms: RESOURCE_WELL_SEARCH_TERMS,
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

export const RESOURCE_WELL_PRESSURIZERS: readonly ResourceWellPressurizer[] = [
  {
    basePowerMw: 150,
    baseRatePerExtractor: 60,
    category: "production",
    clockSpeed: CLOCK_SPEED,
    extractorBuildableId: "Build_FrackingExtractor_C",
    id: "Build_FrackingSmasher_C",
    name: "Resource Well Pressurizer",
    resourceItemIds: RESOURCE_WELL_ITEM_IDS,
    searchTerms: RESOURCE_WELL_SEARCH_TERMS,
  },
];

function directedPorts(
  medium: "conveyor" | "pipeline",
  forms: MaterialPort["forms"],
  inputCount: number,
  outputCount: number,
): readonly MaterialPort[] {
  return [
    ...Array.from({ length: inputCount }, (_, index) => ({
      direction: "input" as const,
      forms,
      id: `input:${index + 1}`,
      medium,
    })),
    ...Array.from({ length: outputCount }, (_, index) => ({
      direction: "output" as const,
      forms,
      id: `output:${index + 1}`,
      medium,
    })),
  ];
}

function pipelineJunctionPorts(count: number): readonly MaterialPort[] {
  return Array.from({ length: count }, (_, index) => ({
    direction: "bidirectional",
    forms: ["liquid", "gas"],
    id: `port:${index + 1}`,
    medium: "pipeline",
  }));
}

const SPLITTER_PORTS = directedPorts("conveyor", ["solid"], 1, 3);
const MERGER_PORTS = directedPorts("conveyor", ["solid"], 3, 1);

export const LOGISTICS_BUILDABLES: readonly RouterBuildable[] = [
  {
    category: "logistics",
    id: "Build_ConveyorAttachmentMerger_C",
    name: "Conveyor Merger",
    nodeKind: "router",
    ports: MERGER_PORTS,
  },
  {
    category: "logistics",
    id: "Build_ConveyorAttachmentSplitter_C",
    name: "Conveyor Splitter",
    nodeKind: "router",
    ports: SPLITTER_PORTS,
  },
  {
    category: "logistics",
    id: "Build_PipelineJunction_Cross_C",
    name: "Pipeline Junction",
    nodeKind: "router",
    ports: pipelineJunctionPorts(4),
  },
  {
    category: "logistics",
    id: "Build_PipelineJunction_T_C",
    name: "Pipeline T-Junction",
    nodeKind: "router",
    ports: pipelineJunctionPorts(3),
  },
  {
    category: "logistics",
    id: "Build_ConveyorAttachmentSplitterProgrammable_C",
    name: "Programmable Splitter",
    nodeKind: "router",
    ports: SPLITTER_PORTS,
  },
  {
    category: "logistics",
    id: "Build_ConveyorAttachmentMergerPriority_C",
    name: "Priority Merger",
    nodeKind: "router",
    ports: MERGER_PORTS,
  },
  {
    category: "logistics",
    id: "Build_ConveyorAttachmentSplitterSmart_C",
    name: "Smart Splitter",
    nodeKind: "router",
    ports: SPLITTER_PORTS,
  },
];

export const BUFFER_BUILDABLES: readonly BufferBuildable[] = [
  {
    capacity: { slots: 24, type: "inventory" },
    category: "organization",
    id: "Build_StorageContainerMk1_C",
    name: "Storage Container",
    nodeKind: "buffer",
    ports: directedPorts("conveyor", ["solid"], 1, 1),
  },
  {
    capacity: { slots: 48, type: "inventory" },
    category: "organization",
    id: "Build_StorageContainerMk2_C",
    name: "Industrial Storage Container",
    nodeKind: "buffer",
    ports: directedPorts("conveyor", ["solid"], 2, 2),
  },
  {
    capacity: { cubicMetres: 400, type: "fluid" },
    category: "organization",
    id: "Build_PipeStorageTank_C",
    name: "Fluid Buffer",
    nodeKind: "buffer",
    ports: pipelineJunctionPorts(2),
  },
  {
    capacity: { cubicMetres: 2400, type: "fluid" },
    category: "organization",
    id: "Build_IndustrialTank_C",
    name: "Industrial Fluid Buffer",
    nodeKind: "buffer",
    ports: pipelineJunctionPorts(2),
  },
];

export const TRANSPORT_BUILDABLES: readonly TransportBuildable[] = [
  {
    basePowerMw: 20,
    cargo: {
      forms: ["solid"],
      localInputCount: 2,
      localMedium: "conveyor",
      localOutputCount: 2,
      remoteMedium: "vehicle",
    },
    category: "transport",
    fuelPort: true,
    id: "Build_TruckStation_C",
    name: "Truck Station",
    nodeKind: "transport",
  },
  {
    basePowerMw: 20,
    cargo: {
      forms: ["liquid", "gas"],
      localInputCount: 2,
      localMedium: "pipeline",
      localOutputCount: 2,
      remoteMedium: "vehicle",
    },
    category: "transport",
    fuelPort: true,
    id: "Build_FluidTruckStation_C",
    name: "Fluid Truck Station",
    nodeKind: "transport",
  },
  {
    basePowerMw: 50,
    cargo: {
      forms: ["solid"],
      localInputCount: 2,
      localMedium: "conveyor",
      localOutputCount: 2,
      remoteMedium: "rail",
    },
    category: "transport",
    fuelPort: false,
    id: "Build_TrainDockingStation_C",
    name: "Freight Platform",
    nodeKind: "transport",
  },
  {
    basePowerMw: 50,
    cargo: {
      forms: ["liquid", "gas"],
      localInputCount: 2,
      localMedium: "pipeline",
      localOutputCount: 2,
      remoteMedium: "rail",
    },
    category: "transport",
    fuelPort: false,
    id: "Build_TrainDockingStationLiquid_C",
    name: "Fluid Freight Platform",
    nodeKind: "transport",
  },
  {
    basePowerMw: 100,
    cargo: {
      forms: ["solid"],
      localInputCount: 1,
      localMedium: "conveyor",
      localOutputCount: 1,
      remoteMedium: "drone",
    },
    category: "transport",
    fuelPort: true,
    id: "Build_DroneStation_C",
    name: "Drone Port",
    nodeKind: "transport",
  },
];

export const SPECIAL_BUILDABLES: readonly MaterialConsumer[] = [
  {
    acceptedForms: ["solid"],
    basePowerMw: 30,
    category: "special",
    id: "Build_ResourceSink_C",
    name: "AWESOME Sink",
  },
];

export const BUILDABLES: readonly Buildable[] = [
  ...PRODUCTION_MACHINES,
  ...RESOURCE_EXTRACTORS,
  ...POWER_GENERATORS,
  ...RESOURCE_WELL_PRESSURIZERS,
  ...LOGISTICS_BUILDABLES,
  ...BUFFER_BUILDABLES,
  ...TRANSPORT_BUILDABLES,
  ...SPECIAL_BUILDABLES,
];
