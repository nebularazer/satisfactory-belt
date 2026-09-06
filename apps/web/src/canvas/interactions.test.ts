import { afterEach, describe, expect, it } from "vitest";

import { createCanvasEditor } from "./editor";
import {
  attachCanvasInteractions,
  type CanvasInteractionHost,
} from "./interactions";
import { panViewport, zoomViewportAt, type Viewport } from "./viewport";
import type { Point } from "./geometry";
import { TEST_NODE_TEMPLATE } from "./test-fixtures";

type PointerOptions = MouseEventInit & {
  pointerId?: number;
  pointerType?: string;
};

const destroyers: Array<() => void> = [];

afterEach(() => {
  for (const destroy of destroyers.splice(0)) destroy();
});

function createHarness(
  options: {
    snapToGrid?: boolean;
    viewport?: Viewport;
  } = {},
) {
  let id = 0;
  let viewport = options.viewport ?? { x: 0, y: 0, zoom: 1 };
  const capturedPointers = new Set<number>();
  const editor = createCanvasEditor({
    idFactory: () => `node-${++id}`,
    snapToGrid: options.snapToGrid,
  });
  const canvas = document.createElement("canvas");
  const fits: Array<"all" | "selection"> = [];
  const marquees: Array<Parameters<CanvasInteractionHost["setMarquee"]>[0]> =
    [];
  const nodeRequests: Point[] = [];
  const zooms: Array<{ anchor: Point; factor: number }> = [];

  canvas.tabIndex = 0;
  document.body.appendChild(canvas);
  Object.defineProperties(canvas, {
    getBoundingClientRect: {
      value: () => ({
        bottom: 800,
        height: 800,
        left: 0,
        right: 1000,
        top: 0,
        width: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    },
    hasPointerCapture: {
      value: (pointerId: number) => capturedPointers.has(pointerId),
    },
    releasePointerCapture: {
      value: (pointerId: number) => {
        capturedPointers.delete(pointerId);
      },
    },
    setPointerCapture: {
      value: (pointerId: number) => {
        capturedPointers.add(pointerId);
      },
    },
  });

  const host: CanvasInteractionHost = {
    fit: (scope) => fits.push(scope),
    getViewport: () => viewport,
    getViewportCenter: () => ({ x: 500, y: 400 }),
    panBy: (delta) => {
      viewport = panViewport(viewport, delta);
    },
    requestNode: (at) => nodeRequests.push(at),
    resetView: () => {
      viewport = { x: 500, y: 400, zoom: 1 };
    },
    setMarquee: (rectangle) => marquees.push(rectangle),
    zoomAt: (factor, anchor) => {
      zooms.push({ anchor, factor });
      viewport = zoomViewportAt(viewport, viewport.zoom * factor, anchor);
    },
  };
  const detach = attachCanvasInteractions(canvas, editor, host);
  destroyers.push(() => {
    detach();
    canvas.remove();
  });

  const pointer = (
    type: "pointercancel" | "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    pointerOptions: PointerOptions = {},
  ) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      cancelable: true,
      clientX: x,
      clientY: y,
      ...pointerOptions,
    });
    Object.defineProperty(event, "pointerId", {
      value: pointerOptions.pointerId ?? 1,
    });
    Object.defineProperty(event, "pointerType", {
      value: pointerOptions.pointerType ?? "mouse",
    });
    canvas.dispatchEvent(event);
  };

  const key = (value: string, init: KeyboardEventInit = {}) => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: value,
        ...init,
      }),
    );
  };

  return {
    canvas,
    editor,
    fits,
    key,
    marquees,
    nodeRequests,
    pointer,
    viewport: () => viewport,
    zooms,
  };
}

