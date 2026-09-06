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
});
