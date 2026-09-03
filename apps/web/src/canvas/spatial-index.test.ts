import { describe, expect, it } from "vitest";

import type { CanvasDocument, CanvasNode } from "./editor";
import { createCanvasSpatialIndex } from "./spatial-index";

const node = (id: string, x: number, y: number): CanvasNode => ({
  height: 100,
  id,
  label: id,
  width: 100,
  x,
  y,
});

const document = (nodes: readonly CanvasNode[]): CanvasDocument => ({
  nodes,
  version: 1,
});

describe("canvas spatial index", () => {
  it("queries intersecting nodes in document order", () => {
    const first = node("first", -50, -50);
    const second = node("second", 500, 500);
    const index = createCanvasSpatialIndex(document([first, second]));

    expect(
      index.query({ height: 600, width: 600, x: 0, y: 0 }).map(({ id }) => id),
    ).toEqual(["first", "second"]);
  });

  it("returns the topmost overlapping node", () => {
    const lower = node("lower", 0, 0);
    const upper = node("upper", 0, 0);
    const index = createCanvasSpatialIndex(document([lower, upper]));

    expect(index.hitTest({ x: 50, y: 50 })?.id).toBe("upper");
  });

  it("updates changed nodes without rebuilding unchanged buckets", () => {
    const moving = node("moving", 0, 0);
    const unchanged = node("unchanged", 1_000, 1_000);
    const moved = { ...moving, x: 700 };
    const nextDocument = document([moved, unchanged]);
    const index = createCanvasSpatialIndex(document([moving, unchanged]));

    index.apply(nextDocument, [moving], [moved]);

    expect(index.hitTest({ x: 50, y: 50 })).toBeUndefined();
    expect(index.hitTest({ x: 750, y: 50 })?.id).toBe("moving");
    expect(index.get("unchanged")).toBe(unchanged);
  });
});
