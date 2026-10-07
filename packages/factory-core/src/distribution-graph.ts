export const DISTRIBUTION_BELTS = [60, 120, 270, 480, 780, 1200] as const;
export const DISTRIBUTION_PIPES = [300, 600] as const;
export type DistributionTransport = "belt" | "pipe";
export const distributionCapacities = (transport: DistributionTransport) =>
  transport === "pipe" ? DISTRIBUTION_PIPES : DISTRIBUTION_BELTS;
export const FLOW_EPSILON = 0.00001;
export type DistributionEndpoint = {
  id: string;
  rate: number;
  /** Members of the same connected machine node; an optional construction hint. */
  groupId?: string;
};
export type DistributionNode = {
  id: string;
  kind: "source" | "destination" | "splitter" | "merger" | "junction";
  /** Physical pipe fitting; its sockets have no fixed flow direction. */
  junctionType?: "t" | "cross";
};
export type DistributionEdge = {
  id: string;
  /** For pipes, from/to describe planned net flow, not one-way connections. */
  from: string;
  to: string;
  rate: number;
  tier: number;
  feedback?: boolean;
};
export type DistributionResult = {
  nodes: DistributionNode[];
  edges: DistributionEdge[];
  error?: string;
  errorCode?: DistributionErrorCode;
  /** Physical header order, independent of the direction of planned net flow. */
  pipeManifold?: {
    stations: { destinationId: string; junctionId?: string }[];
  };
};
export type DistributionRequest = {
  sources: readonly DistributionEndpoint[];
  destinations: readonly DistributionEndpoint[];
  maxTier: number;
  transport: DistributionTransport;
};
export type DistributionErrorCode =
  | "invalid-input"
  | "unsupported"
  | "endpoint-limit"
  | "capacity"
  | "construction-limit"
  | "invalid-result";

export function distributionFailure(
  errorCode: DistributionErrorCode,
  error: string,
): DistributionResult {
  return { nodes: [], edges: [], errorCode, error };
}
export type DistributionStream = { from: string; rate: number };

/** A construction helper only. Acceptance is owned by validateDistribution. */
export class DistributionGraph {
  readonly nodes: DistributionNode[];
  readonly edges: DistributionEdge[] = [];
  private readonly ids: Set<string>;
  private sequence = 0;
  private readonly transport: DistributionTransport;

  constructor(
    sources: readonly DistributionEndpoint[],
    destinations: readonly DistributionEndpoint[],
    transport: DistributionTransport = "belt",
  ) {
    this.transport = transport;
    this.nodes = [
      ...sources.map(({ id }) => ({ id, kind: "source" as const })),
      ...destinations.map(({ id }) => ({ id, kind: "destination" as const })),
    ];
    this.ids = new Set(this.nodes.map(({ id }) => id));
  }

  junction(kind: "splitter" | "merger" | "junction") {
    let id: string;
    do id = `distribution-${this.sequence++}`;
    while (this.ids.has(id));
    this.ids.add(id);
    this.nodes.push({ id, kind });
    return id;
  }

  connect(stream: DistributionStream, to: string, feedback = false) {
    this.edges.push({
      id: `belt-${this.edges.length}`,
      ...stream,
      to,
      tier:
        distributionCapacities(this.transport).findIndex(
          (capacity) => stream.rate <= capacity + FLOW_EPSILON,
        ) + 1,
      feedback,
    });
  }

  merge(streams: readonly DistributionStream[]): DistributionStream {
    let result = streams[0]!;
    // Carry one merged stream forward, using both remaining ports. Five streams
    // need two mergers, rather than merging groups of three and two separately.
    for (let i = 1; i < streams.length; i += 2) {
      const inputs = [result, ...streams.slice(i, i + 2)];
      const id = this.junction(this.transport === "pipe" ? "junction" : "merger");
      for (const stream of inputs) this.connect(stream, id);
      result = { from: id, rate: inputs.reduce((total, stream) => total + stream.rate, 0) };
    }
    return result;
  }
}

