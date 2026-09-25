import { EditHistory } from "@satisfactory-belt/edit-history";
import type { FactoryDocument } from "@satisfactory-belt/factory-core";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";

import { createBrowserPlanStore } from "./browser-plan-store";
import { startPlanAutosave } from "./plan-autosave";
import { createReferencePlans } from "./reference-plans";

afterEach(() => vi.restoreAllMocks());

it("distinguishes an absent plan from a saved empty canvas after reopening", async () => {
  const factory = new IDBFactory();
  const store = await createBrowserPlanStore(factory);
  expect(await store.load()).toBeUndefined();
  await store.save({ nodes: [], links: [] });
  store.close();
  const reopened = await createBrowserPlanStore(factory);
  expect(await reopened.load()).toEqual({ nodes: [], links: [] });
  reopened.close();
});

it("round-trips a complete plan independently of the in-memory document", async () => {
  const factory = new IDBFactory();
  const store = await createBrowserPlanStore(factory);
  const original: FactoryDocument = {
    ...createReferencePlans(),
    routes: [
      {
        id: "route",
        name: "Train route",
        kind: "rail",
        vehicleCount: 2,
        freightCarCount: 3,
        roundTripSeconds: 120,
        fuelPerTrip: 0,
        stops: [],
      },
    ],
    depotResearch: { speedLevel: 2, capacityLevel: 3 },
  };
  await store.save(original);
  store.close();
  const reopened = await createBrowserPlanStore(factory);
  const loaded = await reopened.load();
  expect(loaded).toEqual(original);
  expect(loaded).not.toBe(original);
  expect(loaded!.nodes[0]).not.toBe(original.nodes[0]);
  reopened.close();
});

it("commits rapid saves in edit order", async () => {
  const store = await createBrowserPlanStore(new IDBFactory());
  const plan = createReferencePlans();
  const empty = { nodes: [], links: [] };
  await Promise.all([store.save(plan), store.save(empty), store.save(plan), store.save(empty)]);
  expect(await store.load()).toEqual(empty);
  store.close();
});

it("persists the initial plan, edits, clear, undo and redo, and stops on cleanup", async () => {
  const store = await createBrowserPlanStore(new IDBFactory());
  const initial = createReferencePlans();
  const history = new EditHistory<FactoryDocument>(initial);
  const status = vi.fn();
  const stop = startPlanAutosave(history, store, status);
  expect(await store.load()).toEqual(initial);
  // oxlint-disable-next-line oxc/no-map-spread -- Keep history snapshots immutable.
  const moved = { ...initial, nodes: initial.nodes.map((node) => ({ ...node, x: node.x + 100 })) };
  history.update(() => moved);
  expect(await store.load()).toEqual(moved);
  const empty = { nodes: [], links: [] };
  history.update(() => empty);
  expect(await store.load()).toEqual(empty);
  history.undo();
  expect(await store.load()).toEqual(moved);
  history.redo();
  expect(await store.load()).toEqual(empty);
  expect(status).toHaveBeenLastCalledWith(null);
  stop();
  history.undo();
  expect(await store.load()).toEqual(empty);
  store.close();
});

it("reports storage access errors instead of treating them as an empty database", async () => {
  const factory = new IDBFactory();
  vi.spyOn(factory, "open").mockImplementation(() => {
    throw new DOMException("Storage unavailable", "SecurityError");
  });
  await expect(createBrowserPlanStore(factory)).rejects.toThrow("Storage unavailable");
});

it.each([1, 99])("skips unsupported plan version %s without migrating it", async (version) => {
  const factory = new IDBFactory();
  const store = await createBrowserPlanStore(factory);
  const database = await new Promise<IDBDatabase>((resolve) => {
    const request = factory.open("satisfactory-belt", 1);
    request.addEventListener("success", () => resolve(request.result));
  });
  const record = { version, document: { nodes: [], links: [] } };
  await new Promise<void>((resolve) => {
    const tx = database.transaction("plans", "readwrite");
    tx.objectStore("plans").put(record, "current");
    tx.addEventListener("complete", () => resolve());
  });
  expect(await store.load()).toBeUndefined();
  const saved = await new Promise<unknown>((resolve) => {
    const request = database.transaction("plans").objectStore("plans").get("current");
    request.addEventListener("success", () => resolve(request.result));
  });
  expect(saved).toEqual(record);
  database.close();
  store.close();
});

it("keeps the last saved plan on write failure and recovers on the next edit", async () => {
  const store = await createBrowserPlanStore(new IDBFactory());
  const initial = createReferencePlans();
  const history = new EditHistory<FactoryDocument>(initial);
  const status = vi.fn();
  const stop = startPlanAutosave(history, store, status);
  await store.load();
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
    throw new DOMException("Storage full", "QuotaExceededError");
  });
  history.update(() => ({ nodes: [], links: [] }));
  expect(await store.load()).toEqual(initial);
  expect(status).toHaveBeenLastCalledWith(expect.stringContaining("could not be saved"));
  history.undo();
  history.redo();
  expect(await store.load()).toEqual({ nodes: [], links: [] });
  expect(status).toHaveBeenLastCalledWith(null);
  stop();
  store.close();
});

it("rejects an aborted write and retains the previous plan", async () => {
  const store = await createBrowserPlanStore(new IDBFactory());
  const plan = createReferencePlans();
  await store.save(plan);
  // oxlint-disable-next-line typescript/unbound-method -- The original is invoked with its object store as `this` below.
  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(
    function (this: IDBObjectStore, value, key) {
      const request = put.call(this, value, key);
      this.transaction.abort();
      return request;
    },
  );
  await expect(store.save({ nodes: [], links: [] })).rejects.toBeTruthy();
  expect(await store.load()).toEqual(plan);
  store.close();
});

it("does not hide a failed latest save when an earlier save finishes", async () => {
  const first = Promise.withResolvers<void>();
  const store = {
    save: vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new Error("Storage full")),
  };
  const history = new EditHistory<FactoryDocument>(createReferencePlans());
  const status = vi.fn();
  const stop = startPlanAutosave(history, store, status);
  history.update(() => ({ nodes: [], links: [] }));
  await vi.waitFor(() =>
    expect(status).toHaveBeenCalledWith(expect.stringContaining("could not be saved")),
  );
  first.resolve();
  await first.promise;
  expect(status).toHaveBeenCalledTimes(1);
  stop();
});
