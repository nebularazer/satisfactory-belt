import {
  DistributionGraph,
  FLOW_EPSILON,
  DISTRIBUTION_PIPES,
  cheaperCost,
  validateDistribution,
  distributionFailure,
  distributionCost,
} from "./distribution-graph";
import type {
  DistributionEndpoint,
  DistributionResult,
  DistributionStream,
} from "./distribution-graph";
import { pipeManifold } from "./distribution-pipe-manifold";

/** Three-port T and four-port cross fittings allow flow in either direction.
 * Edge rates are a steady-state allocation, not a fluid dynamics simulation.
 */
export function pipeDistribution(
  sources: readonly DistributionEndpoint[],
  destinations: readonly DistributionEndpoint[],
  maxTier: number,
): DistributionResult {
  const capacity = DISTRIBUTION_PIPES[maxTier - 1]!;
  const manifold = pipeManifold(sources, destinations, capacity);
  if (manifold && validateDistribution(manifold, sources, destinations, maxTier, "pipe"))
    return manifold;
  const construct = (pooled: boolean) => {
    const graph = new DistributionGraph(sources, destinations, "pipe");
    const remaining = destinations.map((entry) => ({ ...entry }));
    const received = new Map(destinations.map((entry) => [entry.id, [] as DistributionStream[]]));
    const groups: DistributionEndpoint[][] = [];
    for (const source of sources) {
      const match = remaining.findIndex(
        (entry) => Math.abs(entry.rate - source.rate) <= FLOW_EPSILON,
      );
      if (match >= 0) {
        graph.connect({ from: source.id, rate: source.rate }, remaining[match]!.id);
        remaining.splice(match, 1);
        continue;
      }
      const group = pooled
        ? groups.find(
            (entries) =>
              entries.reduce((sum, entry) => sum + entry.rate, 0) + source.rate <=
              capacity + FLOW_EPSILON,
          )
        : undefined;
      if (group) group.push(source);
      else groups.push([source]);
    }
    for (const group of groups) {
      let stream = graph.merge(group.map((source) => ({ from: source.id, rate: source.rate })));
      let left = stream.rate;
      const allocations: DistributionEndpoint[] = [];
      for (const target of remaining) {
        const rate = Math.min(left, target.rate);
        if (rate > 0) allocations.push({ id: target.id, rate });
        target.rate -= rate;
        left -= rate;
      }
      if (!allocations.length) return undefined;
      // Each junction feeds up to two consumers plus the remaining branch.
      // The final junction can feed three consumers directly.
      for (let index = 0; index < allocations.length;) {
        const count = allocations.length - index;
        const id = count > 1 ? graph.junction("junction") : stream.from;
        if (count > 1) graph.connect(stream, id);
        const branches = count <= 3 ? count : 2;
        for (const target of allocations.slice(index, index + branches)) {
          received.get(target.id)!.push({ from: id, rate: target.rate });
          left = stream.rate - target.rate;
          stream = { from: id, rate: left };
        }
        index += branches;
      }
    }
    for (const target of remaining) {
      const streams = received.get(target.id)!;
      if (!streams.length) return undefined;
      graph.connect(graph.merge(streams), target.id);
    }
    return collapseJunctions({ nodes: graph.nodes, edges: graph.edges });
  };
  const candidates = [construct(false), construct(true)].filter(
    (graph): graph is DistributionResult =>
      graph !== undefined && validateDistribution(graph, sources, destinations, maxTier, "pipe"),
  );
  return (
    candidates.reduce<DistributionResult | undefined>(
      (best, graph) =>
        !best || cheaperCost(distributionCost(graph), distributionCost(best)) ? graph : best,
      undefined,
    ) ??
    distributionFailure(
      "construction-limit",
      "Could not construct a pipe network for these flow rates.",
    )
  );
}

/** Adjacent junctions can share one cross when their remaining pipes fit four ports. */
function collapseJunctions(graph: DistributionResult): DistributionResult {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, { ...edge }]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, [] as typeof graph.edges]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as typeof graph.edges]));
  for (const edge of edges.values()) {
    incoming.get(edge.to)!.push(edge);
    outgoing.get(edge.from)!.push(edge);
  }
  for (const bridge of edges.values()) {
    if (
      !edges.has(bridge.id) ||
      nodes.get(bridge.from)?.kind !== "junction" ||
      nodes.get(bridge.to)?.kind !== "junction"
    )
      continue;
    const sourceIn = incoming.get(bridge.from)!;
    const sourceOut = outgoing.get(bridge.from)!;
    const targetIn = incoming.get(bridge.to)!;
    const targetOut = outgoing.get(bridge.to)!;
    if (sourceIn.length + sourceOut.length + targetIn.length + targetOut.length - 2 > 4) continue;
    // Do not collapse a parallel route into a self-loop.
    if (sourceOut.filter((edge) => edge.to === bridge.to).length !== 1) continue;
    for (const edge of sourceIn) edge.to = bridge.to;
    for (const edge of sourceOut) if (edge.id !== bridge.id) edge.from = bridge.to;
    targetIn.splice(
      targetIn.findIndex((edge) => edge.id === bridge.id),
      1,
      ...sourceIn,
    );
    targetOut.push(...sourceOut.filter((edge) => edge.id !== bridge.id));
    nodes.delete(bridge.from);
    edges.delete(bridge.id);
  }
  for (const node of nodes.values())
    if (node.kind === "junction")
      node.junctionType =
        incoming.get(node.id)!.length + outgoing.get(node.id)!.length === 3 ? "t" : "cross";
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
