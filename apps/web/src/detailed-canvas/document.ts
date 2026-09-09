import { parseGroupNames, type GroupNames } from "@/canvas/group-names";
import {
  parseConnectionRoute,
  type ConnectionRoute,
} from "@/canvas/connection-route";
import {
  assertDetailedNodeConfiguration,
  createDetailedPlan,
  parseDetailedPlan,
  type DetailedNode,
  type DetailedPlan,
  type LogisticsTier,
  type PhysicalConnection,
} from "@satisfactory-belt/planning";
import { parseNodeConfiguration } from "@satisfactory-belt/production";

import type {
  CanvasNode,
  CanvasPortOrder,
  CanvasRouterPriorities,
  CanvasRouterRules,
} from "@/canvas/document";

export const DETAILED_CANVAS_DOCUMENT_VERSION = 1;

export type DetailedCanvasNode = Omit<CanvasNode, "configuration"> &
  Readonly<{
    configuration: DetailedNode["configuration"];
    routingRules?: DetailedNode["routingRules"];
  }>;

export type DetailedCanvasDocument = Readonly<{
  groupNames?: GroupNames;
  connectionRoutes?: Readonly<Record<string, ConnectionRoute>>;
  manualConnectionIds?: readonly string[];
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
    nodes: document.nodes.map(
      ({ configuration, provenance, routingRules }) => ({
        configuration,
        ...(provenance ? { provenance } : {}),
        ...(routingRules ? { routingRules } : {}),
      }),
    ),
    tiers: document.tiers,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stringArray(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string")
  ) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

function parsePortOrder(value: unknown): CanvasPortOrder | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Node portOrder must be an object.");
  const input = stringArray(value.input, "Node input port order");
  const output = stringArray(value.output, "Node output port order");
  return {
    ...(input ? { input } : {}),
    ...(output ? { output } : {}),
  };
}

function parseRouterPriorities(
  value: unknown,
): CanvasRouterPriorities | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error("Node routerPriorities must be an object.");
  }
  return Object.fromEntries(
    Object.entries(value).map(([portId, priority]) => {
      if (priority !== "low" && priority !== "medium" && priority !== "high") {
        throw new Error(`Priority for ${portId} is invalid.`);
      }
      return [portId, priority];
    }),
  );
}

function parseRouterRules(value: unknown): CanvasRouterRules | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Node routerRules must be an object.");
  return Object.fromEntries(
    Object.entries(value).map(([portId, rules]) => {
      const parsed = stringArray(rules, `Rules for ${portId}`);
      if (!parsed) throw new Error(`Rules for ${portId} are required.`);
      return [portId, parsed];
    }),
  );
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
    const configuration = parseNodeConfiguration(nodeValue.configuration);
    assertDetailedNodeConfiguration(configuration);
    const portOrder = parsePortOrder(nodeValue.portOrder);
    const routerPriorities = parseRouterPriorities(nodeValue.routerPriorities);
    const routerRules = parseRouterRules(nodeValue.routerRules);
    return {
      configuration,
      height: nodeValue.height,
      label: nodeValue.label,
      ...(portOrder ? { portOrder } : {}),
      ...(nodeValue.provenance !== undefined
        ? {
            provenance:
              nodeValue.provenance as DetailedCanvasNode["provenance"],
          }
        : {}),
      ...(Array.isArray(nodeValue.routingRules)
        ? {
            routingRules:
              nodeValue.routingRules as DetailedNode["routingRules"],
          }
        : {}),
      ...(routerPriorities ? { routerPriorities } : {}),
      ...(routerRules ? { routerRules } : {}),
      width: nodeValue.width,
      x: nodeValue.x,
      y: nodeValue.y,
    };
  });
  let connectionRoutes: Record<string, ConnectionRoute> | undefined;
  if (value.connectionRoutes !== undefined) {
    if (!isRecord(value.connectionRoutes))
      throw new Error("Connection routes must be an object.");
    connectionRoutes = Object.fromEntries(
      Object.entries(value.connectionRoutes).map(([id, route]) => {
        const points = parseConnectionRoute(route);
        if (!points) throw new Error("Connection route is missing.");
        return [id, points];
      }),
    );
  }
  const candidate = {
    connections: value.connections,
    kind: "detailed" as const,
    nodes,
    tiers: value.tiers,
    version: 1 as const,
  };
  const plan = parseDetailedPlan(candidate);
  if (
    connectionRoutes &&
    Object.keys(connectionRoutes).some(
      (id) => !plan.connections.some((connection) => connection.id === id),
    )
  )
    throw new Error("Route references an unknown connection.");
  const manualConnectionIds = stringArray(
    value.manualConnectionIds,
    "Manual connection ids",
  );
  if (
    manualConnectionIds &&
    (new Set(manualConnectionIds).size !== manualConnectionIds.length ||
      manualConnectionIds.some((id) => !connectionRoutes?.[id]))
  )
    throw new Error("Manual connection ids must reference saved routes.");
  return {
    ...candidate,
    ...(manualConnectionIds ? { manualConnectionIds } : {}),
    ...(value.groupNames !== undefined
      ? { groupNames: parseGroupNames(value.groupNames) }
      : {}),
    ...(connectionRoutes ? { connectionRoutes } : {}),
    connections: plan.connections,
    nodes: nodes.map((node, index) => ({
      ...node,
      ...(plan.nodes[index]?.provenance
        ? { provenance: plan.nodes[index].provenance }
        : {}),
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