describe("canvas interactions", () => {
  it("creates a Material Link by dragging between ports", () => {
    const { editor, pointer } = createHarness();
    editor.dispatch({
      type: "node.create",
      at: { x: 100, y: 100 },
      node: {
        buildableId: "Build_MinerMk1_C",
        kind: "process",
        processId: "extraction:Desc_OreIron_C",
      },
    });
    editor.dispatch({
      type: "node.create",
      at: { x: 500, y: 100 },
      node: {
        buildableId: "Build_SmelterMk1_C",
        kind: "process",
        processId: "Recipe_IngotIron_C",
      },
    });

    pointer("pointerdown", 224, 96);
    pointer("pointermove", 368, 96);
    pointer("pointerup", 368, 96);

    expect(editor.getState().document.materialLinks).toEqual([
      expect.objectContaining({
        from: { nodeId: "node-1", portId: "output:Desc_OreIron_C" },
        to: { nodeId: "node-2", portId: "input:Desc_OreIron_C" },
      }),
    ]);
  });

  it("cancels a Material Link preview without changing history", () => {
    const { editor, key, pointer } = createHarness();
    editor.dispatch({
      type: "node.create",
      at: { x: 100, y: 100 },
      node: {
        buildableId: "Build_MinerMk1_C",
        kind: "process",
        processId: "extraction:Desc_OreIron_C",
      },
    });
    pointer("pointerdown", 224, 96);
    pointer("pointermove", 300, 200);
    key("Escape");
    expect(editor.getState().connectionPreview).toBeUndefined();
    expect(editor.getState().document.materialLinks).toEqual([]);
  });

  it("selects with primary click and toggles with Ctrl/Cmd-click", () => {
    const { editor, pointer } = createHarness();
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 400, y: 300 },
    });
    editor.dispatch({ type: "selection.clear" });

    pointer("pointerdown", 20, 80);
    pointer("pointerup", 20, 80);
    expect(editor.getState().selectedIds).toEqual(["node-1"]);

    pointer("pointerdown", 340, 280, { ctrlKey: true });
    pointer("pointerup", 340, 280, { ctrlKey: true });
    expect(editor.getState().selectedIds).toEqual(["node-1", "node-2"]);

    pointer("pointerdown", 20, 80, { metaKey: true });
    pointer("pointerup", 20, 80, { metaKey: true });
    expect(editor.getState().selectedIds).toEqual(["node-2"]);
  });

  it("pans on an empty-space drag and clears selection on an empty click", () => {
    const { editor, pointer, viewport } = createHarness();
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });

    pointer("pointerdown", 500, 500);
    pointer("pointermove", 550, 530);
    pointer("pointerup", 550, 530);

    expect(viewport()).toEqual({ x: 50, y: 30, zoom: 1 });
    expect(editor.getState().selectedIds).toEqual(["node-1"]);

    pointer("pointerdown", 800, 700);
    pointer("pointerup", 800, 700);
    expect(editor.getState().selectedIds).toEqual([]);
  });

  it("pans over an unselected node without selecting it", () => {
    const { editor, pointer, viewport } = createHarness({ snapToGrid: false });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 400, y: 300 },
    });
    const original = editor.getState().document;

    pointer("pointerdown", 20, 80);
    pointer("pointermove", 50, 100);
    pointer("pointerup", 50, 100);

    expect(viewport()).toEqual({ x: 30, y: 20, zoom: 1 });
    expect(editor.getState().selectedIds).toEqual(["node-2"]);
    expect(editor.getState().document).toEqual(original);
  });

  it("does not turn small pointer movement into a drag", () => {
    const { editor, pointer, viewport } = createHarness({ snapToGrid: false });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    const original = editor.getState().document.nodes[0];

    pointer("pointerdown", 30, 70);
    pointer("pointermove", 32, 72);
    pointer("pointerup", 32, 72);
    expect(editor.getState().document.nodes[0]).toEqual(original);

    pointer("pointerdown", 500, 500);
    pointer("pointermove", 502, 502);
    pointer("pointerup", 502, 502);
    expect(viewport()).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("moves a node by the pointer delta without jumping to the pointer", () => {
    const { editor, pointer } = createHarness({
      snapToGrid: false,
      viewport: { x: 100, y: 50, zoom: 2 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });

    pointer("pointerdown", 160, 190);
    pointer("pointermove", 200, 250);
    pointer("pointerup", 200, 250);

    expect(editor.getState().document.nodes[0]).toMatchObject({ x: 24, y: 42 });
  });

  it("applies snapping in world coordinates at a transformed zoom", () => {
    const { editor, pointer } = createHarness({
      viewport: { x: 100, y: 50, zoom: 2 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });

    pointer("pointerdown", 140, 210);
    pointer("pointermove", 230, 230);
    pointer("pointerup", 230, 230);

    expect(editor.getState().document.nodes[0]).toMatchObject({ x: 48, y: 32 });
  });

  it("selects through a Ctrl/Cmd-drag marquee in world coordinates", () => {
    const { editor, marquees, pointer } = createHarness({
      viewport: { x: 100, y: 50, zoom: 2 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 400, y: 300 },
    });
    editor.dispatch({ type: "selection.clear" });

    pointer("pointerdown", 80, 150, { ctrlKey: true });
    pointer("pointermove", 500, 390, { ctrlKey: true });
    pointer("pointerup", 500, 390, { ctrlKey: true });

    expect(editor.getState().selectedIds).toEqual(["node-1"]);
    expect(marquees).toEqual([
      { x: 80, y: 150, width: 420, height: 240 },
      undefined,
    ]);
  });

  it("adds a Ctrl/Cmd marquee to the existing selection", () => {
    const { editor, pointer } = createHarness();
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 400, y: 300 },
    });
    editor.dispatch({ type: "selection.node", additive: false, id: "node-2" });

    pointer("pointerdown", 0, 50, { ctrlKey: true });
    pointer("pointermove", 200, 180, { ctrlKey: true });
    pointer("pointerup", 200, 180, { ctrlKey: true });

    expect(editor.getState().selectedIds).toEqual(["node-2", "node-1"]);
  });

  it("opens the node picker at the pointer's transformed world position", () => {
    const { key, nodeRequests, pointer } = createHarness({
      viewport: { x: 100, y: 50, zoom: 2 },
    });

    pointer("pointermove", 300, 250, { buttons: 0 });
    key("n");

    expect(nodeRequests).toEqual([{ x: 100, y: 100 }]);
  });

  it("fits all nodes when empty space is double-clicked", () => {
    const { canvas, fits } = createHarness();
    canvas.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 500,
        clientY: 500,
      }),
    );

    expect(fits).toEqual(["all"]);
  });

  it("cancels an active move with Escape", () => {
    const { editor, key, pointer } = createHarness({ snapToGrid: false });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    const original = editor.getState().document.nodes[0];

    pointer("pointerdown", 30, 70);
    pointer("pointermove", 60, 100);
    expect(editor.getState().document.nodes[0]).toEqual(original);
    expect(editor.getState().moveDelta).toEqual({ x: 30, y: 30 });

    key("Escape");
    expect(editor.getState().document.nodes[0]).toEqual(original);
    expect(editor.getState().moveDelta).toBeNull();
    expect(editor.getState().selectedIds).toEqual(["node-1"]);

    key("Escape");
    expect(editor.getState().selectedIds).toEqual([]);
  });

  it("zooms around the wheel pointer and maps view shortcuts", () => {
    const { canvas, editor, fits, key, viewport, zooms } = createHarness();
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 250,
        clientY: 300,
        deltaY: -100,
      }),
    );

    expect(zooms[0]).toMatchObject({ anchor: { x: 250, y: 300 } });
    expect(zooms[0]?.factor).toBeGreaterThan(1);

    key("+");
    expect(zooms[1]).toEqual({ anchor: { x: 500, y: 400 }, factor: 1.2 });

    key("0");
    expect(viewport()).toEqual({ x: 500, y: 400, zoom: 1 });

    key("1");
    key("2");
    expect(fits).toEqual(["all", "selection"]);

    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    key("ArrowRight");
    expect(editor.getState().document.nodes[0]?.x).toBe(16);
    key("ArrowRight", { shiftKey: true });
    expect(editor.getState().document.nodes[0]?.x).toBe(48);
  });

  it("supports two-pointer pan and pinch gestures", () => {
    const { pointer, zooms } = createHarness();

    pointer("pointerdown", 100, 100, { pointerId: 1, pointerType: "touch" });
    pointer("pointerdown", 200, 100, { pointerId: 2, pointerType: "touch" });
    pointer("pointermove", 250, 100, { pointerId: 2, pointerType: "touch" });

    expect(zooms.at(-1)).toEqual({
      anchor: { x: 175, y: 100 },
      factor: 1.5,
    });
  });

  it("defers touch selection until a tap is confirmed", () => {
    const { editor, pointer } = createHarness({ snapToGrid: false });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({ type: "selection.clear" });
    const original = editor.getState().document.nodes[0];

    pointer("pointerdown", 20, 80, {
      pointerId: 1,
      pointerType: "touch",
    });
    pointer("pointermove", 26, 86, {
      pointerId: 1,
      pointerType: "touch",
    });

    expect(editor.getState().selectedIds).toEqual([]);
    expect(editor.getState().document.nodes[0]).toEqual(original);

    pointer("pointerup", 26, 86, {
      pointerId: 1,
      pointerType: "touch",
    });
    expect(editor.getState().selectedIds).toEqual(["node-1"]);
  });

  it("starts a single-touch node drag after the touch threshold", () => {
    const { editor, pointer } = createHarness({ snapToGrid: false });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });

    pointer("pointerdown", 20, 80, {
      pointerId: 1,
      pointerType: "touch",
    });
    pointer("pointermove", 40, 100, {
      pointerId: 1,
      pointerType: "touch",
    });

    expect(editor.getState().selectedIds).toEqual(["node-1"]);
    expect(editor.getState().moveDelta).toEqual({ x: 20, y: 20 });

    pointer("pointerup", 40, 100, {
      pointerId: 1,
      pointerType: "touch",
    });
    expect(editor.getState().document.nodes[0]).toMatchObject({ x: 24, y: 32 });
  });

  it("pans when a single-touch drag starts on an unselected node body", () => {
    const { editor, pointer, viewport } = createHarness({ snapToGrid: false });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 400, y: 300 },
    });
    const original = editor.getState().document;

    pointer("pointerdown", 20, 80, {
      pointerId: 1,
      pointerType: "touch",
    });
    pointer("pointermove", 40, 100, {
      pointerId: 1,
      pointerType: "touch",
    });
    pointer("pointerup", 40, 100, {
      pointerId: 1,
      pointerType: "touch",
    });

    expect(viewport()).toEqual({ x: 20, y: 20, zoom: 1 });
    expect(editor.getState().selectedIds).toEqual(["node-2"]);
    expect(editor.getState().document).toEqual(original);
  });

  it("pans when a single-touch drag starts on an unselected node header", () => {
    const { editor, pointer, viewport } = createHarness({ snapToGrid: false });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 400, y: 300 },
    });
    const original = editor.getState().document;

    pointer("pointerdown", 20, 30, {
      pointerId: 1,
      pointerType: "touch",
    });
    pointer("pointermove", 40, 50, {
      pointerId: 1,
      pointerType: "touch",
    });
    pointer("pointerup", 40, 50, {
      pointerId: 1,
      pointerType: "touch",
    });

    expect(viewport()).toEqual({ x: 20, y: 20, zoom: 1 });
    expect(editor.getState().selectedIds).toEqual(["node-2"]);
    expect(editor.getState().document).toEqual(original);
  });

  it("does not change selection when a pinch starts on a node", () => {
    const { editor, pointer, zooms } = createHarness({ snapToGrid: false });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 400, y: 300 },
    });
    const original = editor.getState().document;

    pointer("pointerdown", 20, 80, {
      pointerId: 1,
      pointerType: "touch",
    });
    expect(editor.getState().selectedIds).toEqual(["node-2"]);

    pointer("pointerdown", 200, 80, {
      pointerId: 2,
      pointerType: "touch",
    });
    pointer("pointermove", 250, 80, {
      pointerId: 2,
      pointerType: "touch",
    });
    pointer("pointerup", 20, 80, {
      pointerId: 1,
      pointerType: "touch",
    });
    pointer("pointerup", 250, 80, {
      pointerId: 2,
      pointerType: "touch",
    });

    expect(zooms).toHaveLength(1);
    expect(editor.getState().selectedIds).toEqual(["node-2"]);
    expect(editor.getState().document).toEqual(original);
  });

  it("rolls back a selected-node drag when it becomes a pinch", () => {
    const { editor, pointer } = createHarness({ snapToGrid: false });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 400, y: 300 },
    });
    editor.dispatch({ type: "selection.node", additive: false, id: "node-1" });
    const original = editor.getState().document;

    pointer("pointerdown", 20, 30, {
      pointerId: 1,
      pointerType: "touch",
    });
    pointer("pointermove", 40, 50, {
      pointerId: 1,
      pointerType: "touch",
    });
    expect(editor.getState().selectedIds).toEqual(["node-1"]);
    expect(editor.getState().moveDelta).toEqual({ x: 20, y: 20 });

    pointer("pointerdown", 200, 80, {
      pointerId: 2,
      pointerType: "touch",
    });
    expect(editor.getState().selectedIds).toEqual(["node-1"]);
    expect(editor.getState().moveDelta).toBeNull();

    pointer("pointerup", 200, 80, {
      pointerId: 2,
      pointerType: "touch",
    });
    pointer("pointerup", 40, 50, {
      pointerId: 1,
      pointerType: "touch",
    });

    expect(editor.getState().selectedIds).toEqual(["node-1"]);
    expect(editor.getState().document).toEqual(original);
  });

  it("discards a pending touch when the pointer is cancelled", () => {
    const { editor, pointer } = createHarness();
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 400, y: 300 },
    });

    pointer("pointerdown", 20, 80, {
      pointerId: 1,
      pointerType: "touch",
    });
    pointer("pointercancel", 20, 80, {
      pointerId: 1,
      pointerType: "touch",
    });

    expect(editor.getState().selectedIds).toEqual(["node-2"]);
  });
});
