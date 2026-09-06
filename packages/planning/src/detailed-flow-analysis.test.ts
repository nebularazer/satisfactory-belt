import { createNode } from "@satisfactory-belt/production";
import { describe, expect, it } from "vitest";

import {
  analyzeDetailedPlan,
  createDetailedPlan,
  DetailedPlanError,
} from "./index";

function detailedNode(request: Parameters<typeof createNode>[0]) {
  return { configuration: createNode(request).configuration };
}

describe("Detailed Plans", () => {
  it("analyzes a dedicated Conveyor and its capacity", () => {
    const plan = createDetailedPlan({
      connections: [
        {
          from: { nodeId: "smelter", portId: "output:Desc_IronIngot_C" },
          id: "belt",
          kind: "conveyor",
          tierId: "conveyor-mk1",
          to: { nodeId: "constructor", portId: "input:Desc_IronIngot_C" },
        },
      ],
      nodes: [
        detailedNode({
          buildableId: "Build_SmelterMk1_C",
          id: "smelter",
          kind: "process",
          processId: "Recipe_IngotIron_C",
        }),
        detailedNode({
          buildableId: "Build_ConstructorMk1_C",
          id: "constructor",
          kind: "process",
          processId: "Recipe_IronPlate_C",
        }),
      ],
    });
    const analysis = analyzeDetailedPlan(plan);
    expect(analysis.connectionFlows).toEqual([
      { connectionId: "belt", itemId: "Desc_IronIngot_C", ratePerMinute: 30 },
    ]);
    expect(analysis.conveyorProfiles[0]).toMatchObject({
      totalRatePerMinute: 30,
      utilization: 0.5,
    });
    expect(analysis.machineEfficiency.constructor).toBe(1);
  });

  it("analyzes separate networks carrying the same Descriptor", () => {
    const plan = createDetailedPlan({
      connections: [1, 2].map((index) => ({
        from: {
          nodeId: `smelter-${index}`,
          portId: "output:Desc_IronIngot_C",
        },
        id: `belt-${index}`,
        kind: "conveyor" as const,
        tierId: "conveyor-mk1",
        to: {
          nodeId: `constructor-${index}`,
          portId: "input:Desc_IronIngot_C",
        },
      })),
      nodes: [1, 2].flatMap((index) => [
        detailedNode({
          buildableId: "Build_SmelterMk1_C",
          id: `smelter-${index}`,
          kind: "process",
          processId: "Recipe_IngotIron_C",
        }),
        detailedNode({
          buildableId: "Build_ConstructorMk1_C",
          id: `constructor-${index}`,
          kind: "process",
          processId: "Recipe_IronPlate_C",
        }),
      ]),
    });

    expect(analyzeDetailedPlan(plan).connectionFlows).toEqual([
      {
        connectionId: "belt-1",
        itemId: "Desc_IronIngot_C",
        ratePerMinute: 30,
      },
      {
        connectionId: "belt-2",
        itemId: "Desc_IronIngot_C",
        ratePerMinute: 30,
      },
    ]);
  });

  it("rejects a Pipeline network carrying multiple Descriptors", () => {
    const nodes = [
      detailedNode({
        buildableId: "Build_PipelineJunction_Cross_C",
        id: "junction",
        kind: "router",
      }),
      detailedNode({
        buildableId: "Build_IndustrialTank_C",
        id: "water",
        itemId: "Desc_Water_C",
        kind: "buffer",
      }),
      detailedNode({
        buildableId: "Build_IndustrialTank_C",
        id: "oil",
        itemId: "Desc_LiquidOil_C",
        kind: "buffer",
      }),
    ];
    expect(() =>
      createDetailedPlan({
        connections: [
          {
            from: { nodeId: "water", portId: "port:1" },
            id: "water-pipe",
            kind: "pipeline",
            tierId: "pipeline-mk1",
            to: { nodeId: "junction", portId: "port:1" },
          },
          {
            from: { nodeId: "oil", portId: "port:1" },
            id: "oil-pipe",
            kind: "pipeline",
            tierId: "pipeline-mk1",
            to: { nodeId: "junction", portId: "port:2" },
          },
        ],
        nodes,
      }),
    ).toThrow(DetailedPlanError);
  });

  function sushiPlan(includeSecondCopperConsumer = true) {
    const nodes = [
      detailedNode({
        buildableId: "Build_SmelterMk1_C",
        id: "iron-source",
        instances: [{ clockSpeedPercent: 250, id: "iron-smelter" }],
        kind: "process",
        processId: "Recipe_IngotIron_C",
      }),
      detailedNode({
        buildableId: "Build_SmelterMk1_C",
        id: "copper-source",
        kind: "process",
        processId: "Recipe_IngotCopper_C",
      }),
      detailedNode({
        buildableId: "Build_ConveyorAttachmentMerger_C",
        id: "merger",
        kind: "router",
      }),
      {
        ...detailedNode({
          buildableId: "Build_ConveyorAttachmentSplitterSmart_C",
          id: "smart-splitter",
          kind: "router",
        }),
        routingRules: [
          {
            itemIds: ["Desc_IronIngot_C"],
            outputPortId: "output:1",
          },
          {
            itemIds: ["Desc_CopperIngot_C"],
            outputPortId: "output:2",
          },
          {
            itemIds: ["Desc_CopperIngot_C"],
            outputPortId: "output:3",
          },
        ],
      },
      detailedNode({
        buildableId: "Build_ConstructorMk1_C",
        id: "iron-consumer",
        instances: [{ clockSpeedPercent: 250, id: "plate-constructor" }],
        kind: "process",
        processId: "Recipe_IronPlate_C",
      }),
      detailedNode({
        buildableId: "Build_ConstructorMk1_C",
        id: "copper-consumer-1",
        kind: "process",
        processId: "Recipe_Wire_C",
      }),
      ...(includeSecondCopperConsumer
        ? [
            detailedNode({
              buildableId: "Build_ConstructorMk1_C",
              id: "copper-consumer-2",
              kind: "process",
              processId: "Recipe_Wire_C",
            }),
          ]
        : []),
    ];
    return createDetailedPlan({
      connections: [
        {
          from: { nodeId: "iron-source", portId: "output:Desc_IronIngot_C" },
          id: "iron-in",
          kind: "conveyor",
          tierId: "conveyor-mk1",
          to: { nodeId: "merger", portId: "input:1" },
        },
        {
          from: {
            nodeId: "copper-source",
            portId: "output:Desc_CopperIngot_C",
          },
          id: "copper-in",
          kind: "conveyor",
          tierId: "conveyor-mk1",
          to: { nodeId: "merger", portId: "input:2" },
        },
        {
          from: { nodeId: "merger", portId: "output:1" },
          id: "sushi-trunk",
          kind: "conveyor",
          tierId: "conveyor-mk1",
          to: { nodeId: "smart-splitter", portId: "input:1" },
        },
        {
          from: { nodeId: "smart-splitter", portId: "output:1" },
          id: "iron-out",
          kind: "conveyor",
          tierId: "conveyor-mk1",
          to: { nodeId: "iron-consumer", portId: "input:Desc_IronIngot_C" },
        },
        {
          from: { nodeId: "smart-splitter", portId: "output:2" },
          id: "copper-out-1",
          kind: "conveyor",
          tierId: "conveyor-mk1",
          to: {
            nodeId: "copper-consumer-1",
            portId: "input:Desc_CopperIngot_C",
          },
        },
        ...(includeSecondCopperConsumer
          ? [
              {
                from: { nodeId: "smart-splitter", portId: "output:3" },
                id: "copper-out-2",
                kind: "conveyor" as const,
                tierId: "conveyor-mk1",
                to: {
                  nodeId: "copper-consumer-2",
                  portId: "input:Desc_CopperIngot_C",
                },
              },
            ]
          : []),
      ],
      nodes,
    });
  }

  it("tracks each Descriptor on an overloaded Sushi Belt independently", () => {
    const analysis = analyzeDetailedPlan(sushiPlan());
    const trunk = analysis.conveyorProfiles.find(
      ({ connectionId }) => connectionId === "sushi-trunk",
    );
    expect(trunk).toMatchObject({
      flows: [
        { itemId: "Desc_CopperIngot_C", ratePerMinute: 30 },
        { itemId: "Desc_IronIngot_C", ratePerMinute: 75 },
      ],
      totalRatePerMinute: 105,
      utilization: 1.75,
    });
    expect(analysis.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "detailed.connection.overload",
        connectionId: "sushi-trunk",
      }),
    );
    expect(analysis.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "detailed.sushi.robust",
        connectionId: "sushi-trunk",
      }),
    );
  });

  it("labels a feasible average Sushi flow as deadlock-sensitive when material accumulates", () => {
    const analysis = analyzeDetailedPlan(sushiPlan(false));
    expect(analysis.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "detailed.sushi.deadlock-risk",
        connectionId: "sushi-trunk",
      }),
    );
  });
});
