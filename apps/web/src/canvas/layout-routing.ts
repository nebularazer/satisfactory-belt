import type { CanvasDocument, CanvasMaterialLink } from "./document";
import type { Point, Rectangle } from "./geometry";
import { materialPortGeometry } from "./material-port-geometry";
import {
  routeIsClear,
  routeOrthogonally,
  simplifyRoute,
} from "./orthogonal-router";

export type LayoutGroup = Rectangle & {
  id: string;
  nodeIds: readonly string[];
};
type Routes = ReadonlyMap<string, readonly Point[]>;
const portKey = (nodeId: string, portId: string) =>
  JSON.stringify([nodeId, portId]);
const distance = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const between = (n: number, a: number, b: number) =>
  n >= Math.min(a, b) && n <= Math.max(a, b);

/** Ambiguous overlaps, crossings, bends, then length. Size is never a priority. */
export function layoutRouteScore(
  link: CanvasMaterialLink,
  route: readonly Point[],
  links: readonly CanvasMaterialLink[],
  routes: Routes,
): readonly number[] {
  let overlap = 0;
  const crossings = new Set<string>();
  for (const other of links) {
    if (other.id === link.id) continue;
    const path = routes.get(other.id);
    if (!path) continue;
    const shared = ["from", "to"] as const;
    const sharedPoints = shared.flatMap((a) =>
      shared.flatMap((b) =>
        link[a].nodeId === other[b].nodeId && link[a].portId === other[b].portId
          ? [a === "from" ? route[0]! : route.at(-1)!]
          : [],
      ),
    );
    for (let i = 1; i < route.length; i++)
      for (let j = 1; j < path.length; j++) {
        const a = route[i - 1]!,
          b = route[i]!,
          c = path[j - 1]!,
          d = path[j]!;
        const horizontal = a.y === b.y;
        if (horizontal === (c.y === d.y)) {
          const sameLine = horizontal ? a.y === c.y : a.x === c.x;
          if (!sameLine) continue;
          if (
            sharedPoints.some(
              (p) =>
                between(p.x, a.x, b.x) &&
                between(p.y, a.y, b.y) &&
                between(p.x, c.x, d.x) &&
                between(p.y, c.y, d.y),
            )
          )
            continue;
          overlap += Math.max(
            0,
            horizontal
              ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
                  Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
              : Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
                  Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)),
          );
        } else {
          const p = horizontal ? { x: c.x, y: a.y } : { x: a.x, y: c.y };
          if (
            between(p.x, a.x, b.x) &&
            between(p.y, a.y, b.y) &&
            between(p.x, c.x, d.x) &&
            between(p.y, c.y, d.y) &&
            !sharedPoints.some((shared) => shared.x === p.x && shared.y === p.y)
          )
            crossings.add(JSON.stringify([other.id, p.x, p.y]));
        }
      }
  }
  return [
    overlap,
    crossings.size,
    Math.max(0, route.length - 2),
    route.slice(1).reduce((sum, p, i) => sum + distance(route[i]!, p), 0),
  ];
}
function better(a: readonly number[], b: readonly number[]) {
  for (let i = 0; i < a.length; i++)
    if (Math.abs(a[i]! - b[i]!) > 0.01) return a[i]! < b[i]!;
  return false;
}

/** Route through open corridors; unrelated group interiors remain obstacles.
 * Preserve ELK's lane choices as candidates, but remove unnecessary local tails.
 */
export function routeBetweenGroups(
  document: CanvasDocument,
  groups: readonly LayoutGroup[],
  initial: Routes,
): Map<string, readonly Point[]> {
  const owners = new Map(
    groups.flatMap((group) => group.nodeIds.map((id) => [id, group] as const)),
  );
  const ports = new Map(
    document.nodes
      .flatMap(materialPortGeometry)
      .map((p) => [portKey(p.nodeId, p.port.id), p]),
  );
  const routes = new Map(initial);
  const links = document.materialLinks.toSorted((a, b) =>
    a.id.localeCompare(b.id),
  );
  const external = links.filter(
    (link) => owners.get(link.from.nodeId) !== owners.get(link.to.nodeId),
  );
  const candidates = new Map<string, readonly (readonly Point[])[]>();
  for (const link of external) {
    const from = ports.get(portKey(link.from.nodeId, link.from.portId))!;
    const to = ports.get(portKey(link.to.nodeId, link.to.portId))!;
    const fromGroup = owners.get(from.nodeId)!;
    const toGroup = owners.get(to.nodeId)!;
    const obstacles = [
      ...document.nodes.map((node) => ({ ...node, id: node.configuration.id })),
      ...groups
        .filter((group) => group !== fromGroup && group !== toGroup)
        .map((group) => ({ ...group, id: `group:${group.id}` })),
    ];
    const padded = obstacles.map((rect) => ({
      ...rect,
      x: rect.x - 16,
      y: rect.y - 16,
      width: rect.width + 32,
      height: rect.height + 32,
    }));
    const seed = initial.get(link.id)!;
    const options: (readonly Point[])[] = [
      routeOrthogonally(from, to, obstacles),
    ];
    if (
      from.side === "right" &&
      to.side === "left" &&
      fromGroup.x + fromGroup.width < toGroup.x
    ) {
      const start = fromGroup.x + fromGroup.width + 32;
      const end = toGroup.x - 32;
      const lanes = new Set([
        ...seed
          .slice(1)
          .flatMap((p, i) =>
            p.x === seed[i]!.x && p.x >= start && p.x <= end ? [p.x] : [],
          ),
        start,
        end,
        (start + end) / 2,
      ]);
      for (const x of lanes) {
        const simple = simplifyRoute([
          from.point,
          { x, y: from.point.y },
          { x, y: to.point.y },
          to.point,
        ]);
        if (routeIsClear(simple, padded, from.nodeId, to.nodeId))
          options.push(simple);
        else if (x !== start && x !== end) {
          // A single waypoint can turn around an internal router without first
          // returning to a prescribed exit height and creating a U-turn.
          options.push(
            routeOrthogonally(from, to, obstacles, [{ x, y: to.point.y }]),
          );
          options.push(
            routeOrthogonally(from, to, obstacles, [{ x, y: from.point.y }]),
          );
        }
      }
    }
    const unique = new Map(
      options
        .filter((route) =>
          routeIsClear(route, obstacles, from.nodeId, to.nodeId),
        )
        .map((route) => [JSON.stringify(route), route]),
    );
    candidates.set(link.id, [...unique.values()]);
  }
  // Two deterministic sweeps let an earlier connection react to a lane freed by
  // a later one. Only routes change; group positions and port identities do not.
  for (let pass = 0; pass < 2; pass++)
    for (const link of external) {
      const valid = candidates.get(link.id)!;
      if (!valid.length)
        throw new Error("Could not route between production groups.");
      let chosen = valid.includes(routes.get(link.id)!)
        ? routes.get(link.id)!
        : valid[0]!;
      let score = layoutRouteScore(link, chosen, links, routes);
      for (const candidate of candidates.get(link.id)!) {
        const next = layoutRouteScore(link, candidate, links, routes);
        if (better(next, score)) {
          chosen = candidate;
          score = next;
        }
      }
      routes.set(link.id, chosen);
    }
  return routes;
}
