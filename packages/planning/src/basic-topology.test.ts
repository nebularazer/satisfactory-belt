import { createNode } from "@satisfactory-belt/production";
import { describe, expect, it } from "vitest";

import {
  analyzeBasicPlan,
  BasicPlanError,
  connectMaterialPorts,
  createBasicPlan,
  disconnectMaterialLink,
  inspectMaterialConnectionTargets,
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
  it("classifies deliberate connection targets with stable reasons", () => {
    const plan = createBasicPlan({ nodes: [miner, smelter] });
    const targets = inspectMaterialConnectionTargets(plan, {
      nodeId: "miner",
      portId: "output:Desc_OreIron_C",
    });

    expect(
      targets.find(
        ({ endpoint }) =>
          endpoint.nodeId === "smelter" &&
          endpoint.portId === "input:Desc_OreIron_C",
      ),
    ).toEqual({
      endpoint: {
        nodeId: "smelter",
        portId: "input:Desc_OreIron_C",
      },
      status: "compatible",
    });
    expect(
      targets.find(
        ({ endpoint }) =>
          endpoint.nodeId === "smelter" &&
          endpoint.portId === "output:Desc_IronIngot_C",
      ),
    ).toMatchObject({
      error: { code: "basic.endpoint.direction" },
      status: "invalid",
    });
  });

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

  it("infers through Splitter fan-out, Merger fan-in, and Buffers", () => {
    const ironSource = node({
      buildableId: "Build_SmelterMk1_C",
      id: "source",
      kind: "process",
      processId: "Recipe_IngotIron_C",
    });
    const splitter = node({
      buildableId: "Build_ConveyorAttachmentSplitter_C",
      id: "splitter",
      kind: "router",
    });
    const buffer = node({
      buildableId: "Build_StorageContainerMk1_C",
      id: "buffer",
      kind: "buffer",
    });
    const firstConsumer = node({
      buildableId: "Build_ConstructorMk1_C",
      id: "consumer-1",
      kind: "process",
      processId: "Recipe_IronPlate_C",
    });
    const secondConsumer = node({
      buildableId: "Build_ConstructorMk1_C",
      id: "consumer-2",
      kind: "process",
      processId: "Recipe_IronPlate_C",
    });
    const plan = createBasicPlan({
      materialLinks: [
        {
          from: { nodeId: "source", portId: "output:Desc_IronIngot_C" },
          id: "source-splitter",
          to: { nodeId: "splitter", portId: "input:1" },
        },
        {
          from: { nodeId: "splitter", portId: "output:1" },
          id: "splitter-buffer",
          to: { nodeId: "buffer", portId: "input:1" },
        },
        {
          from: { nodeId: "buffer", portId: "output:1" },
          id: "buffer-first",
          to: { nodeId: "consumer-1", portId: "input:Desc_IronIngot_C" },
        },
        {
          from: { nodeId: "splitter", portId: "output:2" },
          id: "splitter-second",
          to: { nodeId: "consumer-2", portId: "input:Desc_IronIngot_C" },
        },
      ],
      nodes: [ironSource, splitter, buffer, firstConsumer, secondConsumer],
    });
    expect(analyzeBasicPlan(plan).networks).toEqual([
      expect.objectContaining({
        itemId: "Desc_IronIngot_C",
        linkIds: [
          "buffer-first",
          "source-splitter",
          "splitter-buffer",
          "splitter-second",
        ],
      }),
    ]);

    const secondSource = {
      ...ironSource,
      configuration: { ...ironSource.configuration, id: "source-2" },
    };
    const merger = node({
      buildableId: "Build_ConveyorAttachmentMerger_C",
      id: "merger",
      kind: "router",
    });
    expect(() =>
      createBasicPlan({
        materialLinks: [
          {
            from: { nodeId: "source", portId: "output:Desc_IronIngot_C" },
            id: "first-merger",
            to: { nodeId: "merger", portId: "input:1" },
          },
          {
            from: { nodeId: "source-2", portId: "output:Desc_IronIngot_C" },
            id: "second-merger",
            to: { nodeId: "merger", portId: "input:2" },
          },
          {
            from: { nodeId: "merger", portId: "output:1" },
            id: "merged",
            to: { nodeId: "consumer-1", portId: "input:Desc_IronIngot_C" },
          },
        ],
        nodes: [ironSource, secondSource, merger, firstConsumer],
      }),
    ).not.toThrow();
  });

  it.each([
    [
      "dangling references",
      [
        {
          from: { nodeId: "missing", portId: "output" },
          id: "bad",
          to: { nodeId: "smelter", portId: "input:Desc_OreIron_C" },
        },
      ],
      [miner, smelter],
      "basic.endpoint.missing",
    ],
    [
      "medium mismatch",
      [
        {
          from: { nodeId: "miner", portId: "output:Desc_OreIron_C" },
          id: "bad",
          to: { nodeId: "junction", portId: "port:1" },
        },
      ],
      [
        miner,
        node({
          buildableId: "Build_PipelineJunction_Cross_C",
          id: "junction",
          kind: "router",
        }),
      ],
      "basic.endpoint.medium",
    ],
    [
      "unsupported remote medium",
      [
        {
          from: { nodeId: "truck", portId: "cargo:remote" },
          id: "bad",
          to: { nodeId: "smelter", portId: "input:Desc_OreIron_C" },
        },
      ],
      [
        node({
          buildableId: "Build_TruckStation_C",
          id: "truck",
          kind: "transport",
          mode: "load",
        }),
        smelter,
      ],
      "basic.port.unsupported-medium",
    ],
  ])("rejects %s", (_label, materialLinks, nodes, code) => {
    expect(() => createBasicPlan({ materialLinks, nodes })).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it("rejects an indirect Descriptor conflict through an unbound Router", () => {
    expect(() =>
      createBasicPlan({
        materialLinks: [
          {
            from: { nodeId: "iron", portId: "output:1" },
            id: "iron-link",
            to: { nodeId: "merger", portId: "input:1" },
          },
          {
            from: { nodeId: "copper", portId: "output:1" },
            id: "copper-link",
            to: { nodeId: "merger", portId: "input:2" },
          },
        ],
        nodes: [
          node({
            buildableId: "Build_StorageContainerMk1_C",
            id: "iron",
            itemId: "Desc_IronPlate_C",
            kind: "buffer",
          }),
          node({
            buildableId: "Build_StorageContainerMk1_C",
            id: "copper",
            itemId: "Desc_Wire_C",
            kind: "buffer",
          }),
          node({
            buildableId: "Build_ConveyorAttachmentMerger_C",
            id: "merger",
            kind: "router",
          }),
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "basic.link.descriptor-conflict" }),
    );
  });
});
