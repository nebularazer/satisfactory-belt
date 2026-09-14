import { expect, it } from "vitest";

import { createExampleCanvas } from "./example-canvas";

it("deletes a group in one edit and restores its items, order, and selection on undo", () => {
  const { controller, history, historyCommand, deleteSelection } = createExampleCanvas();
  const original = history.getSnapshot().state;
  const selection = new Set(["rectangle-1", "rectangle-3"]);
  controller.setSelection(selection);
  controller.zoomTo(2);
  controller.setGridSnapping(false);
  const { camera } = controller.getSnapshot();
  deleteSelection();
  const deleted = history.getSnapshot().state;
  expect(deleted).toEqual(original.filter((item) => !selection.has(item.id)));
  expect(controller.getSnapshot().selection.size).toBe(0);
  controller.setSelection(new Set(["rectangle-2"]));
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(original);
  expect(history.getSnapshot().canUndo).toBe(false);
  expect(controller.getSnapshot()).toMatchObject({ selection, camera, gridSnapping: false });
  historyCommand("redo");
  expect(history.getSnapshot().state).toBe(deleted);
  expect(controller.getSnapshot().selection.size).toBe(0);
  historyCommand("undo");
  expect(controller.getSnapshot().selection).toEqual(selection);
});

it("ignores deletion without selection and during gestures without adding history", () => {
  const { controller, history, historyCommand, deleteSelection } = createExampleCanvas();
  const original = history.getSnapshot().state;
  deleteSelection();
  expect(history.getSnapshot().state).toBe(original);
  expect(history.getSnapshot().canUndo).toBe(false);
  controller.setSelection(new Set(["rectangle-1"]));
  controller.pointerDown({ id: 1, x: 200, y: 200 });
  controller.pointerMove({ id: 1, x: 232, y: 200 });
  deleteSelection();
  expect(history.getSnapshot().state).toBe(original);
  expect(controller.getSnapshot().interaction).toBe("drag");
  controller.cancel();
  deleteSelection();
  deleteSelection();
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(original);
  expect(history.getSnapshot().canUndo).toBe(false);
  controller.command("escape");
  deleteSelection();
  expect(history.getSnapshot().canRedo).toBe(true);
});

it("keeps copied items after deletion and records paste and delete independently", () => {
  const { controller, history, historyCommand, clipboardCommand, deleteSelection } =
    createExampleCanvas();
  const original = history.getSnapshot().state;
  controller.setSelection(new Set(original.map((item) => item.id)));
  clipboardCommand("copy");
  deleteSelection();
  expect(controller.getSnapshot().items).toEqual([]);
  clipboardCommand("paste");
  const pasted = history.getSnapshot().state;
  expect(pasted).toHaveLength(original.length);
  expect(pasted.every((item) => !original.some((source) => source.id === item.id))).toBe(true);
  historyCommand("undo");
  expect(controller.getSnapshot().items).toEqual([]);
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(original);
  expect(controller.getSnapshot().selection).toEqual(new Set(original.map((item) => item.id)));
  deleteSelection();
  expect(history.getSnapshot().canRedo).toBe(false);
});

it("records a group drag once, retaining selection, camera, and preferences through undo", () => {
  const { controller, history, historyCommand } = createExampleCanvas();
  const original = history.getSnapshot().state;
  controller.pointerDown({ id: 1, x: 100, y: 100, marquee: true });
  controller.pointerUp({ id: 1, x: 750, y: 300 });
  controller.pointerDown({ id: 1, x: 200, y: 200 });
  controller.pointerMove({ id: 1, x: 232, y: 216 });
  expect(history.getSnapshot().canUndo).toBe(false);
  controller.pointerUp({ id: 1, x: 248, y: 232 });
  const moved = history.getSnapshot().state;
  expect(moved[0]).toMatchObject({ x: 208, y: 192 });
  expect(moved[1]).toMatchObject({ x: 496, y: 192 });
  controller.zoomTo(2);
  controller.setGridSnapping(false);
  const { camera, selection } = controller.getSnapshot();
  historyCommand("undo");
  expect(controller.getSnapshot().items).toBe(original);
  expect(history.getSnapshot().canUndo).toBe(false);
  expect(controller.getSnapshot()).toMatchObject({ camera, selection, gridSnapping: false });
  historyCommand("redo");
  expect(controller.getSnapshot().items).toBe(moved);
});

it("ignores cancelled/no-op drags and undoes one held-key gesture at a time", () => {
  const { controller, history, historyCommand } = createExampleCanvas();
  controller.pointerDown({ id: 1, x: 200, y: 200 });
  controller.pointerUp({ id: 1, x: 205, y: 200 });
  expect(history.getSnapshot().canUndo).toBe(false);
  controller.pointerDown({ id: 1, x: 200, y: 200 });
  controller.pointerMove({ id: 1, x: 248, y: 200 });
  controller.cancel();
  expect(history.getSnapshot().canUndo).toBe(false);
  const group = {};
  controller.command("move-right", { group });
  controller.command("move-right", { group });
  controller.command("move-right", { group });
  expect(controller.getSnapshot().items[0]?.x).toBe(208);
  historyCommand("undo");
  expect(controller.getSnapshot().items[0]?.x).toBe(160);
  expect(history.getSnapshot().canUndo).toBe(false);
  controller.command("move-down", { group: {} });
  expect(history.getSnapshot().canRedo).toBe(false);
});

