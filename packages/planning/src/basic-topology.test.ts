import { createNode } from "@satisfactory-belt/production";
import { describe, expect, it } from "vitest";

import {
  analyzeBasicPlan,
  BasicPlanError,
  connectMaterialPorts,
  createBasicPlan,
  disconnectMaterialLink,
} from "./index";

function node(configuration: Parameters<typeof createNode>[0]) {
  return { configuration: createNode(configuration).configuration };
}

const miner = node({
  buildableId: "Build_MinerMk1_C",
  id: "miner",
  kind: "process",
  processId: "extraction:Desc_OreIron_C",
});
const smelter = node({
  buildableId: "Build_SmelterMk1_C",
  id: "smelter",
  kind: "process",
  processId: "Recipe_IngotIron_C",
});

describe("Basic topology", () => {
  it("connects, analyzes, and disconnects Material Ports through one interface", () => {
    const empty = createBasicPlan({ nodes: [miner, smelter] });
    const connected = connectMaterialPorts(empty, {
      from: { nodeId: "miner", portId: "output:Desc_OreIron_C" },
      id: "ore",
      to: { nodeId: "smelter", portId: "input:Desc_OreIron_C" },
    });

    expect(analyzeBasicPlan(connected)).toMatchObject({
      linkItemIds: { ore: "Desc_OreIron_C" },
      networks: [{ itemId: "Desc_OreIron_C", linkIds: ["ore"] }],
    });
    expect(disconnectMaterialLink(connected, "ore").materialLinks).toEqual([]);
  });

  it("infers a Descriptor through a cyclic Router network and terminates", () => {
    const routers = ["a", "b", "c"].map((id) =>
      node({
        buildableId: "Build_PipelineJunction_Cross_C",
        id,
        ...(id === "a" ? { itemId: "Desc_Water_C" } : {}),
        kind: "router",
      }),
    );
    const plan = createBasicPlan({
      materialLinks: [
        {
          from: { nodeId: "a", portId: "port:1" },
          id: "ab",
          to: { nodeId: "b", portId: "port:1" },
        },
        {
          from: { nodeId: "b", portId: "port:2" },
          id: "bc",
          to: { nodeId: "c", portId: "port:1" },
        },
        {
          from: { nodeId: "c", portId: "port:2" },
          id: "ca",
          to: { nodeId: "a", portId: "port:2" },
        },
      ],
      nodes: routers,
    });

    expect(analyzeBasicPlan(plan).networks).toEqual([
      expect.objectContaining({
        itemId: "Desc_Water_C",
        linkIds: ["ab", "bc", "ca"],
      }),
    ]);
  });

  it.each([
    [
      "occupied",
      [
        {
          from: { nodeId: "miner", portId: "output:Desc_OreIron_C" },
          id: "one",
          to: { nodeId: "smelter", portId: "input:Desc_OreIron_C" },
        },
        {
          from: { nodeId: "miner", portId: "output:Desc_OreIron_C" },
          id: "two",
          to: { nodeId: "smelter", portId: "output:Desc_IronIngot_C" },
        },
      ],
      "basic.endpoint.occupied",
    ],
    [
      "direction",
      [
        {
          from: { nodeId: "miner", portId: "output:Desc_OreIron_C" },
          id: "bad",
          to: { nodeId: "smelter", portId: "output:Desc_IronIngot_C" },
        },
      ],
      "basic.endpoint.direction",
    ],
  ])(
    "rejects %s endpoints with a stable code",
    (_label, materialLinks, code) => {
      try {
        createBasicPlan({ materialLinks, nodes: [miner, smelter] });
        throw new Error("Expected validation to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(BasicPlanError);
        expect((error as BasicPlanError).code).toBe(code);
      }
    },
  );

  it("normalizes equivalent input order", () => {
    const request = {
      materialLinks: [
        {
          from: { nodeId: "miner", portId: "output:Desc_OreIron_C" },
          id: "ore",
          to: { nodeId: "smelter", portId: "input:Desc_OreIron_C" },
        },
      ],
    } as const;
    expect(
      analyzeBasicPlan(
        createBasicPlan({ ...request, nodes: [miner, smelter] }),
      ),
    ).toEqual(
      analyzeBasicPlan(
        createBasicPlan({ ...request, nodes: [smelter, miner] }),
      ),
    );
  });
});
