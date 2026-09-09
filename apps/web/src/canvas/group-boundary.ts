import type { LayoutGroup } from "./layout-routing";
import type { RouteObstacle } from "./orthogonal-router";
import { MIN_LINE_GAP } from "./route-spacing";
import { GROUP_RADIUS } from "./group-bounds";

/** Unrelated boxes are solid; endpoint boxes only open along their straight sides. */
export function groupRouteObstacles(
  groups: readonly LayoutGroup[],
  from: string,
  to: string,
): RouteObstacle[] {
  return groups.flatMap((group) => {
    if (!group.nodeIds.includes(from) && !group.nodeIds.includes(to))
      return [
        {
          ...group,
          id: `group:${group.id}`,
          x: group.x - MIN_LINE_GAP,
          y: group.y - MIN_LINE_GAP,
          width: group.width + 2 * MIN_LINE_GAP,
          height: group.height + 2 * MIN_LINE_GAP,
        },
      ];
    return [
      ...[group.y, group.y + group.height].map((y, i) => ({
        id: `boundary:${group.id}:${i}`,
        x: group.x,
        y: y - GROUP_RADIUS,
        width: group.width,
        height: GROUP_RADIUS * 2,
      })),
      ...[group.x, group.x + group.width].map((x, i) => ({
        id: `side:${group.id}:${i}`,
        x: x - MIN_LINE_GAP,
        y: group.y,
        width: 2 * MIN_LINE_GAP,
        height: group.height,
        blocks: "vertical" as const,
      })),
    ];
  });
}
