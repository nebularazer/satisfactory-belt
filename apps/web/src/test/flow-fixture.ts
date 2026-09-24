import { createMachineMembers } from "@satisfactory-belt/factory-core";
import type {
  FactoryNode,
  ManufacturingNode,
  FactoryDocument,
} from "@satisfactory-belt/factory-core";

import { inspectorAssets } from "./inspector-fixture";

export function minerFlowFixture() {
  const assets = inspectorAssets();
  const { catalog } = assets;
  catalog.items.copper = { ...catalog.items.copper!, name: "Iron Ore" };
  catalog.items.iron = { ...catalog.items.iron!, name: "Iron Ingot" };
  catalog.extractors.miner = {
    id: "miner",
    name: "Miner Mk.2",
    description: "",
    descriptorId: "miner",
    iconId: "copper",
    resourceIds: ["copper"],
    baseRate: 120,
    hasPurity: true,
    canOverclock: true,
    powerMegawatts: 12,
    powerConsumptionExponent: 1.3,
  };
  catalog.machines.smelter = {
    id: "smelter",
    name: "Smelter",
    description: "",
    descriptorId: "smelter",
    iconId: "iron",
    manufacturingSpeed: 1,
    power: { kind: "fixed", megawatts: 4 },
    powerConsumptionExponent: 1.3,
    canOverclock: true,
    sloopSlots: 0,
    productionBoost: { base: 1, perSloop: 0, powerExponent: 1 },
  };
  catalog.recipes.ingot = {
    id: "ingot",
    name: "Iron Ingot",
    durationSeconds: 2,
    ingredients: [{ itemId: "copper", amount: 1 }],
    products: [{ itemId: "iron", amount: 1 }],
    machineIds: ["smelter"],
    alternate: false,
    events: [],
    variablePower: { constantMegawatts: 0, factorMegawatts: 0 },
  };
  const miner: FactoryNode = {
    id: "miner",
    kind: "extractor",
    extractorId: "miner",
    resourceId: "copper",
    machines: createMachineMembers(1),
    x: 0,
    y: 0,
  };
  const smelter: ManufacturingNode = {
    id: "smelter",
    kind: "manufacturing",
    machineId: "smelter",
    recipeId: "ingot",
    machines: createMachineMembers(1),
    x: 500,
    y: 0,
  };
  const document: FactoryDocument = {
    nodes: [miner, smelter],
    links: [
      {
        id: "ore",
        output: { nodeId: "miner", portKey: "output:copper" },
        input: { nodeId: "smelter", portKey: "input:copper" },
      },
    ],
  };
  return { assets, document, miner, smelter };
}
