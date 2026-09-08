import {
  routeOrthogonally,
  routeIsClear,
  samePoint,
  type RouteEndpoint,
} from "./orthogonal-router";
import type { CanvasMaterialLink, CanvasNode } from "./document";
import type { ConnectionRoute } from "./connection-route";

import type { CanvasDocument } from "./document";
import type { Point, Rectangle } from "./geometry";
import { materialPortGeometry } from "./material-port-geometry";

export type MaterialLinkPath = Readonly<{
  route: ConnectionRoute;
  bounds: Rectangle;
  from: Point;
  link: CanvasMaterialLink;
  to: Point;
}>;

function pathFromPoints(
  link: CanvasMaterialLink,
  from: Point,
  to: Point,
  nodes: readonly CanvasNode[],
): MaterialLinkPath {
  return materialLinkPathForRoute(link, resolveRoute(link, from, to, nodes));
}

function normalized(rectangle: Rectangle): Rectangle {
  return {
    height: Math.abs(rectangle.height),
    width: Math.abs(rectangle.width),
    x: rectangle.width < 0 ? rectangle.x + rectangle.width : rectangle.x,
    y: rectangle.height < 0 ? rectangle.y + rectangle.height : rectangle.y,
  };
}

function intersects(left: Rectangle, right: Rectangle) {
  const a = normalized(left);
  const b = normalized(right);
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

const pathsByDocument = new WeakMap<
  CanvasDocument,
  Map<CanvasMaterialLink, MaterialLinkPath | undefined>
>();

export function materialLinkPath(
  document: CanvasDocument,
  link: CanvasMaterialLink,
): MaterialLinkPath | undefined {
  let paths = pathsByDocument.get(document);
  if (!paths) {
    paths = new Map();
    pathsByDocument.set(document, paths);
  }
  if (paths.has(link)) return paths.get(link);
  const fromNode = document.nodes.find(
    ({ configuration }) => configuration.id === link.from.nodeId,
  );
  const toNode = document.nodes.find(
    ({ configuration }) => configuration.id === link.to.nodeId,
  );
  const from = fromNode
    ? materialPortGeometry(fromNode).find(
        ({ port }) => port.id === link.from.portId,
      )?.point
    : undefined;
  const to = toNode
    ? materialPortGeometry(toNode).find(
        ({ port }) => port.id === link.to.portId,
      )?.point
    : undefined;
  const path =
    from && to ? pathFromPoints(link, from, to, document.nodes) : undefined;
  paths.set(link, path);
  return path;
}

export function materialLinkPoint(path: MaterialLinkPath, t: number): Point {
  const lengths = path.route
    .slice(1)
    .map((point, index) =>
      Math.hypot(
        point.x - path.route![index]!.x,
        point.y - path.route![index]!.y,
      ),
    );
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * t;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    const from = path.route[index]!;
    const to = path.route[index + 1]!;
    if (remaining <= length && length > 0)
      return {
        x: from.x + ((to.x - from.x) * remaining) / length,
        y: from.y + ((to.y - from.y) * remaining) / length,
      };
    remaining -= length;
  }
  return path.to;
}

function pointSegmentDistance(point: Point, from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0)
    return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

export function distanceToMaterialLink(path: MaterialLinkPath, point: Point) {
  return Math.min(
    ...path.route
      .slice(1)
      .map((to, index) => pointSegmentDistance(point, path.route[index]!, to)),
  );
}

export function createMaterialLinkIndex(document: CanvasDocument) {
  let current = document;
  let paths: MaterialLinkPath[] = [];
  const rebuild = () => {
    const points = new Map(
      current.nodes.flatMap((node) =>
        materialPortGeometry(node).map(
          ({ nodeId, point, port }) =>
            [`${nodeId}\u0000${port.id}`, point] as const,
        ),
      ),
    );
    const cached = new Map<CanvasMaterialLink, MaterialLinkPath | undefined>();
    paths = current.materialLinks.flatMap((link) => {
      const from = points.get(`${link.from.nodeId}\u0000${link.from.portId}`);
      const to = points.get(`${link.to.nodeId}\u0000${link.to.portId}`);
      const path =
        from && to ? pathFromPoints(link, from, to, current.nodes) : undefined;
      cached.set(link, path);
      return path ? [path] : [];
    });
    pathsByDocument.set(current, cached);
  };
  rebuild();
  return {
    hitTest(point: Point, radius: number) {
      return paths
        .filter(({ bounds }) =>
          intersects(bounds, {
            height: radius * 2,
            width: radius * 2,
            x: point.x - radius,
            y: point.y - radius,
          }),
        )
        .map((path) => ({
          distance: distanceToMaterialLink(path, point),
          path,
        }))
        .filter(({ distance }) => distance <= radius)
        .toSorted((left, right) => {
          const distance = left.distance - right.distance;
          if (Math.abs(distance) > 1e-7) return distance;
          // At a crossing, clicking a rate label should select its own belt.
          const leftLabel = materialLinkLabelPoint(left.path);
          const rightLabel = materialLinkLabelPoint(right.path);
          return (
            Math.hypot(point.x - leftLabel.x, point.y - leftLabel.y) -
            Math.hypot(point.x - rightLabel.x, point.y - rightLabel.y)
          );
        })[0]?.path.link;
    },
    query(rectangle: Rectangle) {
      return paths.filter(({ bounds }) => intersects(bounds, rectangle));
    },
    replace(next: CanvasDocument) {
      current = next;
      rebuild();
    },
  };
}

