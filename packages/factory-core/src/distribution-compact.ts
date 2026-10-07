import {
  DistributionGraph,
  FLOW_EPSILON,
  DISTRIBUTION_BELTS,
  cheaperCost,
  collapseDistributionMergers,
  distributionCost,
  validateDistribution,
  distributionFailure,
} from "./distribution-graph";
import type {
  DistributionEndpoint,
  DistributionResult,
  DistributionStream,
} from "./distribution-graph";
import { DistributionPatterns, distributionUnits } from "./distribution-patterns";
import type { DistributionPattern } from "./distribution-patterns";

function materialize(
  graph: DistributionGraph,
  tree: DistributionPattern,
  stream: DistributionStream,
  deliveries: DistributionStream[][],
  quantum: number,
): void {
  if (tree.kind === "delivery") {
    deliveries[tree.target]!.push(stream);
    return;
  }
  if (tree.kind === "feedback") {
    const merger = graph.junction("merger");
    graph.connect(stream, merger);
    // Feedback targets are lexically scoped to a pattern. Sibling patterns can
    // reuse the same local index without connecting their return belts together.
    const returns: DistributionStream[] = [];
    const local = [...deliveries];
    local[tree.returnTarget] = returns;
    materialize(
      graph,
      tree.child,
      { from: merger, rate: tree.child.units * quantum },
      local,
      quantum,
    );
    graph.connect(graph.merge(returns), merger, true);
    return;
  }
  const splitter = graph.junction("splitter");
  graph.connect(stream, splitter);
  for (const child of tree.children)
    materialize(graph, child, { from: splitter, rate: child.units * quantum }, deliveries, quantum);
}

function construct(
  sources: readonly DistributionEndpoint[],
  destinations: readonly DistributionEndpoint[],
  capacity: number,
  patterns: DistributionPatterns,
  pooled: boolean,
  sorted: boolean,
  optimize: boolean,
): DistributionResult | undefined {
  const graph = new DistributionGraph(sources, destinations);
  const remaining = destinations.map((destination) => ({ ...destination }));
  const unmatched: DistributionEndpoint[] = [];
  for (const source of sources) {
    const match = remaining.findIndex(
      (target) => Math.abs(target.rate - source.rate) <= FLOW_EPSILON,
    );
    if (match < 0) unmatched.push(source);
    else graph.connect({ from: source.id, rate: source.rate }, remaining.splice(match, 1)[0]!.id);
  }
  if (sorted) {
    unmatched.sort((a, b) => b.rate - a.rate || a.id.localeCompare(b.id));
    remaining.sort((a, b) => b.rate - a.rate || a.id.localeCompare(b.id));
  }
  const groups: DistributionEndpoint[][] = [];
  for (const source of unmatched) {
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
  const received = new Map(remaining.map((target) => [target.id, [] as DistributionStream[]]));
  for (const group of groups) {
    const stream = graph.merge(group.map((source) => ({ from: source.id, rate: source.rate })));
    let left = stream.rate;
    const allocations: DistributionEndpoint[] = [];
    for (const target of remaining) {
      const rate = Math.min(left, target.rate);
      if (rate > 0) allocations.push({ id: target.id, rate });
      target.rate -= rate;
      left -= rate;
    }
    if (!allocations.length) return undefined;
    const units = distributionUnits(allocations.map((allocation) => allocation.rate));
    if (!units) return undefined;
    const quantum = stream.rate / units.reduce((sum, value) => sum + value, 0);
    const tree = patterns.solve(units, capacity / quantum, optimize);
    if (!tree) return undefined;
    materialize(
      graph,
      tree,
      stream,
      allocations.map((allocation) => received.get(allocation.id)!),
      quantum,
    );
  }
  for (const [id, streams] of received) {
    if (!streams.length) return undefined;
    graph.connect(graph.merge(streams), id);
  }
  return collapseDistributionMergers({ nodes: graph.nodes, edges: graph.edges });
}

export function compactDistribution(
  sources: readonly DistributionEndpoint[],
  destinations: readonly DistributionEndpoint[],
  tier: number,
  baseline: DistributionResult,
): DistributionResult {
  let best = validateDistribution(baseline, sources, destinations, tier)
    ? collapseDistributionMergers(baseline)
    : undefined;
  if (best && distributionCost(best)[0] === 0) return best;
  const patterns = new DistributionPatterns();
  // Finish complete networks, across all suppliers, before refining any branch.
  // Exhausting the improvement budget must not discard a usable construction.
  for (const optimize of [false, true]) {
    for (const [pooled, sorted] of [
      [false, false],
      [false, true],
      [true, true],
    ] as const) {
      const candidate = construct(
        sources,
        destinations,
        DISTRIBUTION_BELTS[tier - 1]!,
        patterns,
        pooled,
        sorted,
        optimize,
      );
      if (
        candidate &&
        validateDistribution(candidate, sources, destinations, tier) &&
        (!best || cheaperCost(distributionCost(candidate), distributionCost(best)))
      )
        best = candidate;
    }
  }
  return (
    best ??
    distributionFailure(
      "construction-limit",
      "No balanced construction was found within the construction limits. Try a higher belt tier.",
    )
  );
}
