import { describe, expect, it } from "vitest";

import {
  CANVAS_DOCUMENT_VERSION,
  canvasNodeId,
  type CanvasNode,
} from "./document";
import type { CanvasEditorState } from "./editor";
import { createCanvasLoadFixture } from "./load-fixture";
import { createCanvasSpatialIndex } from "./spatial-index";
import { visibleCanvasNodes } from "./visibility";
import { testCanvasNode } from "./test-fixtures";

const node = (id: string, x: number, y: number): CanvasNode =>
  testCanvasNode(id, x, y, { height: 50, width: 50 });

function state(
  nodes: readonly CanvasNode[],
  options: Partial<CanvasEditorState> = {},
): CanvasEditorState {
  return {
    canRedo: false,
    canUndo: false,
    document: {
      kind: "basic",
      materialLinks: [],
      nodes,
      version: CANVAS_DOCUMENT_VERSION,
    },
    moveDelta: null,
    selectedLinkIds: [],
    selectedIds: [],
    snapToGrid: true,
    ...options,
  };
}

function visible(
  editorState: CanvasEditorState,
  viewport: { x: number; y: number; zoom: number },
  screen: { height: number; width: number },
) {
  const index = createCanvasSpatialIndex(editorState.document);
  return visibleCanvasNodes(editorState, viewport, screen, (rectangle) =>
    index.query(rectangle),
  );
}

describe("canvas visibility", () => {
  it("selects nodes in and just beyond the viewport in document order", () => {
    const nodes = [
      node("visible", 25, 25),
      node("overscan", 200, 25),
      node("far-away", 1_000, 25),
    ];

    expect(
      visible(
        state(nodes),
        { x: 0, y: 0, zoom: 1 },
        { height: 100, width: 100 },
      ).map(canvasNodeId),
    ).toEqual(["visible", "overscan"]);
  });

  it("accounts for pan and zoom when calculating the visible world area", () => {
    const nodes = [node("origin", 0, 0), node("panned-to", 1_000, 1_000)];

    expect(
      visible(
        state(nodes),
        { x: -2_000, y: -2_000, zoom: 2 },
        { height: 100, width: 100 },
      ).map(canvasNodeId),
    ).toEqual(["panned-to"]);
  });

  it("uses transient positions for selected nodes while dragging", () => {
    const moving = node("moving", 1_000, 1_000);

    expect(
      visible(
        state([moving], {
          moveDelta: { x: -1_000, y: -1_000 },
          selectedIds: [canvasNodeId(moving)],
        }),
        { x: 0, y: 0, zoom: 1 },
        { height: 100, width: 100 },
      ).map(canvasNodeId),
    ).toEqual(["moving"]);
  });

  it("keeps a bounded working set for the 10,000-node fixture", () => {
    const fixture = createCanvasLoadFixture(10_000);

    expect(
      visible(
        state(fixture.nodes),
        { x: 640, y: 400, zoom: 1 },
        { height: 800, width: 1_280 },
      ).length,
    ).toBeLessThan(100);
  });
});
