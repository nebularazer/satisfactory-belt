import {
  createNode,
  findDescriptor,
  type MaterialPort,
  type Node,
} from "@satisfactory-belt/production";

import type {
  DetailedNode,
  DetailedPlan,
  LogisticsTier,
  MaterialEndpoint,
  PhysicalConnection,
} from "./types";

export const DEFAULT_LOGISTICS_TIERS: readonly LogisticsTier[] = [
  { capacityPerMinute: 60, id: "conveyor-mk1", medium: "conveyor" },
  { capacityPerMinute: 120, id: "conveyor-mk2", medium: "conveyor" },
  { capacityPerMinute: 270, id: "conveyor-mk3", medium: "conveyor" },
  { capacityPerMinute: 480, id: "conveyor-mk4", medium: "conveyor" },
  { capacityPerMinute: 780, id: "conveyor-mk5", medium: "conveyor" },
  { capacityPerMinute: 1_200, id: "conveyor-mk6", medium: "conveyor" },
  { capacityPerMinute: 300, id: "pipeline-mk1", medium: "pipeline" },
  { capacityPerMinute: 600, id: "pipeline-mk2", medium: "pipeline" },
];

export type DetailedPlanErrorCode =
  | "detailed.connection.direction"
  | "detailed.connection.duplicate-id"
  | "detailed.connection.form"
  | "detailed.connection.kind"
  | "detailed.connection.self"
  | "detailed.endpoint.missing"
  | "detailed.endpoint.occupied"
  | "detailed.node.aggregate"
  | "detailed.node.duplicate-id"
  | "detailed.pipeline.mixed-descriptor"
  | "detailed.rule.descriptor"
  | "detailed.rule.output"
  | "detailed.tier.duplicate-id"
  | "detailed.tier.invalid"
  | "detailed.tier.missing";

export class DetailedPlanError extends Error {
  override readonly name = "DetailedPlanError";

  constructor(
    readonly code: DetailedPlanErrorCode,
    message: string,
    readonly context: Readonly<Record<string, string>> = {},
  ) {
    super(message);
  }
}

export type ResolvedDetailedPlan = Readonly<{
  nodes: ReadonlyMap<string, Node>;
  plan: DetailedPlan;
  ports: ReadonlyMap<string, MaterialPort>;
  tiers: ReadonlyMap<string, LogisticsTier>;
}>;

export function endpointKey(endpoint: MaterialEndpoint) {
  return `${endpoint.nodeId}\u0000${endpoint.portId}`;
}

function directionsCompatible(left: MaterialPort, right: MaterialPort) {
  return !(
    (left.direction === "input" && right.direction === "input") ||
    (left.direction === "output" && right.direction === "output")
  );
}

function canonicalConnection(
  connection: PhysicalConnection,
  from: MaterialPort,
  to: MaterialPort,
): PhysicalConnection {
  if (from.direction === "input" || to.direction === "output") {
    return { ...connection, from: connection.to, to: connection.from };
  }
  if (
    from.direction === "bidirectional" &&
    to.direction === "bidirectional" &&
    endpointKey(connection.to).localeCompare(endpointKey(connection.from)) < 0
  ) {
    return { ...connection, from: connection.to, to: connection.from };
  }
  return connection;
}

class UnionFind {
  readonly parent = new Map<string, string>();
  add(value: string) {
    if (!this.parent.has(value)) this.parent.set(value, value);
  }
  find(value: string): string {
    this.add(value);
    const parent = this.parent.get(value)!;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }
  union(left: string, right: string) {
    const roots = [this.find(left), this.find(right)].toSorted();
    if (roots[0] !== roots[1]) this.parent.set(roots[1]!, roots[0]!);
  }
}

