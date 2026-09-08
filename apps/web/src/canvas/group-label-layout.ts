import type { Point } from "./geometry";
import { productionRegions } from "./production-regions";
import type { CanvasDocument } from "./document";

type Region = ReturnType<typeof productionRegions>[number];

/** Same header area at every zoom; long labels never spill into a neighbor. */
export function groupLabelLayout(
  region: Pick<Region, "name" | "count" | "width">,
  zoom: number,
  measure: (text: string, fontSize: number) => number,
) {
  const fontSize = Math.max(18, Math.min(40, 12 / zoom));
  const width = Math.max(0, region.width - 40);
  const lineHeight = fontSize * 1.1;
  const maxLines = Math.max(1, Math.floor(44 / lineHeight));
  const visible = fontSize * zoom >= 6 && width * zoom >= 32;
  const words = `${region.name} · ${region.count}`.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  while (words.length) {
    const word = words.shift()!;
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, fontSize) <= width) {
      line = candidate;
      continue;
    }
    if (line && lines.length + 1 < maxLines) {
      lines.push(line);
      line = "";
      words.unshift(word);
      continue;
    }
    let truncated = candidate;
    while (truncated && measure(`${truncated}…`, fontSize) > width)
      truncated = truncated.slice(0, -1);
    lines.push(truncated ? `${truncated.trimEnd()}…` : "");
    return { text: lines.join("\n"), fontSize, lineHeight, visible };
  }
  if (line) lines.push(line);
  return { text: lines.join("\n"), fontSize, lineHeight, visible };
}

export function hitProductionGroup(document: CanvasDocument, point: Point) {
  return productionRegions(document).find(
    (region) =>
      point.x >= region.x &&
      point.x <= region.x + region.width &&
      point.y >= region.y &&
      point.y < region.y + 56,
  );
}
