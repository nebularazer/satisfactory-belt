import { describe, expect, it } from "vitest";

import { canvasNodeId } from "./document";
import { createCanvasEditor, HISTORY_LIMIT } from "./editor";
import { SNAP_INTERVAL } from "./grid";
import { TEST_NODE_TEMPLATE, testCanvasNode } from "./test-fixtures";

function createEditor() {
  let id = 0;
  return createCanvasEditor({ idFactory: () => `node-${++id}` });
}

describe("canvas editor", () => {
  it("creates a machine with its selected recipe", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "node.create",
      at: { x: 100, y: 100 },
      label: "Iron Plate",
      node: {
        buildableId: "Build_ConstructorMk1_C",
        kind: "process",
        processId: "Recipe_IronPlate_C",
      },
    });

    expect(editor.getState().document.nodes[0]).toMatchObject({
      configuration: {
        buildableId: "Build_ConstructorMk1_C",
        kind: "process",
        processId: "Recipe_IronPlate_C",
      },
      label: "Iron Plate",
    });
  });

  it("creates snapped nodes and selects by point and marquee", () => {
    const editor = createEditor();
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

    const [first, second] = editor.getState().document.nodes;
    expect(first).toMatchObject({
      configuration: { id: "node-1" },
      height: 176,
      width: 192,
      x: 0,
      y: 16,
    });
    expect(second).toMatchObject({
      configuration: { id: "node-2" },
      height: 176,
      width: 192,
      x: 304,
      y: 208,
    });
    expect(canvasNodeId(editor.hitTest({ x: 20, y: 80 })!)).toBe("node-1");

    editor.dispatch({
      type: "selection.marquee",
      baseIds: [],
      rectangle: { x: -10, y: 50, width: 200, height: 120 },
    });
    expect(editor.getState().selectedIds).toEqual(["node-1"]);
  });

  it("toggles nodes in an additive selection", () => {
    const editor = createEditor();
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
    editor.dispatch({ type: "selection.node", additive: true, id: "node-2" });
    expect(editor.getState().selectedIds).toEqual(["node-1", "node-2"]);

    editor.dispatch({ type: "selection.node", additive: true, id: "node-1" });
    expect(editor.getState().selectedIds).toEqual(["node-2"]);
  });

  it("keeps unknown node ids out of the selection", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });

    editor.dispatch({ type: "selection.node", additive: false, id: "missing" });
    expect(editor.getState().selectedIds).toEqual(["node-1"]);

    editor.dispatch({ type: "selection.clear" });
    editor.dispatch({
      type: "selection.marquee",
      baseIds: ["missing", "node-1"],
      rectangle: { height: 10, width: 10, x: 1_000, y: 1_000 },
    });
    expect(editor.getState().selectedIds).toEqual(["node-1"]);
  });

  it("moves a selection as one undoable operation", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({ type: "selection.move.begin" });
    editor.dispatch({
      type: "selection.move.update",
      delta: { x: 45, y: 10 },
    });
    editor.dispatch({ type: "selection.move.commit" });

    expect(editor.getState().document.nodes[0]).toMatchObject({ x: 48, y: 32 });
    editor.dispatch({ type: "history.undo" });
    expect(editor.getState().document.nodes[0]).toMatchObject({
      x: 0,
      y: 16,
    });
    editor.dispatch({ type: "history.redo" });
    expect(editor.getState().document.nodes[0]).toMatchObject({ x: 48, y: 32 });
  });

  it("keeps pointer movement transient until the move is committed", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    const document = editor.getState().document;
    const changes: Array<{ kind: string }> = [];
    editor.subscribe((change) => changes.push(change));

    editor.dispatch({ type: "selection.move.begin" });
    editor.dispatch({
      type: "selection.move.update",
      delta: { x: 45, y: 10 },
    });

    expect(editor.getState().document).toBe(document);
    expect(editor.getState().moveDelta).toEqual({ x: 48, y: 16 });
    expect(changes.at(-1)).toMatchObject({ kind: "move" });

    editor.dispatch({ type: "selection.move.commit" });
    expect(editor.getState().moveDelta).toBeNull();
    expect(editor.getState().document).not.toBe(document);
  });

  it("moves every node in a multi-selection", () => {
    const editor = createEditor();
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
    editor.dispatch({
      type: "selection.marquee",
      baseIds: [],
      rectangle: { height: 400, width: 600, x: -100, y: 0 },
    });
    editor.dispatch({ type: "selection.move.begin" });
    editor.dispatch({
      type: "selection.move.update",
      delta: { x: 32, y: -32 },
    });
    editor.dispatch({ type: "selection.move.commit" });

    expect(editor.getState().document.nodes).toMatchObject([
      { x: 32, y: -16 },
      { x: 336, y: 176 },
    ]);
  });

  it("moves freely when snapping is disabled", () => {
    let id = 0;
    const editor = createCanvasEditor({
      idFactory: () => `node-${++id}`,
      snapToGrid: false,
    });
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({ type: "selection.move.begin" });
    editor.dispatch({
      type: "selection.move.update",
      delta: { x: 13, y: 17 },
    });
    editor.dispatch({ type: "selection.move.commit" });

    expect(editor.getState().document.nodes[0]).toMatchObject({
      x: 17,
      y: 29,
    });
  });

  it("copies, pastes, duplicates, deletes, and restores selections", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({ type: "selection.copy" });
    editor.dispatch({ type: "selection.paste" });
    editor.dispatch({ type: "selection.duplicate" });

    expect(editor.getState().document.nodes).toHaveLength(3);
    expect(editor.getState().document.nodes[1]?.x).toBe(SNAP_INTERVAL);
    expect(editor.getState().document.nodes[2]?.x).toBe(SNAP_INTERVAL * 2);

    editor.dispatch({ type: "selection.delete" });
    expect(editor.getState().document.nodes).toHaveLength(2);
    editor.dispatch({ type: "history.undo" });
    expect(editor.getState().document.nodes).toHaveLength(3);
    expect(editor.getState().selectedIds).toEqual(["node-3"]);
  });

  it("nudges selected nodes as an undoable operation", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({ type: "selection.nudge", delta: { x: 32, y: -32 } });

    expect(editor.getState().document.nodes[0]).toMatchObject({
      x: 32,
      y: -16,
    });
    editor.dispatch({ type: "history.undo" });
    expect(editor.getState().document.nodes[0]).toMatchObject({
      x: 0,
      y: 16,
    });
  });

  it("calculates all-node and selection bounds", () => {
    const editor = createEditor();
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

    expect(editor.getBounds("all")).toEqual({
      height: 368,
      width: 496,
      x: 0,
      y: 16,
    });
    expect(editor.getBounds("selection")).toEqual({
      height: 176,
      width: 192,
      x: 304,
      y: 208,
    });
  });

  it("replaces a document and clears history", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({
      type: "document.replace",
      document: {
        nodes: [
          {
            ...testCanvasNode("imported", 1_000, 1_000),
            height: 50,
            label: "Imported",
            width: 50,
          },
        ],
        version: 3,
      },
    });

    expect(editor.getState().canUndo).toBe(false);
    expect(canvasNodeId(editor.hitTest({ x: 1_025, y: 1_025 })!)).toBe(
      "imported",
    );
  });

  it("migrates legacy passive card sizes without changing custom sizes", () => {
    const editor = createCanvasEditor({
      document: {
        nodes: [
          testCanvasNode("legacy-full", 0, 0, {
            height: 256,
            width: 256,
          }),
          testCanvasNode("legacy-router", 320, 0, {
            height: 160,
            width: 192,
          }),
          {
            configuration: {
              buildableId: "Build_StorageContainerMk1_C",
              id: "legacy-buffer",
              kind: "buffer",
            },
            height: 192,
            label: "Storage Container",
            width: 256,
            x: 640,
            y: 0,
          },
          testCanvasNode("custom", 320, 0),
        ],
        version: 3,
      },
    });

    expect(editor.getState().document.nodes).toMatchObject([
      { height: 176, width: 192 },
      { height: 176, width: 192 },
      { height: 208, width: 256 },
      { height: 96, width: 176 },
    ]);
  });

  it("resets the document and all transient editing state", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "node.create",
      node: TEST_NODE_TEMPLATE,
      at: { x: 100, y: 100 },
    });
    editor.dispatch({ type: "selection.copy" });
    editor.dispatch({ type: "selection.move.begin" });
    editor.dispatch({ type: "selection.move.update", delta: { x: 20, y: 20 } });

    editor.dispatch({ type: "document.reset" });

    expect(editor.getState()).toMatchObject({
      canRedo: false,
      canUndo: false,
      document: { nodes: [], version: 3 },
      moveDelta: null,
      selectedIds: [],
    });
    expect(editor.getBounds("all")).toBeUndefined();
    editor.dispatch({ type: "selection.paste" });
    expect(editor.getState().document.nodes).toHaveLength(0);
  });

  it("bounds operation history", () => {
    const editor = createEditor();
    for (let index = 0; index <= HISTORY_LIMIT; index += 1) {
      editor.dispatch({
        type: "node.create",
        node: TEST_NODE_TEMPLATE,
        at: { x: index * 200, y: 100 },
      });
    }
    for (let index = 0; index <= HISTORY_LIMIT; index += 1) {
      editor.dispatch({ type: "history.undo" });
    }

    expect(editor.getState().document.nodes).toHaveLength(1);
    expect(editor.getState().canUndo).toBe(false);
  });
});
