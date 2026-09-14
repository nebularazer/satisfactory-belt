import { expect, it, vi } from "vitest";

import { Preferences } from "./index";
import type { UserPreferences } from "./index";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("loads saved preferences once and never writes defaults during initialization", async () => {
  const store = { load: vi.fn(async () => ({ gridSnapping: false })), save: vi.fn(async () => {}) };
  const preferences = new Preferences(store, vi.fn());
  expect(preferences.getSnapshot().gridSnapping).toBe(true);
  expect(preferences.getSnapshot().showGrid).toBe(true);
  expect(preferences.getSnapshot().showPerformance).toBe(false);
  const listener = vi.fn();
  const unsubscribe = preferences.subscribe(listener);
  await Promise.all([preferences.load(), preferences.load()]);
  expect(preferences.getSnapshot().gridSnapping).toBe(false);
  expect(preferences.getSnapshot().showPerformance).toBe(false);
  expect(store.load).toHaveBeenCalledTimes(1);
  expect(store.save).not.toHaveBeenCalled();
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  preferences.setGridSnapping(true);
  expect(listener).toHaveBeenCalledTimes(1);
});

it("does not let a delayed load overwrite a newer user choice", async () => {
  const loaded = deferred<Partial<UserPreferences>>();
  const store = { load: () => loaded.promise, save: vi.fn(async () => {}) };
  const preferences = new Preferences(store, vi.fn());
  const loading = preferences.load();
  preferences.setGridSnapping(false);
  loaded.resolve({ gridSnapping: true });
  await loading;
  expect(preferences.getSnapshot().gridSnapping).toBe(false);
  expect(store.save).toHaveBeenCalledWith({
    gridSnapping: false,
    showGrid: true,
    showPerformance: false,
  });
});

it("serializes slow writes while updating the UI immediately", async () => {
  const firstSave = deferred<void>();
  const store = {
    load: async () => ({}),
    save: vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(undefined),
  };
  const preferences = new Preferences(store, vi.fn());
  preferences.setGridSnapping(false);
  await Promise.resolve();
  preferences.setGridSnapping(true);
  expect(preferences.getSnapshot().gridSnapping).toBe(true);
  expect(store.save).toHaveBeenCalledTimes(1);
  firstSave.resolve();
  await vi.waitFor(() => expect(store.save).toHaveBeenCalledTimes(2));
  expect(store.save.mock.calls).toEqual([
    [{ gridSnapping: false, showGrid: true, showPerformance: false }],
    [{ gridSnapping: true, showGrid: true, showPerformance: false }],
  ]);
});

it("keeps the session usable after storage errors and allows later saves", async () => {
  const denied = new Error("Storage denied");
  const onError = vi.fn();
  const store = {
    load: vi.fn().mockRejectedValue(denied),
    save: vi.fn().mockRejectedValueOnce(denied).mockResolvedValue(undefined),
  };
  const preferences = new Preferences(store, onError);
  await preferences.load();
  expect(preferences.getSnapshot().gridSnapping).toBe(true);
  preferences.setGridSnapping(false);
  await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
  expect(preferences.getSnapshot().gridSnapping).toBe(false);
  preferences.setGridSnapping(true);
  await vi.waitFor(() => expect(store.save).toHaveBeenCalledTimes(2));
  expect(onError).toHaveBeenCalledWith(denied);
});

it("loads hidden-grid preferences and saves visibility independently of snapping", async () => {
  const store = {
    load: async () => ({ showGrid: false }),
    save: vi.fn(async () => {}),
  };
  const preferences = new Preferences(store, vi.fn());
  await preferences.load();
  expect(preferences.getSnapshot()).toEqual({
    gridSnapping: true,
    showGrid: false,
    showPerformance: false,
  });
  preferences.setShowGrid(false);
  expect(store.save).not.toHaveBeenCalled();
  preferences.setGridSnapping(false);
  preferences.setShowGrid(true);
  expect(preferences.getSnapshot()).toEqual({
    gridSnapping: false,
    showGrid: true,
    showPerformance: false,
  });
  await vi.waitFor(() => expect(store.save).toHaveBeenCalledTimes(2));
  expect(store.save.mock.calls).toEqual([
    [{ gridSnapping: false, showGrid: false, showPerformance: false }],
    [{ gridSnapping: false, showGrid: true, showPerformance: false }],
  ]);
});

it("keeps a grid visibility choice made while saved preferences are loading", async () => {
  const loaded = deferred<Partial<UserPreferences>>();
  const store = { load: () => loaded.promise, save: vi.fn(async () => {}) };
  const preferences = new Preferences(store, vi.fn());
  const loading = preferences.load();
  preferences.setShowGrid(false);
  loaded.resolve({ showGrid: true });
  await loading;
  expect(preferences.getSnapshot()).toEqual({
    gridSnapping: true,
    showGrid: false,
    showPerformance: false,
  });
  expect(store.save).toHaveBeenCalledWith({
    gridSnapping: true,
    showGrid: false,
    showPerformance: false,
  });
});

it("loads and toggles performance visibility without changing grid preferences", async () => {
  const store = {
    load: async () => ({ showPerformance: true, showGrid: false }),
    save: vi.fn(async () => {}),
  };
  const preferences = new Preferences(store, vi.fn());
  await preferences.load();
  expect(preferences.getSnapshot()).toEqual({
    gridSnapping: true,
    showGrid: false,
    showPerformance: true,
  });
  preferences.setShowPerformance(true);
  expect(store.save).not.toHaveBeenCalled();
  preferences.setShowPerformance(false);
  await vi.waitFor(() =>
    expect(store.save).toHaveBeenCalledWith({
      gridSnapping: true,
      showGrid: false,
      showPerformance: false,
    }),
  );
});
