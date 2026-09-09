import type { Point } from "./geometry";
import { GRID_INTERVAL, SNAP_INTERVAL } from "./grid";
import { simplifyRoute } from "./orthogonal-router";

export const MIN_LINE_GAP = SNAP_INTERVAL;
export const PREFERRED_LINE_GAP = GRID_INTERVAL;
export const snapLane = (value: number) =>
  Math.round(value / SNAP_INTERVAL) * SNAP_INTERVAL;
export const ceilLane = (value: number) =>
  Math.ceil(value / SNAP_INTERVAL) * SNAP_INTERVAL;

/** Only short departures/arrivals are exempt from parallel-run spacing. */
export function runSegment(route: readonly Point[], index: number) {
  let a = route[index - 1]!,
    b = route[index]!;
  const horizontal = a.y === b.y;
  const axis = horizontal ? "x" : "y";
  const sign = Math.sign(b[axis] - a[axis]);
  if (index === 1)
    a = {
      ...a,
      [axis]:
        a[axis] +
        sign * Math.min(PREFERRED_LINE_GAP, Math.abs(b[axis] - a[axis])),
    };
  if (index === route.length - 1)
    b = {
      ...b,
      [axis]:
        b[axis] -
        sign * Math.min(PREFERRED_LINE_GAP, Math.abs(b[axis] - a[axis])),
    };
  return { a, b, horizontal };
}

export function parallelGap(a: Point, b: Point, c: Point, d: Point) {
  const horizontal = a.y === b.y;
  if (horizontal !== (c.y === d.y)) return { gap: Infinity, length: 0 };
  const axis = horizontal ? "x" : "y";
  return {
    gap: Math.abs(horizontal ? a.y - c.y : a.x - c.x),
    length: Math.max(
      0,
      Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) -
        Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis])),
    ),
  };
}

export function snapRoute(
  route: readonly Point[],
  from: Point,
  to: Point,
): readonly Point[] {
  if (route.length <= 2) {
    const x = snapLane((from.x + to.x) / 2);
    return simplifyRoute([from, { x, y: from.y }, { x, y: to.y }, to]);
  }
  const points = route.map((p) => ({ x: snapLane(p.x), y: snapLane(p.y) }));
  points[0] = from;
  points[points.length - 1] = to;
  points[1] = { ...points[1]!, y: from.y };
  points[points.length - 2] = { ...points.at(-2)!, y: to.y };
  return simplifyRoute(points);
}

/** Move one orthogonal lane, retaining short horizontal stubs at fixed ports. */
export function moveRouteLane(
  route: readonly Point[],
  index: number,
  lane: number,
): readonly Point[] {
  const a = route[index - 1]!,
    b = route[index]!;
  const axis = a.y === b.y ? "y" : "x";
  const start = index === 1,
    end = index === route.length - 1;
  const sign = Math.sign(b.x - a.x);
  const left = start ? { x: a.x + sign * PREFERRED_LINE_GAP, y: a.y } : a;
  const right = end ? { x: b.x - sign * PREFERRED_LINE_GAP, y: b.y } : b;
  return simplifyRoute([
    ...route.slice(0, index - 1),
    ...(start ? [a, left] : []),
    { ...left, [axis]: lane },
    { ...right, [axis]: lane },
    ...(end ? [right, b] : []),
    ...route.slice(index + 1),
  ]);
}
