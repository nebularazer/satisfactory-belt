import type { ConnectionRoute } from "./connection-route";
import type { Point } from "./geometry";
import { simplifyRoute } from "./orthogonal-router";

/** Keep short terminal segments anchored at their ports, including straight links. */
export function editableRoute(route: ConnectionRoute): ConnectionRoute {
  const result = [...simplifyRoute(route)];
  if (result.length < 2) return result;
  const stub = (from: Point, to: Point) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const amount = Math.min(32, length / 4);
    return length
      ? {
          x: from.x + ((to.x - from.x) * amount) / length,
          y: from.y + ((to.y - from.y) * amount) / length,
        }
      : from;
  };
  const first = stub(result[0]!, result[1]!);
  const last = stub(result.at(-1)!, result.at(-2)!);
  result.splice(1, 0, first);
  result.splice(result.length - 1, 0, last);
  return result;
}

export function routeHandles(route: ConnectionRoute, zoom = 1) {
  const points = editableRoute(route);
  return points.slice(2, -1).flatMap((to, offset) => {
    const index = offset + 1;
    const from = points[index]!;
    if (Math.hypot(to.x - from.x, to.y - from.y) * zoom < 24) return [];
    return [
      {
        index,
        route: points,
        axis: from.x === to.x ? ("x" as const) : ("y" as const),
        point: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      },
    ];
  });
}

export function moveRouteSegment(
  route: ConnectionRoute,
  index: number,
  at: Point,
): ConnectionRoute {
  if (index < 1 || index >= route.length - 2) return route;
  const a = route[index]!;
  const b = route[index + 1]!;
  const vertical = a.x === b.x;
  const movedA = vertical ? { x: at.x, y: a.y } : { x: a.x, y: at.y };
  const movedB = vertical ? { x: at.x, y: b.y } : { x: b.x, y: at.y };
  const previous = route[index - 1]!;
  const next = route[index + 2]!;
  const prefix = route.slice(0, index);
  const suffix = route.slice(index + 2);
  const needsStartCorner = vertical ? previous.x === a.x : previous.y === a.y;
  const needsEndCorner = vertical ? next.x === b.x : next.y === b.y;
  return simplifyRoute([
    ...prefix,
    ...(needsStartCorner ? [a] : []),
    movedA,
    movedB,
    ...(needsEndCorner ? [b] : []),
    ...suffix,
  ]);
}

export function addRouteBend(
  route: ConnectionRoute,
  segment?: number,
  offset = 64,
): ConnectionRoute {
  const points = editableRoute(route);
  const handles = routeHandles(route, 1);
  const handle =
    segment === undefined
      ? handles.toSorted((a, b) => {
          const length = (index: number) =>
            Math.hypot(
              points[index + 1]!.x - points[index]!.x,
              points[index + 1]!.y - points[index]!.y,
            );
          return length(b.index) - length(a.index);
        })[0]
      : handles.find(({ index }) => index === segment);
  if (!handle) return route;
  const index = handle.index;
  const a = points[index]!;
  const b = points[index + 1]!;
  const one = { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
  const two = {
    x: a.x + ((b.x - a.x) * 2) / 3,
    y: a.y + ((b.y - a.y) * 2) / 3,
  };
  const shift = (point: Point) =>
    handle.axis === "x"
      ? { x: point.x + offset, y: point.y }
      : { x: point.x, y: point.y + offset };
  return simplifyRoute([
    ...points.slice(0, index + 1),
    one,
    shift(one),
    shift(two),
    two,
    ...points.slice(index + 1),
  ]);
}
