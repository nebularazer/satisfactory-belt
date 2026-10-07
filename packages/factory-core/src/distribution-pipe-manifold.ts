import { DistributionGraph, FLOW_EPSILON } from "./distribution-graph";
import type { DistributionEndpoint, DistributionResult } from "./distribution-graph";

/** A shared header with distributed feeds, not separate supplier allocation trees.
 * Each segment carries the signed cumulative supply minus consumption before it.
 * Feed placement is a bounded O(consumers × suppliers) dynamic program.
 */
export function pipeManifold(
  sources: readonly DistributionEndpoint[],
  destinations: readonly DistributionEndpoint[],
  capacity: number,
): DistributionResult | undefined {
  const count = destinations.length;
  if (count < 4 || sources.length > count + 2) return undefined;
  if (sources.length === count) {
    const supplyRates = sources.map((entry) => entry.rate).toSorted((a, b) => a - b);
    const demandRates = destinations.map((entry) => entry.rate).toSorted((a, b) => a - b);
    if (supplyRates.every((rate, index) => Math.abs(rate - demandRates[index]!) <= FLOW_EPSILON))
      return undefined;
  }
  // Prefer the first two suppliers at opposite ends; spread the rest between them.
  const ordered = sources
    .map((source, index) => ({
      source,
      preferred:
        index === 0
          ? 0
          : index === 1
            ? count - 1
            : Math.round(((index - 1) * (count - 1)) / (sources.length - 1)),
    }))
    .toSorted((a, b) => a.preferred - b.preferred);
  const supply = [0];
  for (const { source } of ordered) supply.push(supply.at(-1)! + source.rate);
  const demand = [0];
  for (const destination of destinations) demand.push(demand.at(-1)! + destination.rate);
  const parents: (number | undefined)[][] = [];
  let costs = Array<number>(sources.length + 1).fill(Infinity);
  costs[0] = 0;
  for (let station = 0; station < count; station++) {
    const next = Array<number>(sources.length + 1).fill(Infinity);
    const previous = Array<number | undefined>(sources.length + 1).fill(undefined);
    const sockets = station === 0 || station === count - 1 ? 2 : 1;
    for (let used = 0; used <= sources.length; used++) {
      if (!Number.isFinite(costs[used])) continue;
      for (let feeds = 0; feeds <= sockets && used + feeds <= sources.length; feeds++) {
        const total = used + feeds;
        if (station === count - 1 && total !== sources.length) continue;
        if (Math.abs(supply[total]! - demand[station + 1]!) > capacity + FLOW_EPSILON) continue;
        let cost = costs[used]!;
        for (let index = used; index < total; index++)
          cost += (station - ordered[index]!.preferred) ** 2;
        if (cost >= next[total]!) continue;
        next[total] = cost;
        previous[total] = used;
      }
    }
    parents.push(previous);
    costs = next;
  }
  if (!Number.isFinite(costs[sources.length])) return undefined;
  const feeds: number[][] = Array.from({ length: count }, () => []);
  let used = sources.length;
  for (let station = count - 1; station >= 0; station--) {
    const previous = parents[station]![used]!;
    for (let index = previous; index < used; index++) feeds[station]!.push(index);
    used = previous;
  }
  const graph = new DistributionGraph(sources, destinations, "pipe");
  const stations = destinations.map((destination, index) => ({
    destinationId: destination.id,
    // An unfed end needs just an elbow into its terminal machine, not a fitting.
    junctionId:
      (index === 0 || index === count - 1) && !feeds[index]!.length
        ? undefined
        : graph.junction("junction"),
  }));
  const stationIds = stations.map((station) => station.junctionId ?? station.destinationId);
  let balance = 0;
  for (let station = 0; station < count; station++) {
    const id = stationIds[station]!;
    for (const index of feeds[station]!) {
      const source = ordered[index]!.source;
      graph.connect({ from: source.id, rate: source.rate }, id);
      balance += source.rate;
    }
    const destination = destinations[station]!;
    if (stations[station]!.junctionId)
      graph.connect({ from: id, rate: destination.rate }, destination.id);
    balance -= destination.rate;
    if (station < count - 1) {
      const next = stationIds[station + 1]!;
      // Preserve a physical pipe even when its planned net flow is zero.
      graph.connect(
        { from: balance >= 0 ? id : next, rate: Math.abs(balance) },
        balance >= 0 ? next : id,
      );
    }
  }
  for (const node of graph.nodes)
    if (node.kind === "junction") {
      const sockets = graph.edges.filter(
        (edge) => edge.from === node.id || edge.to === node.id,
      ).length;
      node.junctionType = sockets === 3 ? "t" : "cross";
    }
  return { nodes: graph.nodes, edges: graph.edges, pipeManifold: { stations } };
}
