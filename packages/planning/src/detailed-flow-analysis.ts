import type { MaterialPort, Node } from "@satisfactory-belt/production";

import { endpointKey, resolveDetailedPlan } from "./detailed-plan";
import type {
  ConnectionFlow,
  ConveyorFlowProfile,
  DetailedFlowAnalysis,
  DetailedPlan,
  MaterialEndpoint,
  OperationalDiagnostic,
  PhysicalConnection,
} from "./types";

const TOLERANCE = 1e-7;

type Edge = Readonly<{
  connection?: PhysicalConnection;
  from: string;
  id: string;
  to: string;
}>;

function portEndpoint(key: string): MaterialEndpoint {
  const [nodeId = "", portId = ""] = key.split("\u0000");
  return { nodeId, portId };
}

function processRate(node: Node, port: MaterialPort) {
  if (node.profile.materials.kind !== "calculated" || !port.itemId) return 0;
  const rates =
    port.direction === "input"
      ? node.profile.materials.inputs
      : node.profile.materials.outputs;
  const rate =
    rates.find(({ itemId }) => itemId === port.itemId)?.ratePerMinute ?? 0;
  return port.direction === "input" ? -rate : rate;
}

function rawEdges(plan: DetailedPlan, nodes: ReadonlyMap<string, Node>) {
  const edges: Edge[] = plan.connections.map((connection) => ({
    connection,
    from: endpointKey(connection.from),
    id: `connection:${connection.id}`,
    to: endpointKey(connection.to),
  }));
  for (const node of nodes.values()) {
    if (node.kind === "process") continue;
    const byMedium = Map.groupBy(
      node.ports.filter(({ purpose }) => purpose !== "fuel"),
      ({ medium }) => medium,
    );
    for (const [medium, ports] of byMedium) {
      if (medium !== "conveyor" && medium !== "pipeline") continue;
      const anchor = ports[0];
      if (!anchor) continue;
      for (const port of ports.slice(1)) {
        edges.push({
          from: endpointKey({
            nodeId: node.configuration.id,
            portId: anchor.id,
          }),
          id: `internal:${node.configuration.id}:${anchor.id}:${port.id}`,
          to: endpointKey({ nodeId: node.configuration.id, portId: port.id }),
        });
      }
    }
  }
  return edges;
}

