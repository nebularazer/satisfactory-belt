import { describe, expect, it } from "vitest";

import {
  CANVAS_DOCUMENT_VERSION,
  canvasNodeId,
  type CanvasDocument,
  type CanvasNode,
} from "./document";
import { createCanvasSpatialIndex } from "./spatial-index";
import { testCanvasNode } from "./test-fixtures";

const node = (id: string, x: number, y: number): CanvasNode =>
  testCanvasNode(id, x, y, { height: 100, width: 100 });

const document = (nodes: readonly CanvasNode[]): CanvasDocument => ({
  kind: "basic",
  materialLinks: [],
  nodes,
  version: CANVAS_DOCUMENT_VERSION,
});

describe("canvas spatial index", () => {
  it("queries intersecting nodes in document order", () => {
    const first = node("first", -50, -50);
    const second = node("second", 500, 500);
    const index = createCanvasSpatialIndex(document([first, second]));

    expect(
      index.query({ height: 600, width: 600, x: 0, y: 0 }).map(canvasNodeId),
    ).toEqual(["first", "second"]);
  });

  it("returns the topmost overlapping node", () => {
    const lower = node("lower", 0, 0);
    const upper = node("upper", 0, 0);
    const index = createCanvasSpatialIndex(document([lower, upper]));

    expect(canvasNodeId(index.hitTest({ x: 50, y: 50 })!)).toBe("upper");
  });

  it("updates changed nodes without rebuilding unchanged buckets", () => {
    const moving = node("moving", 0, 0);
    const unchanged = node("unchanged", 1_000, 1_000);
    const moved = { ...moving, x: 700 };
    const nextDocument = document([moved, unchanged]);
    const index = createCanvasSpatialIndex(document([moving, unchanged]));

    index.apply(nextDocument, [moving], [moved]);

    expect(index.hitTest({ x: 50, y: 50 })).toBeUndefined();
    expect(canvasNodeId(index.hitTest({ x: 750, y: 50 })!)).toBe("moving");
    expect(index.get("unchanged")).toBe(unchanged);
  });
});
