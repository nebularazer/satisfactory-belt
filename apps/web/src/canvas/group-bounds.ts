import type { CanvasNode } from "./document";
import type { Point } from "./geometry";

export const GROUP_PADDING = 56;

/** Internal connections belong to the group; external feeds do not. */
export function groupBounds(
  nodes: readonly CanvasNode[],
  routes: readonly (readonly Point[])[] = [],
) {
  const points = routes.flat();
  const x =
    Math.min(...nodes.map((node) => node.x), ...points.map((p) => p.x)) -
    GROUP_PADDING;
  const y =
    Math.min(...nodes.map((node) => node.y), ...points.map((p) => p.y)) -
    GROUP_PADDING;
  return {
    x,
    y,
    width:
      Math.max(
        ...nodes.map((node) => node.x + node.width),
        ...points.map((p) => p.x),
      ) -
      x +
      GROUP_PADDING,
    height:
      Math.max(
        ...nodes.map((node) => node.y + node.height),
        ...points.map((p) => p.y),
      ) -
      y +
      GROUP_PADDING,
  };
}
