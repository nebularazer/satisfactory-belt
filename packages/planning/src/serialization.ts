import { parseNodeConfiguration } from "@satisfactory-belt/production";

import { createBasicPlan } from "./basic-topology";
import { createDetailedPlan } from "./detailed-plan";
import { createLayoutPlan } from "./layout-plan";
import type {
  BasicNode,
  BasicPlan,
  DetailedNode,
  DetailedPlan,
  LayoutPlan,
  LogisticsTier,
  MaterialEndpoint,
  MaterialLink,
  PhysicalConnection,
  PlanPosition,
  RoutingRule,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} must be a non-empty string.`);
  }
  return value;
}

function endpoint(value: unknown): MaterialEndpoint {
  if (!isRecord(value))
    throw new Error("A material endpoint must be an object.");
  return {
    nodeId: requiredString(value, "nodeId"),
    portId: requiredString(value, "portId"),
  };
}

function position(value: unknown): PlanPosition | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    typeof value.x !== "number" ||
    !Number.isFinite(value.x) ||
    typeof value.y !== "number" ||
    !Number.isFinite(value.y)
  ) {
    throw new Error("A Plan position must contain finite x and y coordinates.");
  }
  return { x: value.x, y: value.y };
}

function routingRules(value: unknown): readonly RoutingRule[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("routingRules must be an array.");
  return value.map((rule) => {
    if (
      !isRecord(rule) ||
      !Array.isArray(rule.itemIds) ||
      !rule.itemIds.every((item) => typeof item === "string")
    ) {
      throw new Error("A routing rule must contain Descriptor ids.");
    }
    return {
      itemIds: rule.itemIds,
      outputPortId: requiredString(rule, "outputPortId"),
      ...(rule.overflow === true ? { overflow: true } : {}),
    };
  });
}

function provenance(value: unknown) {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !Array.isArray(value.requestOutputItemIds) ||
    !value.requestOutputItemIds.every((itemId) => typeof itemId === "string") ||
    (value.processId !== undefined && typeof value.processId !== "string")
  ) {
    throw new Error("Generation provenance is invalid.");
  }
  return {
    ...(typeof value.processId === "string"
      ? { processId: value.processId }
      : {}),
    requestOutputItemIds: value.requestOutputItemIds,
  };
}

function materialLink(value: unknown): MaterialLink {
  if (!isRecord(value)) throw new Error("A Material Link must be an object.");
  return {
    from: endpoint(value.from),
    id: requiredString(value, "id"),
    to: endpoint(value.to),
  };
}

function detailedNode(value: unknown): DetailedNode {
  if (!isRecord(value)) throw new Error("A Detailed Node must be an object.");
  const rules = routingRules(value.routingRules);
  const parsedProvenance = provenance(value.provenance);
  return {
    configuration: parseNodeConfiguration(value.configuration),
    ...(parsedProvenance ? { provenance: parsedProvenance } : {}),
    ...(rules ? { routingRules: rules } : {}),
  };
}

function tier(value: unknown): LogisticsTier {
  if (!isRecord(value)) throw new Error("A Logistics tier must be an object.");
  if (value.medium !== "conveyor" && value.medium !== "pipeline") {
    throw new Error("A Logistics tier has an invalid medium.");
  }
  if (
    typeof value.capacityPerMinute !== "number" ||
    !Number.isFinite(value.capacityPerMinute)
  ) {
    throw new Error("A Logistics tier must have a finite capacity.");
  }
  return {
    capacityPerMinute: value.capacityPerMinute,
    id: requiredString(value, "id"),
    medium: value.medium,
  };
}

function physicalConnection(value: unknown): PhysicalConnection {
  if (!isRecord(value))
    throw new Error("A physical connection must be an object.");
  if (value.kind !== "conveyor" && value.kind !== "pipeline") {
    throw new Error("A physical connection has an invalid kind.");
  }
  return {
    from: endpoint(value.from),
    id: requiredString(value, "id"),
    kind: value.kind,
    tierId: requiredString(value, "tierId"),
    to: endpoint(value.to),
  };
}

export function parseBasicPlan(value: unknown): BasicPlan {
  if (!isRecord(value) || value.kind !== "basic" || value.version !== 1) {
    throw new Error("The value is not a supported Basic Plan.");
  }
  if (!Array.isArray(value.nodes) || !Array.isArray(value.materialLinks)) {
    throw new Error("A Basic Plan must contain Nodes and Material Links.");
  }
  const nodes: BasicNode[] = value.nodes.map((node) => {
    if (!isRecord(node)) throw new Error("A Basic Node must be an object.");
    const parsedPosition = position(node.position);
    const parsedProvenance = provenance(node.provenance);
    return {
      configuration: parseNodeConfiguration(node.configuration),
      ...(parsedPosition ? { position: parsedPosition } : {}),
      ...(parsedProvenance ? { provenance: parsedProvenance } : {}),
    };
  });
  return createBasicPlan({
    materialLinks: value.materialLinks.map(materialLink),
    nodes,
  });
}

export function parseDetailedPlan(value: unknown): DetailedPlan {
  if (!isRecord(value) || value.kind !== "detailed" || value.version !== 1) {
    throw new Error("The value is not a supported Detailed Plan.");
  }
  if (
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.connections) ||
    !Array.isArray(value.tiers)
  ) {
    throw new Error(
      "A Detailed Plan must contain Nodes, connections, and tiers.",
    );
  }
  return createDetailedPlan({
    connections: value.connections.map(physicalConnection),
    nodes: value.nodes.map(detailedNode),
    tiers: value.tiers.map(tier),
  });
}

export function parseLayoutPlan(value: unknown): LayoutPlan {
  if (!isRecord(value) || value.kind !== "layout" || value.version !== 1) {
    throw new Error("The value is not a supported Layout Plan.");
  }
  if (!isRecord(value.positions) || !Array.isArray(value.routes)) {
    throw new Error("A Layout Plan must contain positions and routes.");
  }
  return createLayoutPlan({
    detailedPlan: parseDetailedPlan(value.detailedPlan),
    positions: Object.fromEntries(
      Object.entries(value.positions).map(([nodeId, entry]) => [
        nodeId,
        position(entry)!,
      ]),
    ),
    routes: value.routes.map((route) => {
      if (!isRecord(route) || !Array.isArray(route.points)) {
        throw new Error("A Layout route must contain points.");
      }
      return {
        connectionId: requiredString(route, "connectionId"),
        points: route.points.map((pointValue) => position(pointValue)!),
      };
    }),
  });
}

export function parsePlan(
  serialized: string,
): BasicPlan | DetailedPlan | LayoutPlan {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (!isRecord(value)) throw new Error("The file does not contain a Plan.");
  if (value.kind === "basic") return parseBasicPlan(value);
  if (value.kind === "detailed") return parseDetailedPlan(value);
  if (value.kind === "layout") return parseLayoutPlan(value);
  throw new Error(`Unsupported Plan Kind: ${String(value.kind)}.`);
}

export function serializePlan(plan: BasicPlan | DetailedPlan | LayoutPlan) {
  return JSON.stringify(plan, null, 2);
}
