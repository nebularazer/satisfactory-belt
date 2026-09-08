import type { CanvasDocument } from "./document";
import type { Point } from "./geometry";
import { SNAP_INTERVAL } from "./grid";
import { materialLinkPath } from "./material-link-geometry";

function occupiedBounds(document: CanvasDocument) {
  const points = [
    ...document.nodes.flatMap((node) => [
      { x: node.x, y: node.y },
      { x: node.x + node.width, y: node.y + node.height },
    ]),
    ...document.materialLinks.flatMap(
      (link) => materialLinkPath(document, link)?.route ?? [],
    ),
  ];
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

/** Fresh identities and a free rectangle keep repeated generation independent. */
export function prepareProductionInsertion(
  existing: CanvasDocument,
  generated: CanvasDocument,
  prefix: string,
  at: Point = { x: 0, y: 0 },
) {
  if (!generated.nodes.length) throw new Error("The generated plan is empty.");
  const { left, top, right, bottom } = occupiedBounds(generated);
  let x = at.x;
  const y = at.y;
  if (existing.nodes.length) {
    const occupied = occupiedBounds(existing);
    const overlaps =
      occupied.left < x + right - left + 128 &&
      occupied.right + 128 > x &&
      occupied.top < y + bottom - top + 128 &&
      occupied.bottom + 128 > y;
    if (overlaps) x = occupied.right + 192;
  }
  const dx = Math.ceil(x / SNAP_INTERVAL) * SNAP_INTERVAL - left;
  const dy = Math.ceil(y / SNAP_INTERVAL) * SNAP_INTERVAL - top;
  const id = (old: string) => `${prefix}:${old}`;
  const nodes = generated.nodes.map((node) => ({
    ...node,
    configuration: {
      ...node.configuration,
      id: id(node.configuration.id),
      ...(node.configuration.kind === "process"
        ? {
            instances: node.configuration.instances.map((instance) => ({
              ...instance,
              id: id(instance.id),
            })),
          }
        : {}),
    } as typeof node.configuration,
    x: node.x + dx,
    y: node.y + dy,
  }));
  const materialLinks = generated.materialLinks.map((link) => ({
    ...link,
    id: id(link.id),
    from: { ...link.from, nodeId: id(link.from.nodeId) },
    to: { ...link.to, nodeId: id(link.to.nodeId) },
    ...(link.route
      ? {
          route: link.route.map((point) => ({
            x: point.x + dx,
            y: point.y + dy,
          })),
        }
      : {}),
  }));
  return { ...generated, nodes, materialLinks };
}
