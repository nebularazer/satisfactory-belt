import {
  createNode,
  type MaterialPort,
  type Node,
} from "@satisfactory-belt/production";

import { analyzeBasicPlan, createBasicPlan } from "./basic-topology";
import { solveNonNegativeLinearSystem } from "./linear-system";
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

type ResidualArc = {
  capacity: number;
  flow: number;
  reverseIndex: number;
  to: string;
};

export type BasicLinkFlow = Readonly<{
  itemId?: string;
  linkId: string;
  ratePerMinute?: number;
}>;

export type BasicPortFlow = Readonly<{
  endpoint: MaterialEndpoint;
  itemId?: string;
  ratePerMinute?: number;
}>;

export type BasicFlowAnalysis = Readonly<{
  diagnostics: readonly OperationalDiagnostic[];
  linkFlows: readonly BasicLinkFlow[];
  portFlows: readonly BasicPortFlow[];
}>;

function endpointKey(endpoint: MaterialEndpoint) {
  return `${endpoint.nodeId}\u0000${endpoint.portId}`;
}

function endpointFromKey(key: string): MaterialEndpoint {
  const [nodeId = "", portId = ""] = key.split("\u0000");
  return { nodeId, portId };
}

function addResidualArc(
  graph: Map<string, ResidualArc[]>,
  from: string,
  to: string,
  capacity: number,
) {
  const fromArcs = graph.get(from) ?? [];
  const toArcs = graph.get(to) ?? [];
  const index = fromArcs.length;
  fromArcs.push({
    capacity,
    flow: 0,
    reverseIndex: toArcs.length,
    to,
  });
  toArcs.push({ capacity: 0, flow: 0, reverseIndex: index, to: from });
  graph.set(from, fromArcs);
  graph.set(to, toArcs);
  return { from, index };
}

function maximizeFlow(
  graph: Map<string, ResidualArc[]>,
  source: string,
  sink: string,
) {
  while (true) {
    const parent = new Map<string, { from: string; index: number }>();
    const queue = [source];
    parent.set(source, { from: source, index: -1 });
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const from = queue[queueIndex]!;
      for (const [index, arc] of (graph.get(from) ?? []).entries()) {
        if (parent.has(arc.to) || arc.capacity - arc.flow <= TOLERANCE) {
          continue;
        }
        parent.set(arc.to, { from, index });
        queue.push(arc.to);
      }
      if (parent.has(sink)) break;
    }
    if (!parent.has(sink)) return;

    let amount = Number.POSITIVE_INFINITY;
    for (let vertex = sink; vertex !== source;) {
      const relation = parent.get(vertex)!;
      const arc = graph.get(relation.from)![relation.index]!;
      amount = Math.min(amount, arc.capacity - arc.flow);
      vertex = relation.from;
    }
    for (let vertex = sink; vertex !== source;) {
      const relation = parent.get(vertex)!;
      const arc = graph.get(relation.from)![relation.index]!;
      arc.flow += amount;
      graph.get(vertex)![arc.reverseIndex]!.flow -= amount;
      vertex = relation.from;
    }
  }
}

function forwardDistances(
  graph: ReadonlyMap<string, readonly ResidualArc[]>,
  source: string,
) {
  const distances = new Map([[source, 0]]);
  const queue = [source];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const from = queue[queueIndex]!;
    const distance = distances.get(from)!;
    for (const arc of graph.get(from) ?? []) {
      if (arc.capacity <= TOLERANCE || distances.has(arc.to)) continue;
      distances.set(arc.to, distance + 1);
      queue.push(arc.to);
    }
  }
  return distances;
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

function hasDirectedNodeCycle(links: readonly MaterialLink[]) {
  const adjacency = new Map<string, Set<string>>();
  for (const link of links) {
    const targets = adjacency.get(link.from.nodeId) ?? new Set<string>();
    targets.add(link.to.nodeId);
    adjacency.set(link.from.nodeId, targets);
    if (!adjacency.has(link.to.nodeId)) {
      adjacency.set(link.to.nodeId, new Set());
    }
  }
  const state = new Map<string, "visiting" | "visited">();
  const visit = (nodeId: string): boolean => {
    const current = state.get(nodeId);
    if (current === "visiting") return true;
    if (current === "visited") return false;
    state.set(nodeId, "visiting");
    for (const target of adjacency.get(nodeId) ?? []) {
      if (visit(target)) return true;
    }
    state.set(nodeId, "visited");
    return false;
  };
  return [...adjacency.keys()].some(visit);
}

