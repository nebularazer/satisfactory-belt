import { expect, it, vi } from "vitest";

import { EditHistory } from "./index";

it("supports compound document edits without knowing node or connection types", () => {
  const initial = { nodes: ["a", "b"], connections: [] as string[] };
  const history = new EditHistory(initial);
  history.update((state) => ({ ...state, connections: ["a-b"] }));
  const connected = history.getSnapshot().state;
  history.update(() => ({ nodes: ["a"], connections: [] }));
  history.undo();
  expect(history.getSnapshot().state).toBe(connected);
  history.undo();
  expect(history.getSnapshot().state).toBe(initial);
  history.redo();
  expect(history.getSnapshot().state).toBe(connected);
  history.redo();
  expect(history.getSnapshot().state).toEqual({ nodes: ["a"], connections: [] });
});

it("groups consecutive key repeats, but separates another hold and edits after undo", () => {
  const history = new EditHistory(0);
  const hold = {};
  history.update(() => 16, hold);
  history.update(() => 32, hold);
  history.update(() => 48, {});
  history.undo();
  expect(history.getSnapshot().state).toBe(32);
  history.undo();
  expect(history.getSnapshot().state).toBe(0);
  history.redo();
  expect(history.getSnapshot().state).toBe(32);
  history.update(() => 64, hold);
  expect(history.getSnapshot().canRedo).toBe(false);
  history.undo();
  expect(history.getSnapshot().state).toBe(32);
});

it("does not discard redo or notify on no-ops and failed edits", () => {
  const history = new EditHistory(0);
  history.update(() => 1);
  history.undo();
  const snapshot = history.getSnapshot();
  const listener = vi.fn();
  const unsubscribe = history.subscribe(listener);
  history.update((state) => state);
  expect(() =>
    history.update(() => {
      throw new Error("Invalid edit");
    }),
  ).toThrow("Invalid edit");
  expect(history.getSnapshot()).toBe(snapshot);
  expect(listener).not.toHaveBeenCalled();
  history.redo();
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  history.undo();
  expect(listener).toHaveBeenCalledTimes(1);
});

it("bounds retained history and makes exhausted undo/redo harmless", () => {
  const history = new EditHistory(0, 2);
  history.undo();
  history.redo();
  for (const value of [1, 2, 3]) history.update(() => value);
  history.undo();
  history.undo();
  history.undo();
  expect(history.getSnapshot()).toEqual({ state: 1, canUndo: false, canRedo: true });
  history.redo();
  history.redo();
  history.redo();
  expect(history.getSnapshot()).toEqual({ state: 3, canUndo: true, canRedo: false });
});
