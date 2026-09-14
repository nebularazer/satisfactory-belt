import { expect, it } from "vitest";

import { createExampleCanvas } from "./example-canvas";

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
