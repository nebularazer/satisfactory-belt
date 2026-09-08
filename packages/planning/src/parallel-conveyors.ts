import { createNode } from "@satisfactory-belt/production";
import {
  assertDetailedNodeConfiguration,
  createDetailedPlan,
  endpointKey,
} from "./detailed-plan";
import type { BasicLinkFlow } from "./basic-flow-analysis";
import type {
  DetailedPlan,
  MaterialEndpoint,
  PhysicalConnection,
} from "./types";

const SPLITTER = "Build_ConveyorAttachmentSplitter_C";
const MERGER = "Build_ConveyorAttachmentMerger_C";
const EPSILON = 1e-7;

/** Replace overloaded shared conveyor networks with separate producer feeds.
 * Physical machine ports remain singular; only ordinary logistics is rebuilt.
 */
export function separateConveyorSupply(
  plan: DetailedPlan,
  flows: readonly BasicLinkFlow[],
): DetailedPlan {
  const tiers = plan.tiers
    .filter((tier) => tier.medium === "conveyor")
    .toSorted((a, b) => a.capacityPerMinute - b.capacityPerMinute);
  const maximum = tiers.at(-1)?.capacityPerMinute ?? 0;
  const flowById = new Map(flows.map((flow) => [flow.linkId, flow]));
  const nodes = new Map(
    plan.nodes.map((node) => [node.configuration.id, node]),
  );
  const connections = new Map(
    plan.connections.map((connection) => [connection.id, connection]),
  );
  const routers = new Set(
    plan.nodes
      .filter(
        (node) =>
          [SPLITTER, MERGER].includes(node.configuration.buildableId) &&
          !node.routingRules?.length,
      )
      .map((node) => node.configuration.id),
  );
  const vertex = (endpoint: MaterialEndpoint) =>
    routers.has(endpoint.nodeId)
      ? `router:${endpoint.nodeId}`
      : endpointKey(endpoint);
  const adjacency = new Map<string, PhysicalConnection[]>();
  for (const connection of plan.connections) {
    if (connection.kind !== "conveyor") continue;
    for (const endpoint of [connection.from, connection.to]) {
      const key = vertex(endpoint);
      const edges = adjacency.get(key) ?? [];
      edges.push(connection);
      adjacency.set(key, edges);
    }
  }
  let changed = false;
  let sequence = 0;
  const seen = new Set<string>();
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const pending = [start];
    const network = new Map<string, PhysicalConnection>();
    for (let index = 0; index < pending.length; index++) {
      const key = pending[index]!;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const connection of adjacency.get(key) ?? []) {
        network.set(connection.id, connection);
        for (const endpoint of [connection.from, connection.to])
          if (!seen.has(vertex(endpoint))) pending.push(vertex(endpoint));
      }
    }
    const edges = [...network.values()];
    if (
      !edges.some(
        (edge) =>
          (flowById.get(edge.id)?.ratePerMinute ?? 0) > maximum + EPSILON,
      )
    )
      continue;
    const sourceEdges = edges.filter((edge) => !routers.has(edge.from.nodeId));
    const targetEdges = edges.filter((edge) => !routers.has(edge.to.nodeId));
    const targets = targetEdges
      .map((edge) => ({
        edge,
        remaining: flowById.get(edge.id)?.ratePerMinute ?? 0,
      }))
      .filter((target) => target.remaining > EPSILON);
    for (const target of targets) {
      if (target.remaining > maximum + EPSILON) {
        const node = createNode(
          nodes.get(target.edge.to.nodeId)!.configuration,
        );
        const label =
          node.kind === "process" ? node.process.name : target.edge.to.nodeId;
        throw new Error(
          `${label} needs ${Number(target.remaining.toFixed(4))} items/min through one input port, but the selected belt carries ${maximum}. Use a faster belt or spread this machine's workload across more machines at lower clocks.`,
        );
      }
    }
    const sources = sourceEdges
      .map((edge) => {
        const node = createNode(nodes.get(edge.from.nodeId)!.configuration);
        const itemId = flowById.get(edge.id)?.itemId;
        const nominal =
          node.profile.materials.kind === "calculated"
            ? node.profile.materials.outputs.find(
                (output) => output.itemId === itemId,
              )?.ratePerMinute
            : undefined;
        return {
          edge,
          available: Math.min(
            maximum,
            nominal ?? flowById.get(edge.id)?.ratePerMinute ?? 0,
          ),
        };
      })
      .filter((source) => source.available > EPSILON);
    const demand = targets.reduce((sum, target) => sum + target.remaining, 0);
    const available = sources.reduce(
      (sum, source) => sum + source.available,
      0,
    );
    if (available + EPSILON < demand)
      throw new Error(
        `The machines' output ports can supply only ${Number(available.toFixed(4))} of the required ${Number(demand.toFixed(4))} items/min with these belts. Parallel lines cannot bypass a single machine port. Use faster belts or provide additional producers.`,
      );
    if (!targets.length || !sources.length) continue;
    const networkRouterIds = new Set(
      edges
        .flatMap((edge) => [edge.from.nodeId, edge.to.nodeId])
        .filter((id) => routers.has(id)),
    );
    if (!networkRouterIds.size) continue;
    const owner = [...networkRouterIds][0]!;
    const itemId = flowById.get(targets[0]!.edge.id)?.itemId;
    const uniqueId = () => {
      let id: string;
      do {
        id = `${owner}:balance:parallel:${++sequence}`;
      } while (nodes.has(id) || connections.has(id));
      return id;
    };
    const addRouter = (buildableId: string) => {
      const id = uniqueId();
      const configuration = createNode({
        id,
        buildableId,
        kind: "router",
        itemId,
      }).configuration;
      assertDetailedNodeConfiguration(configuration);
      nodes.set(id, { configuration });
      return id;
    };
    const connect = (
      from: MaterialEndpoint,
      to: MaterialEndpoint,
      rate: number,
    ) => {
      const id = uniqueId();
      const tier = tiers.find(
        (candidate) => candidate.capacityPerMinute + EPSILON >= rate,
      );
      if (!tier) throw new Error("A parallel conveyor exceeded its capacity.");
      connections.set(id, { id, from, to, kind: "conveyor", tierId: tier.id });
    };
    // The northwest-corner allocation forms a forest, keeping each producer's
    // feed within its port capacity and avoiding an aggregate collection trunk.
    const allocations: { source: number; target: number; rate: number }[] = [];
    let targetIndex = 0;
    sources.forEach((source, sourceIndex) => {
      let remaining = source.available;
      while (remaining > EPSILON && targetIndex < targets.length) {
        const target = targets[targetIndex]!;
        const rate = Math.min(remaining, target.remaining);
        allocations.push({ source: sourceIndex, target: targetIndex, rate });
        remaining -= rate;
        target.remaining -= rate;
        if (target.remaining <= EPSILON) targetIndex++;
      }
    });
    for (const id of networkRouterIds) nodes.delete(id);
    for (const edge of edges) connections.delete(edge.id);
    const assigned = new Map<number, MaterialEndpoint>();
    const fanOut = (from: MaterialEndpoint, parts: typeof allocations) => {
      if (parts.length === 1) {
        assigned.set(allocations.indexOf(parts[0]!), from);
        return;
      }
      const id = addRouter(SPLITTER);
      connect(
        from,
        { nodeId: id, portId: "input:1" },
        parts.reduce((sum, part) => sum + part.rate, 0),
      );
      const size = Math.ceil(parts.length / 3);
      for (let index = 0; index < parts.length; index += size)
        fanOut(
          { nodeId: id, portId: `output:${Math.floor(index / size) + 1}` },
          parts.slice(index, index + size),
        );
    };
    sources.forEach((source, index) => {
      const parts = allocations.filter((part) => part.source === index);
      if (parts.length) fanOut(source.edge.from, parts);
    });
    targets.forEach((target, index) => {
      let shares = allocations.flatMap((part, allocation) =>
        part.target === index
          ? [{ endpoint: assigned.get(allocation)!, rate: part.rate }]
          : [],
      );
      while (shares.length > 1) {
        const next: typeof shares = [];
        for (let index = 0; index < shares.length; index += 3) {
          const group = shares.slice(index, index + 3);
          if (group.length === 1) {
            next.push(group[0]!);
            continue;
          }
          const id = addRouter(MERGER);
          group.forEach((share, port) =>
            connect(
              share.endpoint,
              { nodeId: id, portId: `input:${port + 1}` },
              share.rate,
            ),
          );
          next.push({
            endpoint: { nodeId: id, portId: "output:1" },
            rate: group.reduce((sum, share) => sum + share.rate, 0),
          });
        }
        shares = next;
      }
      connect(shares[0]!.endpoint, target.edge.to, shares[0]!.rate);
    });
    changed = true;
  }
  return changed
    ? createDetailedPlan({
        ...plan,
        nodes: [...nodes.values()],
        connections: [...connections.values()],
      })
    : plan;
}
