import { createMachineMembers } from "@satisfactory-belt/factory-core";
import type {
  FactoryDocument,
  ManufacturingNode,
  MaterialLink,
} from "@satisfactory-belt/factory-core";

function group(
  id: string,
  recipeId: string,
  machineId: string,
  count: number,
  x: number,
  y: number,
  clockPercent = 100,
): ManufacturingNode {
  return {
    id,
    kind: "manufacturing",
    recipeId,
    machineId,
    machines: createMachineMembers(count, { clockPercent }),
    x,
    y,
    ...(id === "modular-frames" ? { flow: { targets: { Desc_ModularFrame_C: 20 } } } : {}),
  };
}
function link(from: string, to: string, itemId: string): MaterialLink {
  return {
    id: `${from}-${to}`,
    output: { nodeId: from, portKey: `output:${itemId}` },
    input: { nodeId: to, portKey: `input:${itemId}` },
  };
}

/** Editable reference: 20 modular frames/min, Cast Screws, no other alternates or amplification. */
export function createModularFrameReference(): FactoryDocument {
  return {
    nodes: [
      {
        id: "iron-miners",
        kind: "extractor",
        extractorId: "Build_MinerMk2_C",
        resourceId: "Desc_OreIron_C",
        machines: createMachineMembers(2, { purity: 2 }),
        x: 64,
        y: 384,
      },
      group("iron-ingots", "Recipe_IngotIron_C", "Build_SmelterMk1_C", 16, 480, 384),
      group("iron-plates", "Recipe_IronPlate_C", "Build_ConstructorMk1_C", 9, 896, 64),
      group("cast-screws", "Recipe_Alternate_Screw_C", "Build_ConstructorMk1_C", 8, 896, 384, 90),
      group("iron-rods", "Recipe_IronRod_C", "Build_ConstructorMk1_C", 8, 896, 704),
      group(
        "reinforced-plates",
        "Recipe_IronPlateReinforced_C",
        "Build_AssemblerMk1_C",
        6,
        1312,
        224,
      ),
      group("modular-frames", "Recipe_ModularFrame_C", "Build_AssemblerMk1_C", 10, 1728, 384),
    ],
    links: [
      link("iron-miners", "iron-ingots", "Desc_OreIron_C"),
      link("iron-ingots", "iron-plates", "Desc_IronIngot_C"),
      link("iron-ingots", "cast-screws", "Desc_IronIngot_C"),
      link("iron-ingots", "iron-rods", "Desc_IronIngot_C"),
      link("iron-plates", "reinforced-plates", "Desc_IronPlate_C"),
      link("cast-screws", "reinforced-plates", "Desc_IronScrew_C"),
      link("reinforced-plates", "modular-frames", "Desc_IronPlateReinforced_C"),
      link("iron-rods", "modular-frames", "Desc_IronRod_C"),
    ],
  };
}
