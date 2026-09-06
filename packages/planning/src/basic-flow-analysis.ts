import {
  createNode,
  type MaterialPort,
  type Node,
} from "@satisfactory-belt/production";

import { analyzeBasicPlan, createBasicPlan } from "./basic-topology";
import type {
  BasicPlan,
  MaterialEndpoint,
  MaterialLink,
  OperationalDiagnostic,
} from "./types";

const TOLERANCE = 1e-7;

type Edge = Readonly<{
  from: string;
  id: string;
  link?: MaterialLink;
  to: string;
}>;

export type BasicLinkFlow = Readonly<{
  itemId?: string;
  linkId: string;
  ratePerMinute?: number;
}>;

export type BasicFlowAnalysis = Readonly<{
  diagnostics: readonly OperationalDiagnostic[];
  linkFlows: readonly BasicLinkFlow[];
}>;

function endpointKey(endpoint: MaterialEndpoint) {
  return `${endpoint.nodeId}\u0000${endpoint.portId}`;
}

function endpointFromKey(key: string): MaterialEndpoint {
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

function rawEdges(plan: BasicPlan, nodes: ReadonlyMap<string, Node>) {
  const edges: Edge[] = plan.materialLinks.map((link) => ({
    from: endpointKey(link.from),
    id: `link:${link.id}`,
    link,
    to: endpointKey(link.to),
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

export function analyzeBasicFlows(plan: BasicPlan): BasicFlowAnalysis {
  const validated = createBasicPlan(plan);
  const topology = analyzeBasicPlan(validated);
  const nodes = new Map(
    validated.nodes.map(({ configuration }) => {
      const node = createNode(configuration);
      return [configuration.id, node] as const;
    }),
  );
  const ports = new Map(
    [...nodes.values()].flatMap((node) =>
      node.ports.map(
        (port) =>
          [
            endpointKey({ nodeId: node.configuration.id, portId: port.id }),
            port,
          ] as const,
      ),
    ),
  );
  const rateByLink = new Map<string, number>();
  const diagnostics: OperationalDiagnostic[] = [];

  for (const component of connectedComponents(rawEdges(validated, nodes))) {
    const links = component.edges.flatMap((edge) =>
      edge.link ? [edge.link] : [],
    );
    if (!links.length) continue;
    const itemIds = [
      ...new Set(
        component.vertices.flatMap((key) => ports.get(key)?.itemId ?? []),
      ),
    ];
    const itemId = itemIds[0];
    if (!itemId) continue;

    const root = component.vertices[0];
    if (!root) continue;
    const adjacency = new Map<string, Edge[]>();
    for (const edge of component.edges) {
      for (const key of [edge.from, edge.to]) {
        const values = adjacency.get(key) ?? [];
        values.push(edge);
        adjacency.set(key, values);
      }
    }
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
      const endpoint = endpointFromKey(vertex);
      const node = nodes.get(endpoint.nodeId);
      const port = ports.get(vertex);
      balance.set(
        vertex,
        node && port && port.itemId === itemId ? processRate(node, port) : 0,
      );
    }
    const total = [...balance.values()].reduce((sum, value) => sum + value, 0);
    if (Math.abs(total) > TOLERANCE) {
      for (const link of links) {
        diagnostics.push({
          code: total > 0 ? "basic.network.surplus" : "basic.network.shortage",
          connectionId: link.id,
          context: { ratePerMinute: Math.abs(total) },
          itemId,
          message:
            total > 0
              ? "The material network has an unconsumed surplus."
              : "The material network is undersupplied.",
          severity: "warning",
        });
      }
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
      if (!relation.edge.link) continue;
      rateByLink.set(relation.edge.link.id, Math.abs(subtree));
    }
    if (component.edges.length >= component.vertices.length) {
      for (const link of links) {
        diagnostics.push({
          code: "basic.network.feedback",
          connectionId: link.id,
          itemId,
          message:
            "The material network contains a feedback cycle and its individual link rates are underdetermined.",
          severity: "warning",
        });
      }
      for (const link of links) rateByLink.delete(link.id);
    }
  }

  return {
    diagnostics: [...topology.diagnostics, ...diagnostics],
    linkFlows: validated.materialLinks.map((link) => ({
      ...(topology.linkItemIds[link.id]
        ? { itemId: topology.linkItemIds[link.id] }
        : {}),
      linkId: link.id,
      ...(rateByLink.has(link.id)
        ? { ratePerMinute: rateByLink.get(link.id)! }
        : {}),
    })),
  };
}