it("pastes a selected group with fresh IDs, preserved spacing, and one undo step", () => {
  const { controller, history, historyCommand, clipboardCommand } = createExampleCanvas();
  const original = history.getSnapshot().state;
  controller.setSelection(new Set([original[0]!.id, original[1]!.id]));
  clipboardCommand("copy");
  expect(history.getSnapshot().canUndo).toBe(false);
  clipboardCommand("paste");
  const pasted = history.getSnapshot().state.slice(original.length);
  expect(pasted).toHaveLength(2);
  pasted.forEach((item, index) => {
    expect(item).toEqual({
      ...original[index],
      id: expect.any(String),
      x: original[index]!.x + 32,
      y: original[index]!.y + 32,
    });
  });
  expect(new Set(history.getSnapshot().state.map((item) => item.id)).size).toBe(8);
  expect(controller.getSnapshot().selection).toEqual(new Set(pasted.map((item) => item.id)));
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(original);
  expect(history.getSnapshot().canUndo).toBe(false);
  expect(controller.getSnapshot().selection.size).toBe(0);
  historyCommand("redo");
  expect(history.getSnapshot().state.slice(original.length)).toEqual(pasted);
});

it("retains copied geometry after moving originals and advances each paste independently of zoom", () => {
  const { controller, history, historyCommand, clipboardCommand } = createExampleCanvas();
  controller.setSelection(new Set(["rectangle-1"]));
  clipboardCommand("copy");
  controller.command("move-right");
  controller.zoomTo(2);
  clipboardCommand("paste");
  const first = history.getSnapshot().state.at(-1)!;
  expect(first).toMatchObject({ x: 192, y: 192 });
  clipboardCommand("paste");
  const second = history.getSnapshot().state.at(-1)!;
  expect(second).toMatchObject({ x: 224, y: 224 });
  expect(second.id).not.toBe(first.id);
  historyCommand("undo");
  expect(history.getSnapshot().state.at(-1)).toBe(first);
  clipboardCommand("paste");
  expect(history.getSnapshot().state.at(-1)).toMatchObject({ x: 256, y: 256 });
  expect(history.getSnapshot().state.at(-1)!.id).not.toBe(second.id);
  expect(history.getSnapshot().canRedo).toBe(false);
  clipboardCommand("copy");
  clipboardCommand("paste");
  expect(history.getSnapshot().state.at(-1)).toMatchObject({ x: 288, y: 288 });
});

it.each([true, false])("pastes off-grid groups with grid snapping %s", (gridSnapping) => {
  const { controller, history, clipboardCommand } = createExampleCanvas();
  history.update((items) =>
    items.map((item, index) => ({
      ...item,
      x: item.x + 3 + index,
      y: item.y - 5 - index,
    })),
  );
  const originals = history.getSnapshot().state.slice(0, 2);
  controller.setSelection(new Set(originals.map((item) => item.id)));
  clipboardCommand("copy");
  controller.setGridSnapping(gridSnapping);
  clipboardCommand("paste");
  const pasted = history.getSnapshot().state.slice(-2);
  expect(pasted[0]).toMatchObject(gridSnapping ? { x: 192, y: 193 } : { x: 195, y: 187 });
  expect(pasted[1]!.x - pasted[0]!.x).toBe(originals[1]!.x - originals[0]!.x);
  expect(pasted[1]!.y - pasted[0]!.y).toBe(originals[1]!.y - originals[0]!.y);
});

it("ignores empty clipboards, empty selections, and clipboard commands during a gesture", () => {
  const { controller, history, clipboardCommand } = createExampleCanvas();
  const original = history.getSnapshot().state;
  clipboardCommand("paste");
  clipboardCommand("copy");
  clipboardCommand("paste");
  expect(history.getSnapshot().state).toBe(original);
  controller.setSelection(new Set(["rectangle-1"]));
  clipboardCommand("copy");
  controller.command("escape");
  clipboardCommand("copy");
  controller.pointerDown({ id: 1, x: 500, y: 200 });
  controller.pointerMove({ id: 1, x: 532, y: 200 });
  clipboardCommand("copy");
  clipboardCommand("paste");
  expect(history.getSnapshot().state).toBe(original);
  controller.cancel();
  clipboardCommand("paste");
  expect(history.getSnapshot().state.at(-1)).toMatchObject({
    text: "Rectangle 01",
    x: 192,
    y: 192,
  });
  expect(createExampleCanvas().history.getSnapshot().state).toHaveLength(6);
});
