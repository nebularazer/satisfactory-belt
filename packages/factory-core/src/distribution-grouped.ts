import {
  DISTRIBUTION_BELTS,
  FLOW_EPSILON,
  DistributionGraph,
  collapseDistributionMergers,
} from "./distribution-graph";
import type { DistributionEndpoint, DistributionResult } from "./distribution-graph";

type BuildFlatDistribution = (
  sources: readonly DistributionEndpoint[],
  destinations: readonly DistributionEndpoint[],
  maxTier: number,
) => DistributionResult;
type Group = { endpoint: DistributionEndpoint; members: DistributionEndpoint[] };

/** Compose a network between connected groups with local machine distributions.
 * Virtual group endpoints disappear when the adjacent belts are joined.
 */
export function groupedDistribution(
  sources: readonly DistributionEndpoint[],
  destinations: readonly DistributionEndpoint[],
  maxTier: number,
  buildFlat: BuildFlatDistribution,
): DistributionResult | undefined {
  if (![...sources, ...destinations].some((endpoint) => endpoint.groupId !== undefined))
    return undefined;
  const ids = new Set([...sources, ...destinations].map((endpoint) => endpoint.id));
  let sequence = 0;
  const groupId = () => {
    let id: string;
    do id = `distribution-group-${sequence++}`;
    while (ids.has(id));
    ids.add(id);
    return id;
  };
  const capacity = DISTRIBUTION_BELTS[maxTier - 1]!;
  const group = (endpoints: readonly DistributionEndpoint[]): Group[] => {
    const grouped = new Map<string, DistributionEndpoint[]>();
    const entries: DistributionEndpoint[][] = [];
    for (const endpoint of endpoints) {
      // Omit the hint from subproblems; each local construction stays flat.
      const member = { id: endpoint.id, rate: endpoint.rate };
      const members = endpoint.groupId === undefined ? undefined : grouped.get(endpoint.groupId);
      if (members) members.push(member);
      else {
        const next = [member];
        entries.push(next);
        if (endpoint.groupId !== undefined) grouped.set(endpoint.groupId, next);
      }
    }
    return entries.flatMap((members) => {
      const rate = members.reduce((sum, member) => sum + member.rate, 0);
      // A grouping hint must never require an oversized belt. Keep those
      // machines independent while still grouping other eligible nodes.
      if (members.length === 1 || rate > capacity + FLOW_EPSILON)
        return members.map((member) => ({ endpoint: member, members: [member] }));
      return [{ endpoint: { id: groupId(), rate }, members }];
    });
  };
  const supply = group(sources);
  const demand = group(destinations);
  if (![...supply, ...demand].some((entry) => entry.members.length > 1)) return undefined;
  const trunk = buildFlat(
    supply.map((entry) => entry.endpoint),
    demand.map((entry) => entry.endpoint),
    maxTier,
  );
  if (trunk.error) return undefined;
  const graph = new DistributionGraph(sources, destinations);
  const roots = new Map<string, string>();
  const append = (part: DistributionResult, boundary?: string) => {
    const renamed = new Map<string, string>();
    for (const node of part.nodes)
      if (node.kind === "splitter" || node.kind === "merger")
        renamed.set(node.id, graph.junction(node.kind));
    const resolve = (id: string) => renamed.get(id) ?? roots.get(id) ?? id;
    for (const edge of part.edges) {
      if (boundary !== undefined && (edge.from === boundary || edge.to === boundary)) {
        roots.set(boundary, resolve(edge.from === boundary ? edge.to : edge.from));
        continue;
      }
      graph.connect({ from: resolve(edge.from), rate: edge.rate }, resolve(edge.to), edge.feedback);
    }
  };
  for (const entry of supply) {
    if (entry.members.length === 1) continue;
    const local = buildFlat(entry.members, [entry.endpoint], maxTier);
    if (local.error) return undefined;
    append(local, entry.endpoint.id);
  }
  for (const entry of demand) {
    if (entry.members.length === 1) continue;
    const local = buildFlat([entry.endpoint], entry.members, maxTier);
    if (local.error) return undefined;
    append(local, entry.endpoint.id);
  }
  append(trunk);
  return collapseDistributionMergers({ nodes: graph.nodes, edges: graph.edges });
}
