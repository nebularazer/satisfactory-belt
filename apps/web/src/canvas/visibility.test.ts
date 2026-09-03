import { describe, expect, it } from "vitest";

import type { CanvasEditorState, CanvasNode } from "./editor";
import { createCanvasLoadFixture } from "./load-fixture";
import { visibleCanvasNodes } from "./visibility";

const node = (id: string, x: number, y: number): CanvasNode => ({
  height: 50,
  id,
  label: id,
  width: 50,
  x,
  y,
});

function state(
  nodes: readonly CanvasNode[],
  options: Partial<CanvasEditorState> = {},
): CanvasEditorState {
  return {
    canRedo: false,
    canUndo: false,
    document: { nodes, version: 1 },
    moveDelta: null,
    selectedIds: [],
    snapToGrid: true,
    ...options,
  };
}

describe("canvas visibility", () => {
  it("selects nodes in and just beyond the viewport in document order", () => {
    const nodes = [
      node("visible", 25, 25),
      node("overscan", 200, 25),
      node("far-away", 1_000, 25),
    ];

    expect(
      visibleCanvasNodes(
        state(nodes),
        { x: 0, y: 0, zoom: 1 },
        { height: 100, width: 100 },
      ).map(({ id }) => id),
    ).toEqual(["visible", "overscan"]);
  });

  it("accounts for pan and zoom when calculating the visible world area", () => {
    const nodes = [node("origin", 0, 0), node("panned-to", 1_000, 1_000)];

    expect(
      visibleCanvasNodes(
        state(nodes),
        { x: -2_000, y: -2_000, zoom: 2 },
        { height: 100, width: 100 },
      ).map(({ id }) => id),
    ).toEqual(["panned-to"]);
  });

  it("uses transient positions for selected nodes while dragging", () => {
    const moving = node("moving", 1_000, 1_000);

    expect(
      visibleCanvasNodes(
        state([moving], {
          moveDelta: { x: -1_000, y: -1_000 },
          selectedIds: [moving.id],
        }),
        { x: 0, y: 0, zoom: 1 },
        { height: 100, width: 100 },
      ).map(({ id }) => id),
    ).toEqual(["moving"]);
  });

  it("keeps a bounded working set for the 10,000-node fixture", () => {
    const fixture = createCanvasLoadFixture(10_000);

    expect(
      visibleCanvasNodes(
        state(fixture.nodes),
        { x: 640, y: 400, zoom: 1 },
        { height: 800, width: 1_280 },
      ).length,
    ).toBeLessThan(100);
  });
});