/** Check physical ports and flow equations independently of candidate generation. */
export function validateDistribution(
  graph: DistributionResult,
  sources: readonly DistributionEndpoint[],
  destinations: readonly DistributionEndpoint[],
  maxTier: number,
  transport: DistributionTransport = "belt",
): boolean {
  const capacities = distributionCapacities(transport);
  if (graph.error || !capacities[maxTier - 1] || !Number.isInteger(maxTier)) return false;
  const endpoints = [...sources, ...destinations];
  if (
    !sources.length ||
    !destinations.length ||
    endpoints.some((entry) => !Number.isFinite(entry.rate) || entry.rate <= 0)
  )
    return false;
  if (new Set(endpoints.map((entry) => entry.id)).size !== endpoints.length) return false;
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (nodes.size !== graph.nodes.length) return false;
  const supply = new Map(sources.map((entry) => [entry.id, entry.rate]));
  const demand = new Map(destinations.map((entry) => [entry.id, entry.rate]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, [] as DistributionEdge[]]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as DistributionEdge[]]));
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (
      edgeIds.has(edge.id) ||
      !nodes.has(edge.from) ||
      !nodes.has(edge.to) ||
      edge.from === edge.to ||
      !Number.isFinite(edge.rate) ||
      edge.rate < 0 ||
      (edge.rate === 0 && transport !== "pipe") ||
      !Number.isInteger(edge.tier) ||
      edge.tier < 1 ||
      edge.tier > maxTier ||
      edge.rate > (capacities[edge.tier - 1] ?? 0) + FLOW_EPSILON ||
      (transport === "pipe" && edge.feedback)
    )
      return false;
    edgeIds.add(edge.id);
    incoming.get(edge.to)!.push(edge);
    outgoing.get(edge.from)!.push(edge);
  }
  for (const endpoint of sources) if (nodes.get(endpoint.id)?.kind !== "source") return false;
  for (const endpoint of destinations)
    if (nodes.get(endpoint.id)?.kind !== "destination") return false;
  for (const node of graph.nodes) {
    const inputs = incoming.get(node.id)!;
    const outputs = outgoing.get(node.id)!;
    const totalIn = inputs.reduce((total, edge) => total + edge.rate, 0);
    const totalOut = outputs.reduce((total, edge) => total + edge.rate, 0);
    if (
      Math.abs(totalIn + (supply.get(node.id) ?? 0) - totalOut - (demand.get(node.id) ?? 0)) >
      FLOW_EPSILON
    )
      return false;
    switch (node.kind) {
      case "source":
        if (!supply.has(node.id) || inputs.length !== 0 || outputs.length !== 1) return false;
        break;
      case "destination":
        if (!demand.has(node.id) || inputs.length !== 1 || outputs.length !== 0) return false;
        break;
      case "splitter":
        if (transport !== "belt") return false;
        if (inputs.length !== 1 || outputs.length < 2 || outputs.length > 3) return false;
        if (outputs.some((edge) => Math.abs(edge.rate - totalIn / outputs.length) > FLOW_EPSILON))
          return false;
        break;
      case "merger":
        if (transport !== "belt") return false;
        if (outputs.length !== 1 || inputs.length < 2 || inputs.length > 3) return false;
        break;
      case "junction":
        if (
          transport !== "pipe" ||
          inputs.length < 1 ||
          outputs.length < 1 ||
          inputs.length + outputs.length < 3 ||
          inputs.length + outputs.length > 4 ||
          (node.junctionType !== "t" && node.junctionType !== "cross") ||
          (node.junctionType === "t" && inputs.length + outputs.length > 3)
        )
          return false;
        break;
      default:
        return false;
    }
  }
  // A locally conserved, disconnected circulation is not a useful distribution.
  const reachable = (starts: string[], reverse: boolean) => {
    const visited = new Set<string>();
    const pending = [...starts];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const edge of (reverse ? incoming : outgoing).get(id)!)
        pending.push(reverse ? edge.from : edge.to);
    }
    return visited.size === nodes.size;
  };
  if (!reachable([...supply.keys()], false) || !reachable([...demand.keys()], true)) return false;
  // Every cycle must close on a declared return belt. This also keeps main-flow
  // direction well-defined for the layout, independently of construction IDs.
  const indegree = new Map(
    graph.nodes.map((node) => [
      node.id,
      incoming.get(node.id)!.filter((edge) => !edge.feedback).length,
    ]),
  );
  const pending = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let visited = 0;
  while (pending.length) {
    const id = pending.pop()!;
    visited++;
    for (const edge of outgoing.get(id)!) {
      if (edge.feedback) continue;
      const degree = indegree.get(edge.to)! - 1;
      indegree.set(edge.to, degree);
      if (degree === 0) pending.push(edge.to);
    }
  }
  if (visited !== nodes.size) return false;
  for (const edge of graph.edges) {
    if (!edge.feedback) continue;
    const seen = new Set<string>();
    const path = [edge.to];
    while (path.length) {
      const id = path.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of outgoing.get(id)!) if (!next.feedback) path.push(next.to);
    }
    if (!seen.has(edge.from)) return false;
  }
  return true;
}

/** Remove redundant merger stages without changing rates or belt capacities. */
export function collapseDistributionMergers(graph: DistributionResult): DistributionResult {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, { ...edge }]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, [] as DistributionEdge[]]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as DistributionEdge[]]));
  for (const edge of edges.values()) {
    incoming.get(edge.to)!.push(edge);
    outgoing.get(edge.from)!.push(edge);
  }
  for (const node of graph.nodes) {
    if (node.kind !== "merger" || !nodes.has(node.id)) continue;
    const outputs = outgoing.get(node.id)!;
    if (outputs.length !== 1) continue;
    const bridge = outputs[0]!;
    if (nodes.get(bridge.to)?.kind !== "merger") continue;
    const inputs = incoming.get(node.id)!;
    const downstream = incoming.get(bridge.to)!;
    if (inputs.length + downstream.length - 1 > 3) continue;
    if (inputs.some((edge) => edge.from === bridge.to)) continue;
    for (const edge of inputs) {
      edge.to = bridge.to;
      // When collapsing a return collector, each redirected belt is a return.
      edge.feedback = edge.feedback || bridge.feedback;
    }
    downstream.splice(downstream.indexOf(bridge), 1, ...inputs);
    nodes.delete(node.id);
    edges.delete(bridge.id);
  }
  return { ...graph, nodes: [...nodes.values()], edges: [...edges.values()] };
}

export function distributionCost(graph: DistributionResult): readonly number[] {
  return [
    graph.nodes.filter(
      (node) => node.kind === "splitter" || node.kind === "merger" || node.kind === "junction",
    ).length,
    graph.edges.length,
    graph.edges.filter((edge) => edge.feedback).length,
  ];
}

export function cheaperCost(candidate: readonly number[], current: readonly number[]): boolean {
  for (let i = 0; i < candidate.length; i++) {
    if (candidate[i] !== current[i]) return candidate[i]! < current[i]!;
  }
  return false;
}