function connectedComponents(edges: readonly Edge[]) {
  const adjacency = new Map<string, Edge[]>();
  for (const edge of edges) {
    for (const key of [edge.from, edge.to]) {
      const values = adjacency.get(key) ?? [];
      values.push(edge);
      adjacency.set(key, values);
    }
  }
  const components: Array<{ edges: Edge[]; vertices: string[] }> = [];
  const seen = new Set<string>();
  for (const start of [...adjacency.keys()].toSorted()) {
    if (seen.has(start)) continue;
    const queue = [start];
    const vertices: string[] = [];
    const componentEdges = new Map<string, Edge>();
    seen.add(start);
    while (queue.length) {
      const vertex = queue.shift()!;
      vertices.push(vertex);
      for (const edge of adjacency.get(vertex) ?? []) {
        componentEdges.set(edge.id, edge);
        const other = edge.from === vertex ? edge.to : edge.from;
        if (!seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    components.push({
      edges: [...componentEdges.values()].toSorted((a, b) =>
        a.id.localeCompare(b.id),
      ),
      vertices: vertices.toSorted(),
    });
  }
  return components;
}

function descriptorAllowedAcrossInternal(
  plan: DetailedPlan,
  edge: Edge,
  itemId: string,
) {
  if (edge.connection) return true;
  const from = portEndpoint(edge.from);
  const node = plan.nodes.find(
    ({ configuration }) => configuration.id === from.nodeId,
  );
  if (!node?.routingRules?.length) return true;
  const ruledOutputs = new Set(
    node.routingRules
      .filter((rule) => rule.itemIds.includes(itemId) || rule.overflow)
      .map(({ outputPortId }) => outputPortId),
  );
  const to = portEndpoint(edge.to);
  const touchesRuledOutput =
    ruledOutputs.has(from.portId) || ruledOutputs.has(to.portId);
  const eitherOutputHasRule = node.routingRules.some(
    ({ outputPortId }) =>
      outputPortId === from.portId || outputPortId === to.portId,
  );
  return !eitherOutputHasRule || touchesRuledOutput;
}

export function analyzeDetailedPlan(plan: DetailedPlan): DetailedFlowAnalysis {
  const resolved = resolveDetailedPlan(plan);
  const edges = rawEdges(resolved.plan, resolved.nodes);
  const components = connectedComponents(edges);
  const connectionFlows: ConnectionFlow[] = [];
  const diagnostics: OperationalDiagnostic[] = [];
  const networkByConnectionId: Record<string, string> = {};
  const suppliedByPortItem = new Map<string, number>();

  for (const component of components) {
    const connections = component.edges.flatMap((edge) =>
      edge.connection ? [edge.connection] : [],
    );
    if (!connections.length) continue;
    const networkId = `network:${connections.map(({ id }) => id).toSorted()[0]}`;
    for (const connection of connections)
      networkByConnectionId[connection.id] = networkId;
    const itemIds = [
      ...new Set(
        component.vertices.flatMap(
          (key) => resolved.ports.get(key)?.itemId ?? [],
        ),
      ),
    ].toSorted();

    for (const itemId of itemIds) {
      const itemEdges = component.edges.filter((edge) =>
        descriptorAllowedAcrossInternal(resolved.plan, edge, itemId),
      );
      const adjacency = new Map<string, Edge[]>();
      for (const edge of itemEdges) {
        for (const key of [edge.from, edge.to]) {
          const values = adjacency.get(key) ?? [];
          values.push(edge);
          adjacency.set(key, values);
        }
      }
      const root = [...adjacency.keys()].toSorted()[0];
      if (!root) continue;
      const parent = new Map<string, { edge: Edge; vertex: string }>();
      const order = [root];
      for (let index = 0; index < order.length; index += 1) {
        const vertex = order[index]!;
        for (const edge of (adjacency.get(vertex) ?? []).toSorted((a, b) =>
          a.id.localeCompare(b.id),
        )) {
          const other = edge.from === vertex ? edge.to : edge.from;
          if (other === root || parent.has(other)) continue;
          parent.set(other, { edge, vertex });
          order.push(other);
        }
      }
      const balance = new Map<string, number>();
      for (const vertex of order) {
        const endpoint = portEndpoint(vertex);
        const node = resolved.nodes.get(endpoint.nodeId);
        const port = resolved.ports.get(vertex);
        balance.set(
          vertex,
          node && port && port.itemId === itemId ? processRate(node, port) : 0,
        );
      }
      const total = [...balance.values()].reduce(
        (sum, value) => sum + value,
        0,
      );
      if (Math.abs(total) > TOLERANCE) {
        diagnostics.push({
          code:
            total > 0
              ? "detailed.network.surplus"
              : "detailed.network.shortage",
          context: { ratePerMinute: Math.abs(total) },
          itemId,
          message:
            total > 0
              ? "The material network has an unconsumed surplus."
              : "The material network is undersupplied.",
          severity: "warning",
        });
        balance.set(root, (balance.get(root) ?? 0) - total);
      }
      for (const vertex of [...order].reverse()) {
        const relation = parent.get(vertex);
        if (!relation) continue;
        const subtree = balance.get(vertex) ?? 0;
        balance.set(
          relation.vertex,
          (balance.get(relation.vertex) ?? 0) + subtree,
        );
        if (!relation.edge.connection || Math.abs(subtree) <= TOLERANCE)
          continue;
        const flowsFromTo = relation.edge.from === vertex ? subtree : -subtree;
        const ratePerMinute = Math.abs(flowsFromTo);
        connectionFlows.push({
          connectionId: relation.edge.connection.id,
          itemId,
          ratePerMinute,
        });
        for (const key of [relation.edge.from, relation.edge.to])
          suppliedByPortItem.set(`${key}\u0000${itemId}`, ratePerMinute);
      }
    }
    if (component.edges.length >= component.vertices.length) {
      diagnostics.push({
        code: "detailed.network.feedback",
        message:
          "The material network contains a feedback cycle and may require priming.",
        severity: "warning",
      });
    }
  }

  const conveyorProfiles: ConveyorFlowProfile[] = resolved.plan.connections
    .filter(({ kind }) => kind === "conveyor")
    .map((connection) => {
      const flows = connectionFlows
        .filter(({ connectionId }) => connectionId === connection.id)
        .map(({ itemId, ratePerMinute }) => ({ itemId, ratePerMinute }))
        .toSorted((a, b) => a.itemId.localeCompare(b.itemId));
      const totalRatePerMinute = flows.reduce(
        (sum, { ratePerMinute }) => sum + ratePerMinute,
        0,
      );
      const tier = resolved.tiers.get(connection.tierId)!;
      const utilization = totalRatePerMinute / tier.capacityPerMinute;
      if (utilization > 1 + TOLERANCE)
        diagnostics.push({
          code: "detailed.connection.overload",
          connectionId: connection.id,
          context: {
            capacityPerMinute: tier.capacityPerMinute,
            ratePerMinute: totalRatePerMinute,
          },
          message: "The Conveyor exceeds its tier capacity.",
          severity: "warning",
        });
      if (flows.length > 1) {
        const unsafe = diagnostics.some(
          ({ code, itemId }) =>
            (code === "detailed.network.surplus" ||
              code === "detailed.network.shortage") &&
            flows.some((flow) => flow.itemId === itemId),
        );
        diagnostics.push({
          code: unsafe
            ? "detailed.sushi.deadlock-risk"
            : "detailed.sushi.robust",
          connectionId: connection.id,
          message: unsafe
            ? "This Sushi Belt can accumulate material and deadlock."
            : "This Sushi Belt has balanced consumption paths.",
          severity: unsafe ? "warning" : "info",
        });
      }
      return {
        connectionId: connection.id,
        flows,
        totalRatePerMinute,
        utilization,
      };
    });

  for (const connection of resolved.plan.connections.filter(
    ({ kind }) => kind === "pipeline",
  )) {
    const total = connectionFlows
      .filter(({ connectionId }) => connectionId === connection.id)
      .reduce((sum, flow) => sum + flow.ratePerMinute, 0);
    const tier = resolved.tiers.get(connection.tierId)!;
    if (total > tier.capacityPerMinute + TOLERANCE)
      diagnostics.push({
        code: "detailed.connection.overload",
        connectionId: connection.id,
        context: {
          capacityPerMinute: tier.capacityPerMinute,
          ratePerMinute: total,
        },
        message: "The Pipeline exceeds its tier capacity.",
        severity: "warning",
      });
  }

  const machineEfficiency: Record<string, number> = {};
  for (const node of resolved.nodes.values()) {
    if (node.kind !== "process" || node.profile.materials.kind !== "calculated")
      continue;
    const ratios = node.ports
      .filter(({ direction, itemId }) => direction === "input" && itemId)
      .map((port) => {
        const required =
          node.profile.materials.kind === "calculated"
            ? (node.profile.materials.inputs.find(
                ({ itemId }) => itemId === port.itemId,
              )?.ratePerMinute ?? 0)
            : 0;
        const supplied =
          suppliedByPortItem.get(
            `${endpointKey({ nodeId: node.configuration.id, portId: port.id })}\u0000${port.itemId}`,
          ) ?? 0;
        return required > TOLERANCE ? Math.min(1, supplied / required) : 1;
      });
    machineEfficiency[node.configuration.id] = ratios.length
      ? Math.min(...ratios)
      : 1;
  }

  return {
    connectionFlows: connectionFlows.toSorted(
      (a, b) =>
        a.connectionId.localeCompare(b.connectionId) ||
        a.itemId.localeCompare(b.itemId),
    ),
    conveyorProfiles,
    diagnostics: diagnostics.toSorted(
      (a, b) =>
        a.code.localeCompare(b.code) ||
        (a.connectionId ?? "").localeCompare(b.connectionId ?? "") ||
        (a.itemId ?? "").localeCompare(b.itemId ?? ""),
    ),
    machineEfficiency,
    networkByConnectionId,
  };
}