function balanceParallelLinkRates(
  links: readonly MaterialLink[],
  rates: ReadonlyMap<string, number>,
) {
  const balanced = new Map(rates);
  const bundles = Map.groupBy(
    links,
    ({ from, to }) => `${from.nodeId}\u0000${to.nodeId}`,
  );
  for (const bundle of bundles.values()) {
    if (bundle.length < 2) continue;
    const total = bundle.reduce(
      (sum, link) => sum + (rates.get(link.id) ?? 0),
      0,
    );
    for (const link of bundle) balanced.set(link.id, total / bundle.length);
  }
  return balanced;
}

function feasibleLinkRates(
  component: Readonly<{ edges: readonly Edge[]; vertices: readonly string[] }>,
  itemId: string,
  nodes: ReadonlyMap<string, Node>,
  ports: ReadonlyMap<string, MaterialPort>,
  projectUnconnectedOutputs: boolean,
  linkCapacities?: ReadonlyMap<string, number>,
): Map<string, number> {
  const source = "\u0001basic-flow-source";
  const sink = "\u0001basic-flow-sink";
  const rates = component.vertices.map((vertex) => {
    const endpoint = endpointFromKey(vertex);
    const node = nodes.get(endpoint.nodeId);
    const port = ports.get(vertex);
    return {
      rate:
        node && port && port.itemId === itemId ? processRate(node, port) : 0,
      vertex,
    };
  });
  const totalSupply = rates.reduce(
    (sum, { rate }) => sum + Math.max(0, rate),
    0,
  );
  const totalDemand = rates.reduce(
    (sum, { rate }) => sum + Math.max(0, -rate),
    0,
  );
  const capacity = Math.max(totalSupply, totalDemand, 1);
  const graph = new Map<string, ResidualArc[]>();
  const arcByLinkId = new Map<string, { from: string; index: number }>();

  for (const edge of component.edges) {
    if (!edge.link) continue;
    arcByLinkId.set(
      edge.link.id,
      addResidualArc(
        graph,
        edge.from,
        edge.to,
        Math.min(capacity, linkCapacities?.get(edge.link.id) ?? Infinity),
      ),
    );
  }

  const vertices = new Set(component.vertices);
  for (const node of [...nodes.values()].toSorted((left, right) =>
    left.configuration.id.localeCompare(right.configuration.id),
  )) {
    if (node.kind === "process") continue;
    const byMedium = Map.groupBy(
      node.ports.filter(({ purpose }) => purpose !== "fuel"),
      ({ medium }) => medium,
    );
    for (const [medium, materialPorts] of byMedium) {
      if (medium !== "conveyor" && medium !== "pipeline") continue;
      const inputs = materialPorts.filter(
        ({ direction }) =>
          direction === "input" || direction === "bidirectional",
      );
      const outputs = materialPorts.filter(
        ({ direction }) =>
          direction === "output" || direction === "bidirectional",
      );
      for (const input of inputs) {
        const from = endpointKey({
          nodeId: node.configuration.id,
          portId: input.id,
        });
        if (!vertices.has(from)) continue;
        for (const output of outputs) {
          if (input.id === output.id) continue;
          const to = endpointKey({
            nodeId: node.configuration.id,
            portId: output.id,
          });
          if (vertices.has(to)) addResidualArc(graph, from, to, capacity);
        }
      }
    }
  }

  for (const { rate, vertex } of rates) {
    if (rate > TOLERANCE) addResidualArc(graph, source, vertex, rate);
    if (rate < -TOLERANCE) addResidualArc(graph, vertex, sink, -rate);
  }
  maximizeFlow(graph, source, sink);

  // Demand is authoritative. Once it is satisfied, carry any remaining supply
  // through the already-built network before projecting it onto nearer open
  // router ports. Otherwise an open Splitter output can steal all flow from a
  // connected downstream Merger simply because its residual arc was visited
  // first.
  const connectedPortKeys = new Set(
    component.edges.flatMap(({ from, link, to }) => (link ? [from, to] : [])),
  );
  const distances = forwardDistances(graph, source);
  const terminalPorts: Array<{ depth: number; vertex: string }> = [];
  for (const vertex of component.vertices) {
    if (connectedPortKeys.has(vertex)) continue;
    const endpoint = endpointFromKey(vertex);
    const node = nodes.get(endpoint.nodeId);
    const port = ports.get(vertex);
    if (
      !node ||
      node.kind === "process" ||
      (!projectUnconnectedOutputs && node.kind === "router") ||
      !port ||
      (port.direction !== "output" && port.direction !== "bidirectional")
    ) {
      continue;
    }
    terminalPorts.push({ depth: distances.get(vertex) ?? -1, vertex });
  }
  const terminalPortsByDepth = Map.groupBy(terminalPorts, ({ depth }) => depth);
  for (const depth of [...terminalPortsByDepth.keys()].toSorted(
    (left, right) => right - left,
  )) {
    const portsAtDepth = terminalPortsByDepth.get(depth) ?? [];
    const remainingSupply = (graph.get(source) ?? []).reduce(
      (sum, arc) => sum + Math.max(0, arc.capacity - arc.flow),
      0,
    );
    const fairShare = remainingSupply / Math.max(portsAtDepth.length, 1);
    for (const { vertex } of portsAtDepth) {
      addResidualArc(graph, vertex, sink, fairShare);
    }
    maximizeFlow(graph, source, sink);
  }

  const result = new Map(
    [...arcByLinkId].map(([linkId, location]) => [
      linkId,
      Math.max(0, graph.get(location.from)![location.index]!.flow),
    ]),
  );
  if (linkCapacities?.size) {
    const unconstrained = feasibleLinkRates(
      component,
      itemId,
      nodes,
      ports,
      projectUnconnectedOutputs,
    );
    const consumed = (rates: ReadonlyMap<string, number>) =>
      component.edges.reduce(
        (sum, edge) =>
          edge.link && nodes.get(edge.link.to.nodeId)?.kind === "process"
            ? sum + (rates.get(edge.link.id) ?? 0)
            : sum,
        0,
      );
    // Keep demand-based overload diagnostics for an infeasible physical plan.
    // Capacities resolve surplus-source allocation only when demand is met.
    if (consumed(result) + TOLERANCE < consumed(unconstrained))
      return unconstrained;
  }
  return result;
}

