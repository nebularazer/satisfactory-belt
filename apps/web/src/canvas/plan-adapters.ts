import { type BasicPlan, type DetailedPlan } from "@satisfactory-belt/planning";
import { createNode, findBuildable } from "@satisfactory-belt/production";

import type { DetailedCanvasDocument } from "@/detailed-canvas/document";

import {
  CANVAS_DOCUMENT_VERSION,
  type CanvasDocument,
  type CanvasNode,
} from "./document";
import { GRID_INTERVAL } from "./grid";
import { nodeCardLayout } from "./node-card-layout";

function canvasNode(
  configuration: CanvasNode["configuration"],
  index: number,
  position?: Readonly<{ x: number; y: number }>,
): CanvasNode {
  const layout = nodeCardLayout(configuration);
  const resolved = createNode(configuration);
  return {
    configuration,
    height: layout.height,
    label:
      resolved.kind === "process"
        ? resolved.process.name
        : (findBuildable(configuration.buildableId)?.name ??
          `Node ${index + 1}`),
    width: layout.width,
    x: position?.x ?? (index % 5) * (layout.width + GRID_INTERVAL * 2),
    y:
      position?.y ??
      Math.floor(index / 5) * (layout.height + GRID_INTERVAL * 2),
  };
}

export function basicPlanToCanvasDocument(plan: BasicPlan): CanvasDocument {
  return {
    kind: "basic",
    materialLinks: plan.materialLinks,
    nodes: plan.nodes.map((node, index) =>
      canvasNode(node.configuration, index, node.position),
    ),
    version: CANVAS_DOCUMENT_VERSION,
  };
}

export function detailedPlanToCanvasDocument(
  plan: DetailedPlan,
): DetailedCanvasDocument {
  return {
    connections: plan.connections,
    kind: "detailed",
    nodes: plan.nodes.map((node, index) => ({
      ...canvasNode(node.configuration, index),
      ...(node.routingRules ? { routingRules: node.routingRules } : {}),
    })),
    tiers: plan.tiers,
    version: 1,
  };
}
