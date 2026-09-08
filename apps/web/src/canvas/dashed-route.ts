import type { ConnectionRoute } from "./connection-route";
import type { Point } from "./geometry";

/** Rounded dashes for rendering only. Hit testing retains the continuous route. */
export function dashedRoute(route: ConnectionRoute, zoom: number): Point[][] {
  const rounded: Point[] = [route[0]!];
  for (let i = 1; i < route.length - 1; i++) {
    const previous = route[i - 1]!;
    const corner = route[i]!;
    const next = route[i + 1]!;
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (!incoming || !outgoing) continue;
    const radius = Math.min(10, incoming / 2, outgoing / 2);
    const start = {
      x: corner.x + ((previous.x - corner.x) * radius) / incoming,
      y: corner.y + ((previous.y - corner.y) * radius) / incoming,
    };
    const end = {
      x: corner.x + ((next.x - corner.x) * radius) / outgoing,
      y: corner.y + ((next.y - corner.y) * radius) / outgoing,
    };
    rounded.push(start);
    for (let step = 1; step <= 8; step++) {
      const t = step / 8;
      rounded.push({
        x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * corner.x + t * t * end.x,
        y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * corner.y + t * t * end.y,
      });
    }
  }
  rounded.push(route.at(-1)!);
  const dash = 10 / zoom;
  const gap = 6 / zoom;
  let remaining = dash;
  let drawing = true;
  const strokes: Point[][] = [[rounded[0]!]];
  for (let i = 1; i < rounded.length; i++) {
    let from = rounded[i - 1]!;
    const to = rounded[i]!;
    let length = Math.hypot(to.x - from.x, to.y - from.y);
    while (length > 1e-7) {
      const travel = Math.min(remaining, length);
      const point = {
        x: from.x + ((to.x - from.x) * travel) / length,
        y: from.y + ((to.y - from.y) * travel) / length,
      };
      if (drawing) strokes.at(-1)!.push(point);
      remaining -= travel;
      if (remaining < 1e-7) {
        drawing = !drawing;
        remaining = drawing ? dash : gap;
        if (drawing) strokes.push([point]);
      }
      from = point;
      length -= travel;
    }
  }
  return strokes.filter((stroke) => stroke.length > 1);
}
