import type { Point, Rectangle } from "./geometry";
import type { ConnectionRoute } from "./connection-route";

export type RouteEndpoint = Readonly<{
  point: Point;
  side: "left" | "right";
  nodeId?: string;
}>;
export type RouteObstacle = Rectangle & Readonly<{ id: string }>;
const CLEARANCE = 16;
const PORT_STUB = 32;
const EPSILON = 0.01;

export function samePoint(a: Point, b: Point) {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

export function simplifyRoute(points: ConnectionRoute): ConnectionRoute {
  const result: Point[] = [];
  for (const point of points) {
    if (result.length && samePoint(result.at(-1)!, point)) continue;
    while (result.length >= 2) {
      const a = result.at(-2)!;
      const b = result.at(-1)!;
      if (
        !((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))
      )
        break;
      result.pop();
    }
    result.push(point);
  }
  return result;
}

function contains(rect: Rectangle, point: Point) {
  return (
    point.x > rect.x + EPSILON &&
    point.x < rect.x + rect.width - EPSILON &&
    point.y > rect.y + EPSILON &&
    point.y < rect.y + rect.height - EPSILON
  );
}

function crosses(from: Point, to: Point, rect: Rectangle) {
  if (Math.abs(from.y - to.y) < EPSILON)
    return (
      from.y > rect.y + EPSILON &&
      from.y < rect.y + rect.height - EPSILON &&
      Math.max(from.x, to.x) > rect.x + EPSILON &&
      Math.min(from.x, to.x) < rect.x + rect.width - EPSILON
    );
  if (Math.abs(from.x - to.x) < EPSILON)
    return (
      from.x > rect.x + EPSILON &&
      from.x < rect.x + rect.width - EPSILON &&
      Math.max(from.y, to.y) > rect.y + EPSILON &&
      Math.min(from.y, to.y) < rect.y + rect.height - EPSILON
    );
  return true;
}

export function routeIsClear(
  route: ConnectionRoute,
  obstacles: readonly RouteObstacle[],
  fromId?: string,
  toId?: string,
) {
  return (
    route.length >= 2 &&
    route.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)) &&
    route
      .slice(1)
      .every(
        (to, index) =>
          (Math.abs(route[index]!.x - to.x) < EPSILON ||
            Math.abs(route[index]!.y - to.y) < EPSILON) &&
          obstacles.every(
            (obstacle) =>
              (index === 0 && obstacle.id === fromId) ||
              (index === route.length - 2 && obstacle.id === toId) ||
              !crosses(route[index]!, to, obstacle),
          ),
      )
  );
}

const distance = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// Coordinate-compressed visibility grid. A* prefers short paths with few bends;
// it never changes node positions and only expands the grid cells it needs.
function findPath(
  from: Point,
  to: Point,
  obstacles: readonly Rectangle[],
): ConnectionRoute | undefined {
  const clear = (a: Point, b: Point) =>
    !obstacles.some((rect) => crosses(a, b, rect));
  const candidates = [
    [from, { x: to.x, y: from.y }, to],
    [from, { x: from.x, y: to.y }, to],
    [
      from,
      { x: (from.x + to.x) / 2, y: from.y },
      { x: (from.x + to.x) / 2, y: to.y },
      to,
    ],
  ].map(simplifyRoute);
  const direct = candidates.find((route) =>
    route.slice(1).every((point, index) => clear(route[index]!, point)),
  );
  if (direct) return direct;
  const xs = [
    ...new Set([
      from.x,
      to.x,
      ...obstacles.flatMap((r) => [r.x, r.x + r.width]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      from.y,
      to.y,
      ...obstacles.flatMap((r) => [r.y, r.y + r.height]),
    ]),
  ].sort((a, b) => a - b);
  type Step = {
    x: number;
    y: number;
    axis: number;
    cost: number;
    score: number;
    previous?: Step;
  };
  const heap: Step[] = [];
  const push = (step: Step) => {
    let index = heap.length;
    heap.push(step);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent]!.score <= step.score) break;
      heap[index] = heap[parent]!;
      index = parent;
    }
    heap[index] = step;
  };
  const pop = () => {
    const first = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (
          child + 1 < heap.length &&
          heap[child + 1]!.score < heap[child]!.score
        )
          child++;
        if (last.score <= heap[child]!.score) break;
        heap[index] = heap[child]!;
        index = child;
      }
      heap[index] = last;
    }
    return first;
  };
  const key = (x: number, y: number, axis: number) =>
    (y * xs.length + x) * 3 + axis;
  const best = new Map<number, number>();
  push({
    x: xs.indexOf(from.x),
    y: ys.indexOf(from.y),
    axis: 0,
    cost: 0,
    score: distance(from, to),
  });
  while (heap.length) {
    const step = pop();
    if ((best.get(key(step.x, step.y, step.axis)) ?? Infinity) < step.cost)
      continue;
    const point = { x: xs[step.x]!, y: ys[step.y]! };
    if (samePoint(point, to)) {
      const route: Point[] = [];
      for (
        let cursor: Step | undefined = step;
        cursor;
        cursor = cursor.previous
      )
        route.push({ x: xs[cursor.x]!, y: ys[cursor.y]! });
      return simplifyRoute(route.reverse());
    }
    for (const [dx, dy, axis] of [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 2],
      [0, -1, 2],
    ] as const) {
      const x = step.x + dx;
      const y = step.y + dy;
      if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) continue;
      const next = { x: xs[x]!, y: ys[y]! };
      if (!clear(point, next)) continue;
      const cost =
        step.cost +
        distance(point, next) +
        (step.axis && step.axis !== axis ? 32 : 0);
      const id = key(x, y, axis);
      if (cost >= (best.get(id) ?? Infinity)) continue;
      best.set(id, cost);
      push({
        x,
        y,
        axis,
        cost,
        score: cost + distance(next, to),
        previous: step,
      });
    }
  }
  return undefined;
}

export function routeOrthogonally(
  from: RouteEndpoint,
  to: RouteEndpoint,
  nodes: readonly RouteObstacle[],
  via: ConnectionRoute = [],
): ConnectionRoute {
  if (samePoint(from.point, to.point)) return [from.point, to.point];
  // A free preview endpoint may be over a card before a compatible port is found.
  const obstacles = nodes.filter(
    (node) =>
      !(
        (!to.nodeId && contains(node, to.point)) ||
        (!from.nodeId && contains(node, from.point))
      ),
  );
  const padded = obstacles.map((r) => ({
    x: r.x - CLEARANCE,
    y: r.y - CLEARANCE,
    width: r.width + CLEARANCE * 2,
    height: r.height + CLEARANCE * 2,
  }));
  const departure = {
    x: from.point.x + (from.side === "left" ? -PORT_STUB : PORT_STUB),
    y: from.point.y,
  };
  const arrival = {
    x: to.point.x + (to.side === "left" ? -PORT_STUB : PORT_STUB),
    y: to.point.y,
  };
  const anchors = [
    departure,
    ...via.filter((point) => !padded.some((r) => contains(r, point))),
    arrival,
  ];
  const middle: Point[] = [];
  for (let index = 1; index < anchors.length; index++) {
    const a = anchors[index - 1]!;
    const b = anchors[index]!;
    const section = findPath(a, b, padded) ?? findPath(a, b, obstacles);
    // Overlapping cards can make an unobstructed route impossible. Keep the
    // connection attached and orthogonal until the cards are moved apart.
    middle.push(...(section ?? [a, { x: a.x, y: b.y }, b]));
  }
  return simplifyRoute([from.point, ...middle, to.point]);
}
