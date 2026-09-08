import {
  createNode,
  type NodeConfiguration,
} from "@satisfactory-belt/production";
import {
  CANVAS_DOCUMENT_VERSION,
  type CanvasDocument,
  type CanvasNode,
} from "./document";
import { nodeCardLayout } from "./node-card-layout";
function processConfiguration(
  id: string,
  buildableId: string,
  processId: string,
  count: number,
  clockSpeedPercent = 100,
) {
  const node = createNode({ buildableId, id, kind: "process", processId });
  if (node.kind !== "process") throw new Error("Expected a Process Node.");
  const base = node.configuration.instances[0]!;
  return createNode({
    ...node.configuration,
    instances: Array.from({ length: count }, (_, index) => ({
      ...base,
      ...(base && "clockSpeedPercent" in base ? { clockSpeedPercent } : {}),
      id: `${id}:instance:${index + 1}`,
    })),
  }).configuration;
}

function canvasNode(
  configuration: NodeConfiguration,
  label: string,
  x: number,
  y: number,
): CanvasNode {
  const layout = nodeCardLayout(configuration);
  return {
    configuration,
    height: layout.height,
    label,
    width: layout.width,
    x,
    y,
  };
}

export function modularFrameFactory(withSplitter: boolean): CanvasDocument {
  const nodes = [
    canvasNode(
      processConfiguration(
        "miners",
        "Build_MinerMk2_C",
        "extraction:Desc_OreIron_C",
        8,
      ),
      "Iron Ore Extraction",
      0,
      300,
    ),
    canvasNode(
      processConfiguration(
        "smelters",
        "Build_SmelterMk1_C",
        "Recipe_IngotIron_C",
        16,
      ),
      "Iron Ingot",
      320,
      300,
    ),
    ...(withSplitter
      ? [
          canvasNode(
            createNode({
              buildableId: "Build_ConveyorAttachmentSplitter_C",
              id: "ingot-splitter",
              kind: "router",
            }).configuration,
            "Splitter",
            640,
            300,
          ),
        ]
      : []),
    canvasNode(
      processConfiguration(
        "plates",
        "Build_ConstructorMk1_C",
        "Recipe_IronPlate_C",
        9,
      ),
      "Iron Plate",
      960,
      0,
    ),
    canvasNode(
      processConfiguration(
        "screws",
        "Build_ConstructorMk1_C",
        "Recipe_Alternate_Screw_C",
        8,
        90,
      ),
      "Cast Screws",
      960,
      300,
    ),
    canvasNode(
      processConfiguration(
        "rods",
        "Build_ConstructorMk1_C",
        "Recipe_IronRod_C",
        8,
      ),
      "Iron Rod",
      960,
      600,
    ),
    canvasNode(
      processConfiguration(
        "reinforced-plates",
        "Build_AssemblerMk1_C",
        "Recipe_IronPlateReinforced_C",
        6,
      ),
      "Reinforced Iron Plate",
      1_280,
      150,
    ),
    canvasNode(
      processConfiguration(
        "frames",
        "Build_AssemblerMk1_C",
        "Recipe_ModularFrame_C",
        10,
      ),
      "Modular Frame",
      1_600,
      450,
    ),
  ];
  const ingotSource = withSplitter
    ? { nodeId: "ingot-splitter", portId: "output:1" }
    : { nodeId: "smelters", portId: "output:Desc_IronIngot_C" };
  const ingotSourceTwo = withSplitter
    ? { nodeId: "ingot-splitter", portId: "output:2" }
    : { nodeId: "smelters", portId: "output:Desc_IronIngot_C" };
  const ingotSourceThree = withSplitter
    ? { nodeId: "ingot-splitter", portId: "output:3" }
    : { nodeId: "smelters", portId: "output:Desc_IronIngot_C" };
  return {
    kind: "basic",
    materialLinks: [
      {
        from: { nodeId: "miners", portId: "output:Desc_OreIron_C" },
        id: "ore",
        to: { nodeId: "smelters", portId: "input:Desc_OreIron_C" },
      },
      ...(withSplitter
        ? [
            {
              from: {
                nodeId: "smelters",
                portId: "output:Desc_IronIngot_C",
              },
              id: "ingots",
              to: { nodeId: "ingot-splitter", portId: "input:1" },
            },
          ]
        : []),
      {
        from: ingotSource,
        id: "plate-ingots",
        to: { nodeId: "plates", portId: "input:Desc_IronIngot_C" },
      },
      {
        from: ingotSourceTwo,
        id: "screw-ingots",
        to: { nodeId: "screws", portId: "input:Desc_IronIngot_C" },
      },
      {
        from: ingotSourceThree,
        id: "rod-ingots",
        to: { nodeId: "rods", portId: "input:Desc_IronIngot_C" },
      },
      {
        from: { nodeId: "plates", portId: "output:Desc_IronPlate_C" },
        id: "plates",
        to: {
          nodeId: "reinforced-plates",
          portId: "input:Desc_IronPlate_C",
        },
      },
      {
        from: { nodeId: "screws", portId: "output:Desc_IronScrew_C" },
        id: "screws",
        to: {
          nodeId: "reinforced-plates",
          portId: "input:Desc_IronScrew_C",
        },
      },
      {
        from: {
          nodeId: "reinforced-plates",
          portId: "output:Desc_IronPlateReinforced_C",
        },
        id: "reinforced-plates",
        to: {
          nodeId: "frames",
          portId: "input:Desc_IronPlateReinforced_C",
        },
      },
      {
        from: { nodeId: "rods", portId: "output:Desc_IronRod_C" },
        id: "rods",
        to: { nodeId: "frames", portId: "input:Desc_IronRod_C" },
      },
    ],
    nodes,
    version: CANVAS_DOCUMENT_VERSION,
  };
}
