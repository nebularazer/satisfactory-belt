import type { CanvasDocument } from "./document";
import { materialPortGeometry } from "./material-port-geometry";

/** Arrange two-way belt routers on their outer slots without changing the
 * connected port identities (including smart rules and merger priorities). */
export function spaceRouterPorts(document: CanvasDocument): CanvasDocument {
  const connected = new Map<string, Set<string>>();
  for (const link of document.materialLinks)
    for (const endpoint of [link.from, link.to]) {
      const ports = connected.get(endpoint.nodeId) ?? new Set<string>();
      ports.add(endpoint.portId);
      connected.set(endpoint.nodeId, ports);
    }
  let changed = false;
  const nodes = document.nodes.map((node) => {
    if (node.configuration.kind !== "router") return node;
    let result = node;
    const geometry = materialPortGeometry(node);
    for (const direction of ["input", "output"] as const) {
      const ports = geometry
        .filter(({ port }) => port.direction === direction)
        .map(({ port }) => port.id);
      const used = ports.filter((id) =>
        connected.get(node.configuration.id)?.has(id),
      );
      if (ports.length !== 3 || used.length !== 2) continue;
      const unused = ports.find((id) => !used.includes(id))!;
      const order = [used[0]!, unused, used[1]!];
      if (ports.every((id, index) => id === order[index])) continue;
      result = {
        ...result,
        portOrder: { ...result.portOrder, [direction]: order },
      };
      changed = true;
    }
    return result;
  });
  return changed ? { ...document, nodes } : document;
}