function solveEqualSplitLinkRates(
  component: Readonly<{ edges: readonly Edge[]; vertices: readonly string[] }>,
  itemId: string,
  links: readonly MaterialLink[],
  nodes: ReadonlyMap<string, Node>,
  ports: ReadonlyMap<string, MaterialPort>,
  projectUnconnectedOutputs: boolean,
  linkCapacities?: ReadonlyMap<string, number>,
) {
  const orderedLinks = [...links].toSorted((left, right) =>
    left.id.localeCompare(right.id),
  );
  const linkIndex = new Map(
    orderedLinks.map((link, index) => [link.id, index] as const),
  );
  const baselineRates = balanceParallelLinkRates(
    orderedLinks,
    feasibleLinkRates(
      component,
      itemId,
      nodes,
      ports,
      projectUnconnectedOutputs,
      linkCapacities,
    ),
  );
  const matrix: number[][] = [];
  const rightHandSide: number[] = [];
  const addEquation = (
    coefficients: readonly (readonly [linkId: string, coefficient: number])[],
    value = 0,
  ) => {
    const row = Array.from({ length: orderedLinks.length }, () => 0);
    for (const [linkId, coefficient] of coefficients) {
      const index = linkIndex.get(linkId);
      if (index !== undefined) row[index] = row[index]! + coefficient;
    }
    matrix.push(row);
    rightHandSide.push(value);
  };

  // Process ports are the fixed boundaries of the network. The existing flow
  // projection already accounts for nominal supply, demand, and shortages.
  for (const link of orderedLinks) {
    if (
      nodes.get(link.from.nodeId)?.kind === "process" ||
      nodes.get(link.to.nodeId)?.kind === "process"
    ) {
      addEquation([[link.id, 1]], baselineRates.get(link.id) ?? 0);
    }
  }

  const connectedNodeIds = new Set(
    orderedLinks.flatMap(({ from, to }) => [from.nodeId, to.nodeId]),
  );
  for (const nodeId of [...connectedNodeIds].toSorted()) {
    const node = nodes.get(nodeId);
    if (!node || node.kind === "process") continue;
    const incoming = orderedLinks.filter(({ to }) => to.nodeId === nodeId);
    const outgoing = orderedLinks.filter(({ from }) => from.nodeId === nodeId);

    // A node with no connected output is an intentional terminal sink (for
    // example a Storage Container). It absorbs its incoming flow.
    if (outgoing.length === 0) continue;
    if (incoming.length === 0) {
      for (const link of outgoing) addEquation([[link.id, 1]]);
      continue;
    }

    addEquation([
      ...incoming.map((link) => [link.id, 1] as const),
      ...outgoing.map((link) => [link.id, -1] as const),
    ]);

    const outputPortCount = node.ports.filter(
      ({ direction }) => direction === "output",
    ).length;
    if (node.kind === "router" && outputPortCount > 1 && outgoing.length > 1) {
      const [first, ...rest] = outgoing;
      for (const link of rest) {
        addEquation([
          [first!.id, 1],
          [link.id, -1],
        ]);
      }
    }
  }

  const result = solveNonNegativeLinearSystem(
    matrix,
    rightHandSide,
    orderedLinks.length,
  );
  if (result.status !== "feasible") return undefined;
  return new Map(
    orderedLinks.map(
      (link, index) => [link.id, result.values[index]!] as const,
    ),
  );
}

