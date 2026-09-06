import {
  createDetailedPlan,
  parseDetailedPlan,
  type DetailedNode,
  type DetailedPlan,
  type LogisticsTier,
  type PhysicalConnection,
} from "@satisfactory-belt/planning";
import { parseNodeConfiguration } from "@satisfactory-belt/production";

import type { CanvasNode } from "@/canvas/document";

export const DETAILED_CANVAS_DOCUMENT_VERSION = 1;

export type DetailedCanvasNode = CanvasNode &
  Readonly<{
    routingRules?: DetailedNode["routingRules"];
  }>;

export type DetailedCanvasDocument = Readonly<{
  connections: readonly PhysicalConnection[];
  kind: "detailed";
  nodes: readonly DetailedCanvasNode[];
  tiers: readonly LogisticsTier[];
  version: typeof DETAILED_CANVAS_DOCUMENT_VERSION;
}>;

export function detailedPlanFromCanvas(
  document: DetailedCanvasDocument,
): DetailedPlan {
  return createDetailedPlan({
    connections: document.connections,
    nodes: document.nodes.map(({ configuration, routingRules }) => ({
      configuration,
      ...(routingRules ? { routingRules } : {}),
    })),
    tiers: document.tiers,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateDetailedCanvasDocument(
  value: unknown,
): DetailedCanvasDocument {
  if (
    !isRecord(value) ||
    value.kind !== "detailed" ||
    value.version !== DETAILED_CANVAS_DOCUMENT_VERSION
  ) {
    throw new Error("The file is not a supported Detailed canvas document.");
  }
  if (
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.connections) ||
    !Array.isArray(value.tiers)
  ) {
    throw new Error(
      "A Detailed canvas document needs Nodes, connections, and tiers.",
    );
  }
  const nodes: DetailedCanvasNode[] = value.nodes.map((nodeValue, index) => {
    if (
      !isRecord(nodeValue) ||
      typeof nodeValue.label !== "string" ||
      !finite(nodeValue.x) ||
      !finite(nodeValue.y) ||
      !finite(nodeValue.width) ||
      !finite(nodeValue.height) ||
      nodeValue.width <= 0 ||
      nodeValue.height <= 0
    ) {
      throw new Error(`Detailed Node ${index + 1} has invalid geometry.`);
    }
    return {
      configuration: parseNodeConfiguration(nodeValue.configuration),
      height: nodeValue.height,
      label: nodeValue.label,
      ...(Array.isArray(nodeValue.routingRules)
        ? {
            routingRules:
              nodeValue.routingRules as DetailedNode["routingRules"],
          }
        : {}),
      width: nodeValue.width,
      x: nodeValue.x,
      y: nodeValue.y,
    };
  });
  const candidate = {
    connections: value.connections,
    kind: "detailed" as const,
    nodes,
    tiers: value.tiers,
    version: 1 as const,
  };
  const plan = parseDetailedPlan(candidate);
  return {
    ...candidate,
    connections: plan.connections,
    nodes: nodes.map((node, index) => ({
      ...node,
      ...(plan.nodes[index]?.routingRules
        ? { routingRules: plan.nodes[index].routingRules }
        : {}),
    })),
    tiers: plan.tiers,
  };
}

export function serializeDetailedCanvasDocument(
  document: DetailedCanvasDocument,
) {
  return JSON.stringify(document, null, 2);
}
