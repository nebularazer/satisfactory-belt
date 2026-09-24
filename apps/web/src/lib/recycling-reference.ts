import { createMachineMembers } from "@satisfactory-belt/factory-core";
import type { FactoryDocument, FactoryNode, MaterialLink } from "@satisfactory-belt/factory-core";

const group = (
  id: string,
  recipeId: string,
  count: number,
  x: number,
  y: number,
  clockPercent = 100,
): FactoryNode => ({
  id,
  kind: "manufacturing",
  recipeId,
  machineId: id === "recycling-fuel" ? "Build_Blender_C" : "Build_OilRefinery_C",
  machines: createMachineMembers(count, { clockPercent }),
  x,
  y,
  flow: {
    clockPercent: Math.max(100, clockPercent),
    ...(id === "recycling-plastic"
      ? { targets: { Desc_Plastic_C: 1200 } }
      : id === "recycling-rubber"
        ? { targets: { Desc_Rubber_C: 1200 } }
        : id === "recycling-residual-rubber"
          ? { targets: { Desc_Rubber_C: 150 } }
          : {}),
  },
});
const splitter = (id: string, y: number): FactoryNode => ({
  id,
  kind: "logistics",
  partId: "Build_ConveyorAttachmentSplitter_C",
  x: 1440,
  y,
});
const storage = (id: string, y: number): FactoryNode => ({
  id,
  kind: "facility",
  buildingId: "Build_StorageContainerMk1_C",
  configuration: { type: "storage" },
  machines: createMachineMembers(1),
  x: 1856,
  y,
});
const link = (
  from: string,
  to: string,
  item: string,
  output = `output:${item}`,
  input = `input:${item}`,
  guides?: MaterialLink["guides"],
): MaterialLink => ({
  id: `${from}-${to}`,
  output: { nodeId: from, portKey: output },
  input: { nodeId: to, portKey: input },
  ...(guides ? { guides } : {}),
});

/** Screenshot reference: 450 crude oil + 1,500 water → 600 plastic + 750 rubber.
 * Clocks reproduce the visible counts/rates; hidden Modeler settings are unknown.
 */
export function createRecyclingReference(): FactoryDocument {
  return {
    nodes: [
      group("recycling-residue", "Recipe_Alternate_HeavyOilResidue_C", 12, 64, 1664, 125),
      {
        id: "recycling-water",
        kind: "extractor",
        extractorId: "Build_WaterPump_C",
        resourceId: "Desc_Water_C",
        x: 64,
        y: 2048,
        machines: [...createMachineMembers(12), { id: "13", clockPercent: 50, sloopsUsed: 0 }],
      },
      group("recycling-fuel", "Recipe_Alternate_DilutedFuel_C", 12, 480, 1664),
      group("recycling-residual-rubber", "Recipe_ResidualRubber_C", 8, 480, 2432, 93.75),
      group("recycling-plastic", "Recipe_Alternate_Plastic_1_C", 12, 1024, 1280, 500 / 3),
      group("recycling-rubber", "Recipe_Alternate_RecycledRubber_C", 12, 1024, 2048, 500 / 3),
      splitter("recycling-plastic-splitter", 1344),
      splitter("recycling-rubber-splitter", 2112),
      storage("recycling-plastic-storage", 1280),
      storage("recycling-rubber-storage", 2048),
    ],
    links: [
      link("recycling-residue", "recycling-fuel", "Desc_HeavyOilResidue_C"),
      link("recycling-residue", "recycling-residual-rubber", "Desc_PolymerResin_C"),
      link("recycling-water", "recycling-fuel", "Desc_Water_C"),
      link("recycling-water", "recycling-residual-rubber", "Desc_Water_C"),
      link("recycling-fuel", "recycling-plastic", "Desc_LiquidFuel_C"),
      link("recycling-fuel", "recycling-rubber", "Desc_LiquidFuel_C"),
      link(
        "recycling-plastic",
        "recycling-plastic-splitter",
        "Desc_Plastic_C",
        undefined,
        "input:0",
      ),
      link("recycling-rubber", "recycling-rubber-splitter", "Desc_Rubber_C", undefined, "input:0"),
      link(
        "recycling-plastic-splitter",
        "recycling-plastic-storage",
        "Desc_Plastic_C",
        "output:0",
        "input:0",
      ),
      link(
        "recycling-rubber-splitter",
        "recycling-rubber-storage",
        "Desc_Rubber_C",
        "output:0",
        "input:0",
      ),
      link(
        "recycling-plastic-splitter",
        "recycling-rubber",
        "Desc_Plastic_C",
        "output:1",
        undefined,
        [
          { axis: "x", position: 1728 },
          { axis: "y", position: 1952 },
          { axis: "x", position: 928 },
        ],
      ),
      link(
        "recycling-rubber-splitter",
        "recycling-plastic",
        "Desc_Rubber_C",
        "output:1",
        undefined,
        [
          { axis: "x", position: 1696 },
          { axis: "y", position: 1632 },
          { axis: "x", position: 960 },
        ],
      ),
      link(
        "recycling-residual-rubber",
        "recycling-rubber-storage",
        "Desc_Rubber_C",
        undefined,
        "input:0",
        [{ axis: "x", position: 1760 }],
      ),
    ],
    externalFlows: [
      {
        port: { nodeId: "recycling-residue", portKey: "input:Desc_LiquidOil_C" },
        itemId: "Desc_LiquidOil_C",
        perMinute: 450,
      },
    ],
  };
}