const obstaclesByNodes = new WeakMap<
  readonly CanvasNode[],
  ReturnType<typeof buildRouteObstacles>
>();

function buildRouteObstacles(nodes: readonly CanvasNode[]) {
  return nodes.map((node) => ({
    id: node.configuration.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));
}

export function routeObstacles(nodes: readonly CanvasNode[]) {
  let obstacles = obstaclesByNodes.get(nodes);
  if (!obstacles) {
    obstacles = buildRouteObstacles(nodes);
    obstaclesByNodes.set(nodes, obstacles);
  }
  return obstacles;
}

function resolveRoute(
  link: CanvasMaterialLink,
  from: Point,
  to: Point,
  nodes: readonly CanvasNode[],
) {
  const obstacles = routeObstacles(nodes);
  const route = link.route;
  const first = route?.[0];
  const last = route?.at(-1);
  if (
    route &&
    first &&
    last &&
    samePoint(first, from) &&
    samePoint(last, to) &&
    routeIsClear(route, obstacles, link.from.nodeId, link.to.nodeId)
  )
    return route;
  if (route && first && last) {
    const delta = { x: from.x - first.x, y: from.y - first.y };
    if (samePoint({ x: last.x + delta.x, y: last.y + delta.y }, to)) {
      const translated = route.map(({ x, y }) => ({
        x: x + delta.x,
        y: y + delta.y,
      }));
      if (routeIsClear(translated, obstacles, link.from.nodeId, link.to.nodeId))
        return translated;
    }
  }
  const endpoint = (
    point: Point,
    nodeId: string,
    fallback: "left" | "right",
  ): RouteEndpoint => {
    const node = nodes.find(({ configuration }) => configuration.id === nodeId);
    const side = node
      ? Math.abs(point.x - node.x) < 0.01
        ? "left"
        : "right"
      : undefined;
    return { point, nodeId, side: side ?? fallback };
  };
  return routeOrthogonally(
    endpoint(from, link.from.nodeId, "right"),
    endpoint(to, link.to.nodeId, "left"),
    obstacles,
    link.routeMode === "manual" ? route?.slice(1, -1) : undefined,
  );
}

/** Preview geometry uses exactly the same router as completed connections. */
export function connectionPreviewRoute(
  document: CanvasDocument,
  from: RouteEndpoint,
  to: RouteEndpoint,
) {
  const port = (endpoint: RouteEndpoint) => {
    const node = document.nodes.find(
      ({ configuration }) => configuration.id === endpoint.nodeId,
    );
    return node
      ? materialPortGeometry(node).find(({ point }) =>
          samePoint(point, endpoint.point),
        )?.port
      : undefined;
  };
  const fromPort = port(from);
  const toPort = port(to);
  const reverse =
    fromPort?.direction === "input" ||
    toPort?.direction === "output" ||
    (fromPort?.direction === "bidirectional" &&
      toPort?.direction === "bidirectional" &&
      ((to.nodeId ?? "").localeCompare(from.nodeId ?? "") ||
        toPort.id.localeCompare(fromPort.id)) < 0);
  const obstacles = routeObstacles(document.nodes);
  return reverse
    ? routeOrthogonally(to, from, obstacles).toReversed()
    : routeOrthogonally(from, to, obstacles);
}

export function materialLinkPathForRoute(
  link: CanvasMaterialLink,
  route: ConnectionRoute,
): MaterialLinkPath {
  const from = route[0]!;
  const to = route.at(-1)!;
  const xs = route.map(({ x }) => x);
  const ys = route.map(({ y }) => y);
  return {
    link,
    route,
    from,
    to,
    bounds: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    },
  };
}

export function materialLinkLabelPoint(path: MaterialLinkPath): Point {
  if (!path.route) return materialLinkPoint(path, 0.5);
  const segments = path.route
    .slice(1)
    .map((to, index) => ({ from: path.route![index]!, to }));
  const horizontal = segments.filter(
    ({ from, to }) => Math.abs(from.y - to.y) < 0.1,
  );
  const longest = (horizontal.length ? horizontal : segments).toSorted(
    (a, b) =>
      Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) -
      Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y),
  )[0];
  return longest
    ? {
        x: (longest.from.x + longest.to.x) / 2,
        y: (longest.from.y + longest.to.y) / 2,
      }
    : path.from;
}
