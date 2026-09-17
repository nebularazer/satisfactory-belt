import type { TransportRoute } from "./facilities";
import type { FactoryNode } from "./index";
import type { FactoryDocument } from "./links";

/** Clone route identities and remap references inside a copied selection together. */
export function remapCopiedFacilities(
  nodes: readonly FactoryNode[],
  copiedRoutes: readonly TransportRoute[],
  ids: ReadonlyMap<string, string>,
  existingIds: ReadonlySet<string>,
  createId: () => string,
): { nodes: readonly FactoryNode[]; routes: readonly TransportRoute[] } {
  const routeIds = new Map(copiedRoutes.map((route) => [route.id, createId()]));
  const routes = copiedRoutes.map((route) => ({
    ...route,
    id: routeIds.get(route.id)!,
    stops: route.stops.flatMap((stop) => {
      const nodeId = ids.get(stop.nodeId) ?? (existingIds.has(stop.nodeId) ? stop.nodeId : null);
      return nodeId ? [{ ...stop, id: createId(), nodeId }] : [];
    }),
  }));
  return {
    routes,
    nodes: nodes.map((node) => {
      if (node.kind !== "facility") return node;
      const c = node.configuration;
      if (c.type === "truck-station" || c.type === "train-station" || c.type === "drone-port")
        return {
          ...node,
          configuration: { ...c, routeId: c.routeId ? (routeIds.get(c.routeId) ?? null) : null },
        };
      return node;
    }),
  };
}
export function copiedTransportRoutes(
  document: FactoryDocument,
  selected: ReadonlySet<string>,
): readonly TransportRoute[] {
  const routeIds = new Set(
    document.nodes.flatMap((node) =>
      selected.has(node.id) &&
      node.kind === "facility" &&
      "routeId" in node.configuration &&
      node.configuration.routeId
        ? [node.configuration.routeId]
        : [],
    ),
  );
  return (document.routes ?? []).filter((route) => routeIds.has(route.id));
}
