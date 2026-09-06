import { createNode } from "@satisfactory-belt/production";
import { describe, expect, it } from "vitest";

import { analyzeBasicFlows, createBasicPlan } from "./index";

function basicNode(request: Parameters<typeof createNode>[0]) {
  return { configuration: createNode(request).configuration };
}

describe("Basic flow analysis", () => {
  it("derives the amount on a Material Link", () => {
    const plan = createBasicPlan({
      materialLinks: [
        {
          from: { nodeId: "smelter", portId: "output:Desc_IronIngot_C" },
          id: "ingots",
          to: {
            nodeId: "constructor",
            portId: "input:Desc_IronIngot_C",
          },
        },
      ],
      nodes: [
        basicNode({
          buildableId: "Build_SmelterMk1_C",
          id: "smelter",
          kind: "process",
          processId: "Recipe_IngotIron_C",
        }),
        basicNode({
          buildableId: "Build_ConstructorMk1_C",
          id: "constructor",
          kind: "process",
          processId: "Recipe_IronPlate_C",
        }),
      ],
    });

    expect(analyzeBasicFlows(plan).linkFlows).toEqual([
      {
        itemId: "Desc_IronIngot_C",
        linkId: "ingots",
        ratePerMinute: 30,
      },
    ]);
  });

  it("routes branch amounts through a Splitter", () => {
    const plan = createBasicPlan({
      materialLinks: [
        {
          from: { nodeId: "smelter", portId: "output:Desc_IronIngot_C" },
          id: "into-splitter",
          to: { nodeId: "splitter", portId: "input:1" },
        },
        {
          from: { nodeId: "splitter", portId: "output:1" },
          id: "to-constructor",
          to: {
            nodeId: "constructor",
            portId: "input:Desc_IronIngot_C",
          },
        },
      ],
      nodes: [
        basicNode({
          buildableId: "Build_SmelterMk1_C",
          id: "smelter",
          kind: "process",
          processId: "Recipe_IngotIron_C",
        }),
        basicNode({
          buildableId: "Build_ConveyorAttachmentSplitter_C",
          id: "splitter",
          kind: "router",
        }),
        basicNode({
          buildableId: "Build_ConstructorMk1_C",
          id: "constructor",
          kind: "process",
          processId: "Recipe_IronPlate_C",
        }),
      ],
    });

    expect(analyzeBasicFlows(plan).linkFlows).toEqual([
      expect.objectContaining({ linkId: "into-splitter", ratePerMinute: 30 }),
      expect.objectContaining({
        linkId: "to-constructor",
        ratePerMinute: 30,
      }),
    ]);
  });
});
