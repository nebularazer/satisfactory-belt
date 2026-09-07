import { createNode } from "@satisfactory-belt/production";
import { describe, expect, it } from "vitest";

import { analyzeBasicFlows, createBasicPlan } from "./index";

function basicNode(request: Parameters<typeof createNode>[0]) {
  return { configuration: createNode(request).configuration };
}

function instances(nodeId: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${nodeId}:instance-${index + 1}`,
  }));
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

  it("carries process output into a terminal Splitter and infers its ports", () => {
    const plan = createBasicPlan({
      materialLinks: [
        {
          from: { nodeId: "smelter", portId: "output:Desc_IronIngot_C" },
          id: "into-splitter",
          to: { nodeId: "splitter", portId: "input:1" },
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
      ],
    });

    const analysis = analyzeBasicFlows(plan);
    expect(analysis.linkFlows).toEqual([
      {
        itemId: "Desc_IronIngot_C",
        linkId: "into-splitter",
        ratePerMinute: 30,
      },
    ]);
    expect(analysis.portFlows).toEqual(
      expect.arrayContaining([
        {
          endpoint: { nodeId: "splitter", portId: "input:1" },
          itemId: "Desc_IronIngot_C",
          ratePerMinute: 30,
        },
        {
          endpoint: { nodeId: "splitter", portId: "output:1" },
          itemId: "Desc_IronIngot_C",
          ratePerMinute: 10,
        },
        {
          endpoint: { nodeId: "splitter", portId: "output:2" },
          itemId: "Desc_IronIngot_C",
          ratePerMinute: 10,
        },
        {
          endpoint: { nodeId: "splitter", portId: "output:3" },
          itemId: "Desc_IronIngot_C",
          ratePerMinute: 10,
        },
      ]),
    );
  });

  it("carries surplus through connected routers before open ports", () => {
    const plan = createBasicPlan({
      materialLinks: [
        {
          from: { nodeId: "smelter", portId: "output:Desc_IronIngot_C" },
          id: "into-splitter",
          to: { nodeId: "splitter", portId: "input:1" },
        },
        {
          from: { nodeId: "splitter", portId: "output:3" },
          id: "into-merger",
          to: { nodeId: "merger", portId: "input:1" },
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
          buildableId: "Build_ConveyorAttachmentMerger_C",
          id: "merger",
          kind: "router",
        }),
      ],
    });

    const analysis = analyzeBasicFlows(plan);
    expect(
      Object.fromEntries(
        analysis.linkFlows.map(({ linkId, ratePerMinute }) => [
          linkId,
          ratePerMinute,
        ]),
      ),
    ).toEqual({ "into-merger": 30, "into-splitter": 30 });
    expect(
      Object.fromEntries(
        analysis.portFlows
          .filter(({ endpoint }) => endpoint.nodeId === "splitter")
          .map(({ endpoint, ratePerMinute }) => [
            endpoint.portId,
            ratePerMinute,
          ]),
      ),
    ).toEqual({
      "input:1": 30,
      "output:1": 0,
      "output:2": 0,
      "output:3": 30,
    });
    expect(
      Object.fromEntries(
        analysis.portFlows
          .filter(({ endpoint }) => endpoint.nodeId === "merger")
          .map(({ endpoint, ratePerMinute }) => [
            endpoint.portId,
            ratePerMinute,
          ]),
      ),
    ).toEqual({
      "input:1": 30,
      "input:2": undefined,
      "input:3": undefined,
      "output:1": 30,
    });
  });

  it("sums connected inputs at a terminal Merger", () => {
    const plan = createBasicPlan({
      materialLinks: [
        {
          from: {
            nodeId: "smelter-one",
            portId: "output:Desc_IronIngot_C",
          },
          id: "one-into-merger",
          to: { nodeId: "merger", portId: "input:1" },
        },
        {
          from: {
            nodeId: "smelter-two",
            portId: "output:Desc_IronIngot_C",
          },
          id: "two-into-merger",
          to: { nodeId: "merger", portId: "input:2" },
        },
      ],
      nodes: [
        basicNode({
          buildableId: "Build_SmelterMk1_C",
          id: "smelter-one",
          kind: "process",
          processId: "Recipe_IngotIron_C",
        }),
        basicNode({
          buildableId: "Build_SmelterMk1_C",
          id: "smelter-two",
          kind: "process",
          processId: "Recipe_IngotIron_C",
        }),
        basicNode({
          buildableId: "Build_ConveyorAttachmentMerger_C",
          id: "merger",
          kind: "router",
        }),
      ],
    });

    const analysis = analyzeBasicFlows(plan);
    expect(
      Object.fromEntries(
        analysis.linkFlows.map(({ linkId, ratePerMinute }) => [
          linkId,
          ratePerMinute,
        ]),
      ),
    ).toEqual({ "one-into-merger": 30, "two-into-merger": 30 });
    expect(
      analysis.portFlows.find(
        ({ endpoint }) =>
          endpoint.nodeId === "merger" && endpoint.portId === "output:1",
      ),
    ).toEqual({
      endpoint: { nodeId: "merger", portId: "output:1" },
      itemId: "Desc_IronIngot_C",
      ratePerMinute: 60,
    });
  });

  it("splits surplus evenly across equivalent connected branches", () => {
    const plan = createBasicPlan({
      materialLinks: [
        {
          from: { nodeId: "smelter", portId: "output:Desc_IronIngot_C" },
          id: "into-splitter",
          to: { nodeId: "splitter", portId: "input:1" },
        },
        {
          from: { nodeId: "splitter", portId: "output:1" },
          id: "branch-one",
          to: { nodeId: "merger-one", portId: "input:1" },
        },
        {
          from: { nodeId: "splitter", portId: "output:2" },
          id: "branch-two",
          to: { nodeId: "merger-two", portId: "input:1" },
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
          buildableId: "Build_ConveyorAttachmentMerger_C",
          id: "merger-one",
          kind: "router",
        }),
        basicNode({
          buildableId: "Build_ConveyorAttachmentMerger_C",
          id: "merger-two",
          kind: "router",
        }),
      ],
    });

    expect(
      Object.fromEntries(
        analyzeBasicFlows(plan).linkFlows.map(({ linkId, ratePerMinute }) => [
          linkId,
          ratePerMinute,
        ]),
      ),
    ).toEqual({
      "branch-one": 15,
      "branch-two": 15,
      "into-splitter": 30,
    });
  });

  it("caps a Material Link at the supply available to an undersupplied consumer", () => {
    const plan = createBasicPlan({
      materialLinks: [
        {
          from: { nodeId: "miner", portId: "output:Desc_OreIron_C" },
          id: "ore",
          to: { nodeId: "smelters", portId: "input:Desc_OreIron_C" },
        },
      ],
      nodes: [
        basicNode({
          buildableId: "Build_MinerMk1_C",
          id: "miner",
          kind: "process",
          processId: "extraction:Desc_OreIron_C",
        }),
        basicNode({
          buildableId: "Build_SmelterMk1_C",
          id: "smelters",
          instances: instances("smelters", 7),
          kind: "process",
          processId: "Recipe_IngotIron_C",
        }),
      ],
    });

    const analysis = analyzeBasicFlows(plan);
    expect(analysis.linkFlows).toEqual([
      expect.objectContaining({ linkId: "ore", ratePerMinute: 60 }),
    ]);
    expect(analysis.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "basic.network.shortage",
        context: { ratePerMinute: 150 },
      }),
    );
  });

  it("conserves limited supply across Splitter outputs", () => {
    const plan = createBasicPlan({
      materialLinks: [
        {
          from: { nodeId: "miner", portId: "output:Desc_OreIron_C" },
          id: "into-splitter",
          to: { nodeId: "splitter", portId: "input:1" },
        },
        {
          from: { nodeId: "splitter", portId: "output:1" },
          id: "to-one-smelter",
          to: { nodeId: "one-smelter", portId: "input:Desc_OreIron_C" },
        },
        {
          from: { nodeId: "splitter", portId: "output:3" },
          id: "to-three-smelters",
          to: {
            nodeId: "three-smelters",
            portId: "input:Desc_OreIron_C",
          },
        },
      ],
      nodes: [
        basicNode({
          buildableId: "Build_MinerMk1_C",
          id: "miner",
          kind: "process",
          processId: "extraction:Desc_OreIron_C",
        }),
        basicNode({
          buildableId: "Build_ConveyorAttachmentSplitter_C",
          id: "splitter",
          kind: "router",
        }),
        basicNode({
          buildableId: "Build_SmelterMk1_C",
          id: "one-smelter",
          kind: "process",
          processId: "Recipe_IngotIron_C",
        }),
        basicNode({
          buildableId: "Build_SmelterMk1_C",
          id: "three-smelters",
          instances: instances("three-smelters", 3),
          kind: "process",
          processId: "Recipe_IngotIron_C",
        }),
      ],
    });

    const analysis = analyzeBasicFlows(plan);
    const rates = Object.fromEntries(
      analysis.linkFlows.map(({ linkId, ratePerMinute }) => [
        linkId,
        ratePerMinute,
      ]),
    );
    expect(rates).toEqual({
      "into-splitter": 60,
      "to-one-smelter": 30,
      "to-three-smelters": 30,
    });
    expect(rates["to-one-smelter"]! + rates["to-three-smelters"]!).toBe(
      rates["into-splitter"],
    );
    expect(
      Object.fromEntries(
        analysis.portFlows
          .filter(({ endpoint }) => endpoint.nodeId === "splitter")
          .map(({ endpoint, ratePerMinute }) => [
            endpoint.portId,
            ratePerMinute,
          ]),
      ),
    ).toEqual({
      "input:1": 60,
      "output:1": 30,
      "output:2": 0,
      "output:3": 30,
    });
  });
});
