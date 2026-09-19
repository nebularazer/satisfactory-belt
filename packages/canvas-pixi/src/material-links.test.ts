import { CanvasController } from "@satisfactory-belt/canvas-core";
import { Graphics, Text } from "pixi.js";
import { expect, it } from "vitest";

import { drawMaterialLinks } from "./material-links";
import { CANVAS_PALETTES } from "./theme";

const rates = () => ["90"];

it("keeps link text sharp across zoom and display-density changes without compensating its size", () => {
  const controller = new CanvasController({ items: [], onMove: () => {} });
  const lines = new Graphics(),
    handles = new Graphics();
  const labels = new Map<string, Text>();
  const base = {
    ...controller.getSnapshot(),
    viewport: { width: 1600, height: 900 },
    links: [
      {
        id: "ore",
        output: { nodeId: "miner", portKey: "output:ore" },
        input: { nodeId: "smelter", portKey: "input:ore" },
        points: [
          { x: 10, y: 20 },
          { x: 110, y: 20 },
        ],
      },
    ],
  };
  for (const [zoom, density, expectedResolution] of [
    [1, 1, 1],
    [4, 2, 8],
    [3, 2, 8],
    [0.5, 2, 2],
  ]) {
    drawMaterialLinks(
      lines,
      handles,
      { ...base, camera: { x: 0, y: 0, zoom: zoom! } },
      CANVAS_PALETTES.light,
      labels,
      rates,
      density,
    );
    const label = labels.get("ore")!;
    expect(label.resolution).toBe(expectedResolution);
    expect(label.scale.x).toBe(zoom);
    expect(label.style.fontSize).toBe(11);
    expect(label.text).toBe("90");
  }
  expect(handles.children).toHaveLength(1);
  handles.destroy({ children: true });
  lines.destroy();
});
