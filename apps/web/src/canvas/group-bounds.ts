import type { CanvasNode } from "./document";
import type { Point } from "./geometry";
import { SNAP_INTERVAL } from "./grid";

export const GROUP_PADDING = 48;
export const GROUP_RADIUS = 16;
const floor = (n: number) => Math.floor(n / SNAP_INTERVAL) * SNAP_INTERVAL;
const ceil = (n: number) => Math.ceil(n / SNAP_INTERVAL) * SNAP_INTERVAL;

/** Include internal routes, then round outward so all four borders snap. */
export function groupBounds(
  nodes: readonly CanvasNode[],
  routes: readonly (readonly Point[])[] = [],
) {
  const points = routes.flat();
  const x = floor(
    Math.min(...nodes.map((node) => node.x), ...points.map((p) => p.x)) -
      GROUP_PADDING,
  );
  const y = floor(
    Math.min(...nodes.map((node) => node.y), ...points.map((p) => p.y)) -
      GROUP_PADDING,
  );
  const right = ceil(
    Math.max(
      ...nodes.map((node) => node.x + node.width),
      ...points.map((p) => p.x),
    ) + GROUP_PADDING,
  );
  const bottom = ceil(
    Math.max(
      ...nodes.map((node) => node.y + node.height),
      ...points.map((p) => p.y),
    ) + GROUP_PADDING,
  );
  return { x, y, width: right - x, height: bottom - y };
}
