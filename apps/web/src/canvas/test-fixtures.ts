import { createNode, type NodeTemplate } from "@satisfactory-belt/production";

import {
  EMPTY_CANVAS_DOCUMENT,
  type CanvasNode,
  type CanvasDocument,
} from "./document";

export const TEST_NODE_TEMPLATE: NodeTemplate = {
  buildableId: "Build_ConveyorAttachmentSplitter_C",
  kind: "router",
};

export function testCanvasNode(
  id: string,
  x = 0,
  y = 0,
  overrides: Partial<Omit<CanvasNode, "configuration">> = {},
): CanvasNode {
  return {
    configuration: {
      buildableId: "Build_ConveyorAttachmentSplitter_C",
      id,
      kind: "router",
    },
    height: 96,
    label: id,
    width: 176,
    x,
    y,
    ...overrides,
  };
}

/** Balanced fan-out and fan-in around identical smelters for layout tests. */
export function testBalancerFactory(arity = 3): CanvasDocument {
  const router = (id: string, merge = false): CanvasNode => ({
    ...testCanvasNode(id, 0, 0, { width: 128, height: 128 }),
    configuration: {
      kind: "router",
      id,
      buildableId: merge
        ? "Build_ConveyorAttachmentMerger_C"
        : "Build_ConveyorAttachmentSplitter_C",
    },
  });
  const nodes: CanvasNode[] = [
    router("split-root"),
    router("merge-root", true),
  ];
  const links: CanvasDocument["materialLinks"][number][] = [];
  for (let branch = 1; branch <= arity; branch++) {
    nodes.push(router(`split-${branch}`), router(`merge-${branch}`, true));
    links.push(
      {
        id: `split-${branch}`,
        from: { nodeId: "split-root", portId: `output:${branch}` },
        to: { nodeId: `split-${branch}`, portId: "input:1" },
      },
      {
        id: `merge-${branch}`,
        from: { nodeId: `merge-${branch}`, portId: "output:1" },
        to: { nodeId: "merge-root", portId: `input:${branch}` },
      },
    );
    for (let leaf = 1; leaf <= arity; leaf++) {
      const id = `machine-${branch}-${leaf}`;
      nodes.push({
        configuration: createNode({
          id,
          kind: "process",
          buildableId: "Build_SmelterMk1_C",
          processId: "Recipe_IngotIron_C",
        }).configuration,
        label: "Iron Ingot",
        width: 256,
        height: 256,
        x: 0,
        y: 0,
      });
      links.push(
        {
          id: `in-${id}`,
          from: { nodeId: `split-${branch}`, portId: `output:${leaf}` },
          to: { nodeId: id, portId: "input:Desc_OreIron_C" },
        },
        {
          id: `out-${id}`,
          from: { nodeId: id, portId: "output:Desc_IronIngot_C" },
          to: { nodeId: `merge-${branch}`, portId: `input:${leaf}` },
        },
      );
    }
  }
  return { ...EMPTY_CANVAS_DOCUMENT, nodes, materialLinks: links };
}