export function resolveDetailedPlan(plan: DetailedPlan): ResolvedDetailedPlan {
  const nodes = new Map<string, Node>();
  const ports = new Map<string, MaterialPort>();
  for (const detailedNode of plan.nodes) {
    const id = detailedNode.configuration.id;
    if (nodes.has(id)) {
      throw new DetailedPlanError(
        "detailed.node.duplicate-id",
        `Detailed Node id ${id} is duplicated.`,
        { nodeId: id },
      );
    }
    const node = createNode(detailedNode.configuration);
    if (node.kind === "process" && node.configuration.instances.length !== 1) {
      throw new DetailedPlanError(
        "detailed.node.aggregate",
        `Detailed Node ${id} must represent exactly one Buildable instance.`,
        { nodeId: id },
      );
    }
    nodes.set(id, node);
    for (const port of node.ports)
      ports.set(endpointKey({ nodeId: id, portId: port.id }), port);
    for (const rule of detailedNode.routingRules ?? []) {
      const output = node.ports.find(
        ({ id: portId }) => portId === rule.outputPortId,
      );
      if (!output || output.direction === "input") {
        throw new DetailedPlanError(
          "detailed.rule.output",
          `Routing rule output ${rule.outputPortId} is invalid.`,
          { nodeId: id, portId: rule.outputPortId },
        );
      }
      for (const itemId of rule.itemIds) {
        if (!findDescriptor(itemId)) {
          throw new DetailedPlanError(
            "detailed.rule.descriptor",
            `Routing rule Descriptor ${itemId} does not exist.`,
            { itemId, nodeId: id },
          );
        }
      }
    }
  }

  const tiers = new Map<string, LogisticsTier>();
  for (const tier of plan.tiers) {
    if (tiers.has(tier.id))
      throw new DetailedPlanError(
        "detailed.tier.duplicate-id",
        `Logistics tier id ${tier.id} is duplicated.`,
        { tierId: tier.id },
      );
    if (
      !tier.id.trim() ||
      !Number.isFinite(tier.capacityPerMinute) ||
      tier.capacityPerMinute <= 0
    ) {
      throw new DetailedPlanError(
        "detailed.tier.invalid",
        `Logistics tier ${tier.id} is invalid.`,
        { tierId: tier.id },
      );
    }
    tiers.set(tier.id, tier);
  }

  const connectionIds = new Set<string>();
  const occupied = new Map<string, string>();
  const connections: PhysicalConnection[] = [];
  for (const connection of plan.connections) {
    if (connectionIds.has(connection.id))
      throw new DetailedPlanError(
        "detailed.connection.duplicate-id",
        `Physical connection id ${connection.id} is duplicated.`,
        { connectionId: connection.id },
      );
    connectionIds.add(connection.id);
    if (connection.from.nodeId === connection.to.nodeId)
      throw new DetailedPlanError(
        "detailed.connection.self",
        "A physical connection cannot connect a Buildable to itself.",
        { connectionId: connection.id },
      );
    const fromKey = endpointKey(connection.from);
    const toKey = endpointKey(connection.to);
    const from = ports.get(fromKey);
    const to = ports.get(toKey);
    if (!from || !to)
      throw new DetailedPlanError(
        "detailed.endpoint.missing",
        `Physical connection ${connection.id} references a missing port.`,
        { connectionId: connection.id },
      );
    for (const key of [fromKey, toKey]) {
      const existing = occupied.get(key);
      if (existing)
        throw new DetailedPlanError(
          "detailed.endpoint.occupied",
          `A physical port is already connected by ${existing}.`,
          { connectionId: connection.id, existingConnectionId: existing },
        );
      occupied.set(key, connection.id);
    }
    const expectedMedium =
      connection.kind === "conveyor" ? "conveyor" : "pipeline";
    if (from.medium !== expectedMedium || to.medium !== expectedMedium)
      throw new DetailedPlanError(
        "detailed.connection.kind",
        `${connection.kind} endpoints must both use ${expectedMedium} ports.`,
        { connectionId: connection.id },
      );
    if (!directionsCompatible(from, to))
      throw new DetailedPlanError(
        "detailed.connection.direction",
        "Physical connection endpoint directions are incompatible.",
        { connectionId: connection.id },
      );
    if (
      !from.forms.some((form) => to.forms.includes(form)) ||
      (connection.kind === "conveyor" && !from.forms.includes("solid")) ||
      (connection.kind === "pipeline" &&
        !from.forms.some((form) => form === "liquid" || form === "gas"))
    ) {
      throw new DetailedPlanError(
        "detailed.connection.form",
        `Physical connection ${connection.id} has incompatible material forms.`,
        { connectionId: connection.id },
      );
    }
    const tier = tiers.get(connection.tierId);
    if (!tier)
      throw new DetailedPlanError(
        "detailed.tier.missing",
        `Logistics tier ${connection.tierId} does not exist.`,
        { connectionId: connection.id, tierId: connection.tierId },
      );
    if (tier.medium !== expectedMedium)
      throw new DetailedPlanError(
        "detailed.connection.kind",
        `Logistics tier ${tier.id} cannot be used by a ${connection.kind}.`,
        { connectionId: connection.id, tierId: tier.id },
      );
    connections.push(canonicalConnection(connection, from, to));
  }

  const pipelineSets = new UnionFind();
  for (const connection of connections.filter(
    ({ kind }) => kind === "pipeline",
  )) {
    pipelineSets.union(
      endpointKey(connection.from),
      endpointKey(connection.to),
    );
  }
  for (const node of nodes.values()) {
    const pipelineKeys = node.ports
      .filter(
        ({ medium, purpose }) => medium === "pipeline" && purpose !== "fuel",
      )
      .map((port) =>
        endpointKey({ nodeId: node.configuration.id, portId: port.id }),
      );
    if (node.kind !== "process")
      for (const key of pipelineKeys.slice(1))
        pipelineSets.union(pipelineKeys[0]!, key);
  }
  const itemsByRoot = new Map<string, Set<string>>();
  for (const [key, port] of ports) {
    if (
      port.medium !== "pipeline" ||
      !port.itemId ||
      !pipelineSets.parent.has(key)
    )
      continue;
    const root = pipelineSets.find(key);
    const items = itemsByRoot.get(root) ?? new Set<string>();
    items.add(port.itemId);
    itemsByRoot.set(root, items);
  }
  for (const itemIds of itemsByRoot.values()) {
    if (itemIds.size > 1)
      throw new DetailedPlanError(
        "detailed.pipeline.mixed-descriptor",
        "A connected Pipeline network cannot mix Descriptors.",
        { itemIds: [...itemIds].toSorted().join(",") },
      );
  }

  return {
    nodes,
    plan: { ...plan, connections },
    ports,
    tiers,
  };
}

export function createDetailedPlan(
  request: Readonly<{
    connections?: readonly PhysicalConnection[];
    nodes: readonly DetailedNode[];
    tiers?: readonly LogisticsTier[];
  }>,
): DetailedPlan {
  const plan: DetailedPlan = {
    connections: request.connections ?? [],
    kind: "detailed",
    nodes: request.nodes,
    tiers: request.tiers ?? DEFAULT_LOGISTICS_TIERS,
    version: 1,
  };
  return resolveDetailedPlan(plan).plan;
}
