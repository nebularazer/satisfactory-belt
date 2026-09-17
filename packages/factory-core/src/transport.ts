import type { FacilityNode, TransportRoute } from "./facilities";
import type { FactoryNode } from "./index";
import type { FactoryDocument } from "./links";

export function stationKind(node: FactoryNode): TransportRoute["kind"] | null {
  if (node.kind !== "facility") return null;
  const type = node.configuration.type;
  return type === "truck-station"
    ? "road"
    : type === "train-station"
      ? "rail"
      : type === "drone-port"
        ? "drone"
        : null;
}

/** A directed chain stays editable until its last departure reconnects to its first arrival. */
export function routeTopology(document: FactoryDocument, nodeId: string) {
  const links = document.links.filter(
    (link) => link.output.portKey === "route:output" && link.input.portKey === "route:input",
  );
  const members = new Set([nodeId]);
  const queue = [nodeId];
  for (let i = 0; i < queue.length; i++) {
    for (const link of links) {
      const next =
        link.output.nodeId === queue[i]
          ? link.input.nodeId
          : link.input.nodeId === queue[i]
            ? link.output.nodeId
            : null;
      if (next && !members.has(next)) {
        members.add(next);
        queue.push(next);
      }
    }
  }
  const first =
    [...members].find((id) => !links.some((link) => link.input.nodeId === id)) ??
    [...members].toSorted()[0]!;
  const ordered: string[] = [];
  let current: string | undefined = first;
  while (current && !ordered.includes(current)) {
    ordered.push(current);
    current = links.find((link) => link.output.nodeId === current)?.input.nodeId;
  }
  return {
    nodeIds: ordered,
    closed: ordered.length > 1 && current === first && ordered.length === members.size,
  };
}

/** Derive station membership, stop order and freight car count from canvas connections in one edit. */
export function reconcileTransportConnections(document: FactoryDocument): FactoryDocument {
  const stations = document.nodes.filter((node) => stationKind(node) !== null);
  if (!stations.length && !document.routes?.length) return document;
  const assigned = new Map<string, string>();
  const routes: TransportRoute[] = [];
  const usedRoutes = new Set<string>();
  for (const station of stations) {
    if (assigned.has(station.id)) continue;
    const topology = routeTopology(document, station.id);
    const previous = (document.routes ?? []).find((route) =>
      route.stops.some((stop) => topology.nodeIds.includes(stop.nodeId)),
    );
    const id = previous && !usedRoutes.has(previous.id) ? previous.id : `route:${station.id}`;
    usedRoutes.add(id);
    for (const member of topology.nodeIds) assigned.set(member, id);
    routes.push({
      id,
      name: previous?.name ?? `${stationKind(station)} route`,
      kind: stationKind(station)!,
      vehicleCount: previous?.vehicleCount ?? 1,
      ...(stationKind(station) === "rail"
        ? {
            freightCarCount: Math.max(
              1,
              ...stations.flatMap((node) =>
                node.kind === "facility" &&
                node.configuration.type === "train-station" &&
                topology.nodeIds.includes(node.id)
                  ? [node.configuration.platforms.findLastIndex(Boolean) + 1]
                  : [],
              ),
              ...(document.routes ?? [])
                .filter((route) =>
                  route.stops.some((stop) => topology.nodeIds.includes(stop.nodeId)),
                )
                .map((route) => route.freightCarCount ?? 1),
            ),
          }
        : {}),
      roundTripSeconds: previous?.roundTripSeconds ?? 120,
      fuelPerTrip: previous?.fuelPerTrip ?? 0,
      stops: topology.nodeIds.map(
        (nodeId) =>
          document.routes
            ?.flatMap((route) => route.stops)
            .find((stop) => stop.nodeId === nodeId) ?? {
            id: `stop:${nodeId}`,
            nodeId,
            waitSeconds: 0,
          },
      ),
    });
  }
  return {
    ...document,
    routes,
    nodes: document.nodes.map((node): FactoryNode => {
      if (node.kind !== "facility") return node;
      const c = node.configuration;
      if (c.type === "truck-station" || c.type === "train-station" || c.type === "drone-port") {
        const routeId = assigned.get(node.id) ?? null;
        const count = routes.find((route) => route.id === routeId)?.freightCarCount ?? 1;
        if (c.type === "train-station" && c.platforms.length !== count)
          return {
            ...node,
            configuration: {
              ...c,
              routeId,
              platforms: Array.from({ length: count }, (_, index) => c.platforms[index] ?? null),
            },
          };
        return c.routeId === routeId ? node : { ...node, configuration: { ...c, routeId } };
      }
      return node;
    }),
  };
}

export function stationRoute(document: FactoryDocument, node: FacilityNode) {
  return document.routes?.find((route) => route.stops.some((stop) => stop.nodeId === node.id));
}
