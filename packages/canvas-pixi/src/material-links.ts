import {
  intersects,
  linkHandles,
  routeBounds,
  worldToScreen,
} from "@satisfactory-belt/canvas-core";
import type { CanvasSnapshot, Point } from "@satisfactory-belt/canvas-core";
import { Graphics, Text } from "pixi.js";

import type { CanvasPalette } from "./theme";

function toward(a: Point, b: Point, amount: number): Point {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return length
    ? { x: a.x + ((b.x - a.x) * amount) / length, y: a.y + ((b.y - a.y) * amount) / length }
    : a;
}
function pathMidpoint(points: readonly Point[]): Point {
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  const halfway = lengths.reduce((sum, length) => sum + length, 0) / 2;
  let travelled = 0;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (travelled + length >= halfway) {
      const start = points[index]!,
        end = points[index + 1]!;
      const amount = length ? (halfway - travelled) / length : 0;
      return {
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
      };
    }
    travelled += length;
  }
  return points.at(-1)!;
}
export function drawMaterialLinks(
  lines: Graphics,
  handles: Graphics,
  snapshot: CanvasSnapshot,
  palette: CanvasPalette,
  labels: Map<string, Text>,
  getLinkRates?: (id: string) => readonly string[],
  resolution = 1,
) {
  lines.clear();
  handles.clear();
  const live = new Set(snapshot.links.map((link) => link.id));
  for (const [id, label] of labels) {
    if (!live.has(id)) {
      label.destroy();
      labels.delete(id);
    } else label.visible = false;
  }
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
    if (link.id !== null && getLinkRates) {
      const rates = getLinkRates(link.id);
      if (rates.length) {
        let label = labels.get(link.id);
        if (!label) {
          label = new Text({
            anchor: 0.5,
            eventMode: "none",
            style: {
              fontFamily: "Inter Variable, sans-serif",
              fontSize: 11,
              fontWeight: "500",
              align: "center",
            },
          });
          labels.set(link.id, label);
          handles.addChild(label);
        }
        label.visible = true;
        const text = rates.join("\n");
        if (label.text !== text) label.text = text;
        if (label.style.fill !== palette.title) {
          label.style.fill = palette.title;
          label.style.stroke = { color: palette.card, width: 5 };
        }
        label.style.fontSize = "labelFontSize" in link ? (link.labelFontSize ?? 11) : 11;
        const midpoint =
          "labelPosition" in link && link.labelPosition
            ? worldToScreen(link.labelPosition, camera)
            : pathMidpoint(points);
        label.position.set(midpoint.x, midpoint.y);
        // Link graphics live in screen space; labels retain their canvas-space size.
        label.scale.set(camera.zoom);
        const textResolution = resolution * Math.max(1, 2 ** Math.ceil(Math.log2(camera.zoom)));
        if (label.resolution !== textResolution) label.resolution = textResolution;
      }
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
