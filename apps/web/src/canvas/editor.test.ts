import { describe, expect, it } from "vitest";

import { createCanvasEditor, SNAP_INTERVAL } from "./editor";

function createEditor() {
  let id = 0;
  return createCanvasEditor({ idFactory: () => `node-${++id}` });
}

describe("canvas editor", () => {
  it("creates snapped nodes and selects by point and marquee", () => {
    const editor = createEditor();
    editor.dispatch({ type: "node.create", at: { x: 100, y: 100 } });
    editor.dispatch({ type: "node.create", at: { x: 400, y: 300 } });

    const [first, second] = editor.getState().document.nodes;
    expect(first).toMatchObject({ id: "node-1", x: 0, y: 64 });
    expect(second).toMatchObject({ id: "node-2", x: 320, y: 256 });
    expect(editor.hitTest({ x: 20, y: 80 })?.id).toBe("node-1");

    editor.dispatch({
      type: "selection.marquee",
      baseIds: [],
      rectangle: { x: -10, y: 50, width: 200, height: 120 },
    });
    expect(editor.getState().selectedIds).toEqual(["node-1"]);
  });

  it("toggles nodes in an additive selection", () => {
    const editor = createEditor();
    editor.dispatch({ type: "node.create", at: { x: 100, y: 100 } });
    editor.dispatch({ type: "node.create", at: { x: 400, y: 300 } });

    editor.dispatch({ type: "selection.node", additive: false, id: "node-1" });
    editor.dispatch({ type: "selection.node", additive: true, id: "node-2" });
    expect(editor.getState().selectedIds).toEqual(["node-1", "node-2"]);

    editor.dispatch({ type: "selection.node", additive: true, id: "node-1" });
    expect(editor.getState().selectedIds).toEqual(["node-2"]);
  });

  it("moves a selection as one undoable operation", () => {
    const editor = createEditor();
    editor.dispatch({ type: "node.create", at: { x: 100, y: 100 } });
    editor.dispatch({ type: "selection.move.begin" });
    editor.dispatch({
      type: "selection.move.update",
      delta: { x: 45, y: 10 },
    });
    editor.dispatch({ type: "selection.move.commit" });

    expect(editor.getState().document.nodes[0]).toMatchObject({ x: 32, y: 64 });
    editor.dispatch({ type: "history.undo" });
    expect(editor.getState().document.nodes[0]).toMatchObject({ x: 0, y: 64 });
    editor.dispatch({ type: "history.redo" });
    expect(editor.getState().document.nodes[0]).toMatchObject({ x: 32, y: 64 });
  });

  it("moves every node in a multi-selection", () => {
    const editor = createEditor();
    editor.dispatch({ type: "node.create", at: { x: 100, y: 100 } });
    editor.dispatch({ type: "node.create", at: { x: 400, y: 300 } });
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
      { x: 32, y: 32 },
      { x: 352, y: 224 },
    ]);
  });

  it("moves freely when snapping is disabled", () => {
    let id = 0;
    const editor = createCanvasEditor({
      idFactory: () => `node-${++id}`,
      snapToGrid: false,
    });
    editor.dispatch({ type: "node.create", at: { x: 100, y: 100 } });
    editor.dispatch({ type: "selection.move.begin" });
    editor.dispatch({
      type: "selection.move.update",
      delta: { x: 13, y: 17 },
    });
    editor.dispatch({ type: "selection.move.commit" });

    expect(editor.getState().document.nodes[0]).toMatchObject({ x: 25, y: 69 });
  });

  it("copies, pastes, duplicates, deletes, and restores selections", () => {
    const editor = createEditor();
    editor.dispatch({ type: "node.create", at: { x: 100, y: 100 } });
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
});
