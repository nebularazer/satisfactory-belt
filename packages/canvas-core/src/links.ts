import { intersects, screenToWorld } from "./geometry";
import type { Bounds, Camera, Point } from "./geometry";
import type { PortReference } from "./ports";

/** A vertical (x) or horizontal (y) line deliberately positioned by the user. */
export type RouteGuide = Readonly<{ axis: "x" | "y"; position: number }>;
export type CanvasLink = Readonly<{
  id: string;
  output: PortReference;
  input: PortReference;
  points: readonly Point[];
  guides?: readonly RouteGuide[];
}>;
export type LinkHit = Readonly<{ id: string; segment: number }>;
export type LinkSelection = Readonly<{
  selected: string | null;
  preview: Readonly<{ id: string; guides: readonly RouteGuide[] }> | null;
}>;
export const emptyLinkSelection = (): LinkSelection => ({
  selected: null,
  preview: null,
});
const STUB = 24;

export function routeBounds(points: readonly Point[]): Bounds {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
function clean(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const p of points) {
    const b = result.at(-1),
      a = result.at(-2);
    if (b && p.x === b.x && p.y === b.y) continue;
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) {
      // Only simplify forward travel: a reversal may be an endpoint stub.
      if ((b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) >= 0) result.pop();
    }
    result.push(p);
  }
  return result;
}
/** Curved orthogonal routing with fixed endpoint stubs. Obstacle routing is deferred to ELK. */
export function routeLink(
  source: Point,
  target: Point,
  _obstacles: readonly Bounds[] = [],
  guides?: readonly RouteGuide[],
): readonly Point[] {
  const stub =
    source.y === target.y && source.x < target.x ? Math.min(STUB, (target.x - source.x) / 3) : STUB;
  const start = { x: source.x + stub, y: source.y },
    end = { x: target.x - stub, y: target.y };
  if (guides?.length) {
    const lines: RouteGuide[] = [
      { axis: "y", position: source.y },
      { axis: "x", position: start.x },
    ];
    for (const guide of guides) {
      const last = lines.at(-1)!;
      if (last.axis === guide.axis) {
        // Join parallel constraints with an orthogonal segment near the endpoint.
        lines.push({
          axis: guide.axis === "x" ? "y" : "x",
          position: guide.axis === "x" ? source.y - (guide.position < start.x ? STUB : 0) : start.x,
        });
      }
      lines.push(guide);
    }
    if (lines.at(-1)!.axis === "x")
      lines.push({ axis: "y", position: target.y - (lines.at(-1)!.position > end.x ? STUB : 0) });
    lines.push({ axis: "x", position: end.x }, { axis: "y", position: target.y });
    const points: Point[] = [source];
    for (let i = 1; i < lines.length; i++) {
      const a = lines[i - 1]!,
        b = lines[i]!;
      points.push({
        x: a.axis === "x" ? a.position : b.position,
        y: a.axis === "y" ? a.position : b.position,
      });
    }
    points.push(target);
    // Keep the port stubs separate from the editable interior, even when collinear.
    return [source, ...clean(points.slice(1, -1)), target];
  }
  const middle = (start.x + end.x) / 2;
  const fallback =
    start.x <= end.x
      ? [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end]
      : [
          start,
          { x: start.x, y: Math.min(source.y, target.y) - STUB * 2 },
          { x: end.x, y: Math.min(source.y, target.y) - STUB * 2 },
          end,
        ];
  return [source, ...clean(fallback), target];
}

export function segmentGuides(
  points: readonly Point[],
  segment: number,
  position: number,
): readonly RouteGuide[] {
  return points.slice(1, -2).map((a, index) => {
    const b = points[index + 2]!;
    const axis = a.x === b.x ? "x" : "y";
    return { axis, position: index + 1 === segment ? position : a[axis] };
  });
}
export function translateGuides(guides: readonly RouteGuide[] | undefined, offset: Point) {
  return guides?.map((guide) => ({ ...guide, position: guide.position + offset[guide.axis] }));
}
export function linkHandles(link: CanvasLink) {
  return link.points.slice(1, -2).map((a, index) => {
    const b = link.points[index + 2]!;
    return {
      id: link.id,
      segment: index + 1,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      axis: a.x === b.x ? ("x" as const) : ("y" as const),
    };
  });
}
export function hitTestLinks(
  screen: Point,
  touch: boolean,
  camera: Camera,
  links: readonly CanvasLink[],
  selected: string | null,
  handlesOnly = false,
): readonly LinkHit[] {
  const point = screenToWorld(screen, camera),
    radius = (touch ? 22 : 8) / camera.zoom;
  let nearest: LinkHit | undefined;
  let nearestDistance = Infinity;
  const consider = (hit: LinkHit, distance: number) => {
    // Keep the selected link on exact ties, otherwise prefer the topmost line.
    if (
      distance < nearestDistance ||
      (distance === nearestDistance && hit.id !== nearest?.id && nearest?.id !== selected)
    ) {
      nearest = hit;
      nearestDistance = distance;
    }
  };
  for (const link of links) {
    if (handlesOnly) {
      if (link.id !== selected) continue;
      for (const handle of linkHandles(link)) {
        const dx = point.x - handle.x,
          dy = point.y - handle.y;
        if (Math.abs(dx) <= radius && Math.abs(dy) <= radius)
          consider({ id: link.id, segment: handle.segment }, dx * dx + dy * dy);
      }
      continue;
    }
    if (
      !intersects(routeBounds(link.points), {
        x: point.x - radius,
        y: point.y - radius,
        width: radius * 2,
        height: radius * 2,
      })
    )
      continue;
    for (let i = 0; i < link.points.length - 1; i++) {
      const a = link.points[i]!,
        b = link.points[i + 1]!;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared
        ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
        : 0;
      const distance = (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
      if (distance <= radius * radius) consider({ id: link.id, segment: i }, distance);
    }
  }
  return nearest ? [nearest] : [];
}
