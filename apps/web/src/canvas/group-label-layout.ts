import type { Point, Rectangle } from "./geometry";
import { productionRegions } from "./production-regions";
import type { CanvasDocument } from "./document";

export function groupInspectIcon(region: Pick<Rectangle, "x" | "y">) {
  return { x: region.x + 16, y: region.y + 16, width: 24, height: 24 };
}
export function hitProductionGroup(
  document: CanvasDocument,
  point: Point,
  topology: "aggregate" | "physical" = "physical",
  zoom = 1,
) {
  return productionRegions(document, topology).find((region) => {
    const icon = groupInspectIcon(region);
    const radius = Math.max(16, 12 / zoom);
    return (
      Math.abs(point.x - icon.x - icon.width / 2) <= radius &&
      Math.abs(point.y - icon.y - icon.height / 2) <= radius
    );
  });
}
