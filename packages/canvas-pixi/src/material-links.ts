import {
  intersects,
  linkHandles,
  routeBounds,
  worldToScreen,
} from "@satisfactory-belt/canvas-core";
import type { CanvasSnapshot, Point } from "@satisfactory-belt/canvas-core";
import type { Graphics } from "pixi.js";

import type { CanvasPalette } from "./theme";

function toward(a: Point, b: Point, amount: number): Point {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return length
    ? { x: a.x + ((b.x - a.x) * amount) / length, y: a.y + ((b.y - a.y) * amount) / length }
    : a;
}
export function drawMaterialLinks(
  lines: Graphics,
  handles: Graphics,
  endpointLeads: Graphics,
  snapshot: CanvasSnapshot,
  palette: CanvasPalette,
) {
  lines.clear();
  handles.clear();
  endpointLeads.clear();
  const { camera, viewport, links, linkSelection } = snapshot;
  const preview = snapshot.connectionPreview;
  const rendered = preview ? [...links, { id: null, points: preview }] : links;
  for (const link of rendered) {
    const bounds = routeBounds(link.points),
      position = worldToScreen(bounds, camera);
    if (
      !intersects(
        { ...position, width: bounds.width * camera.zoom, height: bounds.height * camera.zoom },
        { x: -24, y: -24, width: viewport.width + 48, height: viewport.height + 48 },
      )
    )
      continue;
    const points = link.points.map((point) => worldToScreen(point, camera));
    const selected = link.id !== null && linkSelection.selected === link.id;
    const color = selected || link.id === null ? palette.selection : palette.footer;
    lines.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1]!,
        b = points[i]!,
        c = points[i + 1]!;
      const radius = Math.min(
        8 * camera.zoom,
        Math.hypot(b.x - a.x, b.y - a.y) / 2,
        Math.hypot(c.x - b.x, c.y - b.y) / 2,
      );
      const before = toward(b, a, radius),
        after = toward(b, c, radius);
      lines.lineTo(before.x, before.y).quadraticCurveTo(b.x, b.y, after.x, after.y);
    }
    const end = points.at(-1)!;
    lines.lineTo(end.x, end.y).stroke({ color, width: selected ? 3 : 2 });
    // Cards sit above the main link layer. Redraw only the short port leads above
    // cards so every connection visibly reaches its endpoint without covering card
    // content along the rest of the route.
    if (points.length > 1) {
      endpointLeads
        .moveTo(points[0]!.x, points[0]!.y)
        .lineTo(points[1]!.x, points[1]!.y)
        .stroke({ color, width: selected ? 3 : 2 });
      endpointLeads
        .moveTo(points.at(-2)!.x, points.at(-2)!.y)
        .lineTo(end.x, end.y)
        .stroke({ color, width: selected ? 3 : 2 });
    }
    if (!selected || link.id === null) continue;
    for (const handle of linkHandles(link)) {
      const p = worldToScreen(handle, camera);
      handles
        .roundRect(p.x - 6, p.y - 6, 12, 12, 3)
        .fill(palette.card)
        .stroke({ color: palette.selection, width: 1 });
    }
  }
}