export function analyzeBasicFlows(
  plan: BasicPlan,
  options: Readonly<{
    /** Basic plans project surplus onto open router outputs. Physical belts only
     * carry material through connected outputs. */
    projectUnconnectedOutputs?: boolean;
    /** Physical conveyor capacities; omitted for unconstrained Basic plans. */
    linkCapacities?: ReadonlyMap<string, number>;
  }> = {},
): BasicFlowAnalysis {
  const projectUnconnectedOutputs = options.projectUnconnectedOutputs ?? true;
  const linkCapacities = options.linkCapacities;
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

    const balance = component.vertices.map((vertex) => {
      const endpoint = endpointFromKey(vertex);
      const node = nodes.get(endpoint.nodeId);
      const port = ports.get(vertex);
      return node && port && port.itemId === itemId
        ? processRate(node, port)
        : 0;
    });
    const total = balance.reduce((sum, value) => sum + value, 0);
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
    }
    const hasCycle = hasDirectedNodeCycle(links);
    // Split-and-merge balancers also have multiple paths without a directed
    // feedback cycle. Conservation alone cannot determine their branch rates.
    const cyclicRates =
      component.edges.length >= component.vertices.length
        ? solveEqualSplitLinkRates(
            component,
            itemId,
            links,
            nodes,
            ports,
            projectUnconnectedOutputs,
            linkCapacities,
          )
        : undefined;
    if (hasCycle && !cyclicRates) {
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
    } else if (cyclicRates) {
      for (const [linkId, rate] of cyclicRates) {
        rateByLink.set(linkId, rate);
      }
    } else {
      const feasibleRates = feasibleLinkRates(
        component,
        itemId,
        nodes,
        ports,
        projectUnconnectedOutputs,
        linkCapacities,
      );
      for (const [linkId, rate] of balanceParallelLinkRates(
        links,
        feasibleRates,
      )) {
        rateByLink.set(linkId, rate);
      }
    }
  }

  const linkFlows = validated.materialLinks.map((link) => ({
    ...(topology.linkItemIds[link.id]
      ? { itemId: topology.linkItemIds[link.id] }
      : {}),
    linkId: link.id,
    ...(rateByLink.has(link.id)
      ? { ratePerMinute: rateByLink.get(link.id)! }
      : {}),
  }));
  const rateByPort = new Map<string, number>();
  for (const link of validated.materialLinks) {
    const rate = rateByLink.get(link.id);
    if (rate === undefined) continue;
    for (const endpoint of [link.from, link.to]) {
      const key = endpointKey(endpoint);
      rateByPort.set(key, (rateByPort.get(key) ?? 0) + rate);
    }
  }
  for (const network of topology.networks) {
    const networkKeys = new Set(network.portKeys);
    for (const node of nodes.values()) {
      if (node.kind === "process") continue;
      const nodePorts = node.ports
        .map((port) => ({
          key: endpointKey({
            nodeId: node.configuration.id,
            portId: port.id,
          }),
          port,
        }))
        .filter(({ key }) => networkKeys.has(key));
      if (nodePorts.some(({ port }) => port.direction === "bidirectional")) {
        continue;
      }
      const inputs = nodePorts.filter(({ port }) => port.direction === "input");
      const outputs = nodePorts.filter(
        ({ port }) => port.direction === "output",
      );
      const knownInputRate = inputs.reduce(
        (sum, { key }) => sum + (rateByPort.get(key) ?? 0),
        0,
      );
      const knownOutputRate = outputs.reduce(
        (sum, { key }) => sum + (rateByPort.get(key) ?? 0),
        0,
      );
      const openInputs = inputs.filter(({ key }) => !rateByPort.has(key));
      const openOutputs = outputs.filter(({ key }) => !rateByPort.has(key));
      if (
        openOutputs.length > 0 &&
        inputs.some(({ key }) => rateByPort.has(key))
      ) {
        const share =
          Math.max(0, knownInputRate - knownOutputRate) / openOutputs.length;
        for (const { key } of openOutputs) rateByPort.set(key, share);
      } else if (
        openInputs.length > 0 &&
        outputs.some(({ key }) => rateByPort.has(key))
      ) {
        const share =
          Math.max(0, knownOutputRate - knownInputRate) / openInputs.length;
        for (const { key } of openInputs) rateByPort.set(key, share);
      }
    }
  }

  return {
    diagnostics: [...topology.diagnostics, ...diagnostics],
    linkFlows,
    portFlows: topology.networks.flatMap((network) =>
      network.portKeys.map((key) => ({
        endpoint: endpointFromKey(key),
        ...(network.itemId ? { itemId: network.itemId } : {}),
        ...(rateByPort.has(key) ? { ratePerMinute: rateByPort.get(key)! } : {}),
      })),
    ),
  };
}
