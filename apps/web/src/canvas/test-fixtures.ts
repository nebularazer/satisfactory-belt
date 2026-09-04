import type { NodeTemplate } from "@satisfactory-belt/production";

import type { CanvasNode } from "./document";

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
