import { endpointKey } from "./detailed-plan";
import type { DetailedPlan } from "./types";

export function createDetailedPlanIndex(plan: DetailedPlan) {
  const connectionById = new Map(
    plan.connections.map((connection) => [connection.id, connection]),
  );
  const connectionsByNodeId = new Map<string, Set<string>>();
  const connectionByEndpoint = new Map<string, string>();
  for (const connection of plan.connections) {
    connectionByEndpoint.set(endpointKey(connection.from), connection.id);
    connectionByEndpoint.set(endpointKey(connection.to), connection.id);
    for (const nodeId of [connection.from.nodeId, connection.to.nodeId]) {
      const ids = connectionsByNodeId.get(nodeId) ?? new Set<string>();
      ids.add(connection.id);
      connectionsByNodeId.set(nodeId, ids);
    }
  }

  const connectedRegion = (seeds: readonly string[]) => {
    const result = new Set<string>();
    const queue = seeds.filter((id) => connectionById.has(id));
    while (queue.length) {
      const connectionId = queue.shift()!;
      if (result.has(connectionId)) continue;
      result.add(connectionId);
      const connection = connectionById.get(connectionId)!;
      for (const nodeId of [connection.from.nodeId, connection.to.nodeId]) {
        for (const adjacent of connectionsByNodeId.get(nodeId) ?? []) {
          if (!result.has(adjacent)) queue.push(adjacent);
        }
      }
    }
    return [...result].toSorted();
  };

  return {
    connectedRegion,
    connectionAt(endpoint: Readonly<{ nodeId: string; portId: string }>) {
      return connectionByEndpoint.get(endpointKey(endpoint));
    },
    connectionsForNode(nodeId: string) {
      return [...(connectionsByNodeId.get(nodeId) ?? [])].toSorted();
    },
  };
}

export function affectedDetailedRegion(
  plan: DetailedPlan,
  change: Readonly<{
    connectionIds?: readonly string[];
    nodeIds?: readonly string[];
  }>,
) {
  const index = createDetailedPlanIndex(plan);
  const seeds = new Set(change.connectionIds ?? []);
  for (const nodeId of change.nodeIds ?? []) {
    for (const connectionId of index.connectionsForNode(nodeId)) {
      seeds.add(connectionId);
    }
  }
  return index.connectedRegion([...seeds]);
}
