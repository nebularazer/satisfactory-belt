import { EditHistory } from "@satisfactory-belt/edit-history";
import type { FactoryDocument } from "@satisfactory-belt/factory-core";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";

import { createBrowserPlanStore } from "./browser-plan-store";
import { startPlanAutosave } from "./plan-autosave";
import { createReferencePlans } from "./reference-plans";

afterEach(() => vi.restoreAllMocks());
const empty: FactoryDocument = { nodes: [], links: [] };

it("lists named factories, preserves empty saves, and restores the selected factory after reopening", async () => {
  const factory = new IDBFactory();
  const store = await createBrowserPlanStore(factory);
  expect(await store.loadActive()).toBeUndefined();
  expect(await store.list()).toEqual([]);
  const first = await store.create(" Iron production ", createReferencePlans());
  const second = await store.create("Empty factory", empty);
  expect(await store.list()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: first.id, name: "Iron production" }),
      expect.objectContaining({ id: second.id, name: "Empty factory" }),
    ]),
  );
  await store.select(first.id);
  store.close();
  const reopened = await createBrowserPlanStore(factory);
  expect((await reopened.loadActive())?.id).toBe(first.id);
  expect((await reopened.load(second.id))?.document).toEqual(empty);
  reopened.close();
});

it("keeps the main site and PR preview factories separate on the same origin", async () => {
  const factory = new IDBFactory();
  const main = await createBrowserPlanStore(factory, "/satisfactory-belt/");
  const preview = await createBrowserPlanStore(factory, "/satisfactory-belt/pr/42/");
  const original = createReferencePlans();
  await main.create("Main", original);
  expect(await preview.list()).toEqual([]);
  await preview.create("Preview", empty);
  expect((await main.loadActive())?.document).toEqual(original);
  main.close();
  preview.close();
});

it("round-trips the complete document and saves copies independently", async () => {
  const store = await createBrowserPlanStore(new IDBFactory());
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
  const first = await store.create("Original", original);
  const copy = await store.create("Copy", original);
  const loaded = await store.load(copy.id);
  expect(loaded?.document).toEqual(original);
  expect(loaded?.document).not.toBe(original);
  expect(loaded?.document.nodes[0]).not.toBe(original.nodes[0]);
  await store.save(copy.id, empty);
  expect((await store.load(first.id))?.document).toEqual(original);
  expect((await store.loadActive())?.document).toEqual(empty);
  store.close();
});

it("commits rapid edits in order without touching another factory", async () => {
  const store = await createBrowserPlanStore(new IDBFactory());
  const plan = createReferencePlans();
  const first = await store.create("First", plan);
  const second = await store.create("Second", plan);
  await Promise.all([
    store.save(first.id, plan),
    store.save(first.id, empty),
    store.save(first.id, plan),
    store.save(first.id, empty),
  ]);
  expect((await store.load(first.id))?.document).toEqual(empty);
  expect((await store.load(second.id))?.document).toEqual(plan);
  store.close();
});

it("deletes factories without recreating them through a stale autosave", async () => {
  const factory = new IDBFactory();
  const store = await createBrowserPlanStore(factory);
  const first = await store.create("First", empty);
  const second = await store.create("Second", createReferencePlans());
  await Promise.all([store.save(second.id, empty), store.delete(second.id)]);
  await expect(store.save(second.id, empty)).rejects.toThrow("no longer saved");
  await expect(store.select(second.id)).rejects.toThrow("no longer saved");
  expect(await store.load(second.id)).toBeUndefined();
  expect((await store.loadActive())?.id).toBe(first.id);
  await store.delete(first.id);
  store.close();
  const reopened = await createBrowserPlanStore(factory);
  expect(await reopened.list()).toEqual([]);
  expect(await reopened.loadActive()).toBeUndefined();
  reopened.close();
});

it("persists edits, clear, undo and redo for the captured factory, and stops on cleanup", async () => {
  const store = await createBrowserPlanStore(new IDBFactory());
  const initial = createReferencePlans();
  const saved = await store.create("First", initial);
  const history = new EditHistory<FactoryDocument>(initial);
  const status = vi.fn();
  const stop = startPlanAutosave(
    history,
    { save: (document) => store.save(saved.id, document) },
    status,
  );
  expect((await store.load(saved.id))?.document).toEqual(initial);
  // oxlint-disable-next-line oxc/no-map-spread -- Keep history snapshots immutable.
  const moved = { ...initial, nodes: initial.nodes.map((node) => ({ ...node, x: node.x + 100 })) };
  history.update(() => moved);
  expect((await store.load(saved.id))?.document).toEqual(moved);
  const other = await store.create("Other", initial);
  history.update(() => empty);
  expect((await store.load(saved.id))?.document).toEqual(empty);
  expect((await store.load(other.id))?.document).toEqual(initial);
  history.undo();
  expect((await store.load(saved.id))?.document).toEqual(moved);
  history.redo();
  expect((await store.load(saved.id))?.document).toEqual(empty);
  expect(status).toHaveBeenLastCalledWith(null);
  stop();
  history.undo();
  expect((await store.load(saved.id))?.document).toEqual(empty);
  store.close();
});

it("reports storage access errors and rejects blank names", async () => {
  const factory = new IDBFactory();
  const store = await createBrowserPlanStore(factory);
  await expect(store.create("  ", empty)).rejects.toThrow("name");
  store.close();
  vi.spyOn(factory, "open").mockImplementation(() => {
    throw new DOMException("Storage unavailable", "SecurityError");
  });
  await expect(createBrowserPlanStore(factory)).rejects.toThrow("Storage unavailable");
});

async function seedCurrent(factory: IDBFactory, value: unknown) {
  const database = await new Promise<IDBDatabase>((resolve) => {
    const request = factory.open(`satisfactory-belt:${import.meta.env.BASE_URL}`, 1);
    request.addEventListener("upgradeneeded", () => request.result.createObjectStore("plans"));
    request.addEventListener("success", () => resolve(request.result));
  });
  await new Promise<void>((resolve) => {
    const tx = database.transaction("plans", "readwrite");
    tx.objectStore("plans").put(value, "current");
    tx.addEventListener("complete", () => resolve());
  });
  database.close();
}

it("makes the existing single autosave available as Factory 1", async () => {
  const factory = new IDBFactory();
  const original = createReferencePlans();
  await seedCurrent(factory, { version: 2, document: original });
  const store = await createBrowserPlanStore(factory);
  expect(await store.list()).toEqual([{ id: "current", name: "Factory 1", updatedAt: 0 }]);
  expect((await store.loadActive())?.document).toEqual(original);
  await store.save("current", empty);
  expect((await store.load("current"))?.name).toBe("Factory 1");
  await store.delete("current");
  expect(await store.loadActive()).toBeUndefined();
  store.close();
});

it.each([1, 99])("skips unsupported version %s", async (version) => {
  const factory = new IDBFactory();
  await seedCurrent(factory, { version, document: empty });
  const store = await createBrowserPlanStore(factory);
  expect(await store.loadActive()).toBeUndefined();
  expect(await store.list()).toEqual([]);
  store.close();
});

it("reports corrupt records instead of replacing them", async () => {
  const factory = new IDBFactory();
  await seedCurrent(factory, { version: 2, document: { nodes: "broken", links: [] } });
  await expect(createBrowserPlanStore(factory)).rejects.toThrow("not been overwritten");
});

it("retains the last saved document on write failure and recovers on the next edit", async () => {
  const store = await createBrowserPlanStore(new IDBFactory());
  const initial = createReferencePlans();
  const saved = await store.create("First", initial);
  const history = new EditHistory<FactoryDocument>(initial);
  const status = vi.fn();
  const stop = startPlanAutosave(
    history,
    { save: (document) => store.save(saved.id, document) },
    status,
  );
  await store.load(saved.id);
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
    throw new DOMException("Storage full", "QuotaExceededError");
  });
  history.update(() => empty);
  expect((await store.load(saved.id))?.document).toEqual(initial);
  expect(status).toHaveBeenLastCalledWith(expect.stringContaining("could not be saved"));
  history.undo();
  history.redo();
  expect((await store.load(saved.id))?.document).toEqual(empty);
  expect(status).toHaveBeenLastCalledWith(null);
  stop();
  store.close();
});

it("rolls back a failed Save as new without changing the selected factory", async () => {
  const store = await createBrowserPlanStore(new IDBFactory());
  const saved = await store.create("First", empty);
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
    throw new DOMException("Storage full", "QuotaExceededError");
  });
  await expect(store.create("Copy", empty)).rejects.toThrow("Storage full");
  expect((await store.loadActive())?.id).toBe(saved.id);
  expect(await store.list()).toHaveLength(1);
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
  history.update(() => empty);
  await vi.waitFor(() =>
    expect(status).toHaveBeenCalledWith(expect.stringContaining("could not be saved")),
  );
  first.resolve();
  await first.promise;
  expect(status).toHaveBeenCalledTimes(1);
  stop();
});

it("overwrites an existing factory, keeps its name and identity, and restores it as active", async () => {
  const factory = new IDBFactory();
  const store = await createBrowserPlanStore(factory);
  const original = createReferencePlans();
  const source = await store.create("Source", original);
  const target = await store.create("Target", empty);
  await store.select(source.id);
  const overwritten = await store.overwrite(target.id, original);
  expect(overwritten).toMatchObject({ id: target.id, name: "Target" });
  expect(await store.list()).toHaveLength(2);
  await store.save(target.id, empty);
  expect((await store.load(source.id))?.document).toEqual(original);
  store.close();
  const reopened = await createBrowserPlanStore(factory);
  expect((await reopened.loadActive())?.id).toBe(target.id);
  expect((await reopened.load(target.id))?.document).toEqual(empty);
  reopened.close();
});

it("rolls back document, details and active selection when overwriting fails", async () => {
  const store = await createBrowserPlanStore(new IDBFactory());
  const source = await store.create("Source", createReferencePlans());
  const target = await store.create("Target", empty);
  await store.select(source.id);
  const details = await store.list();
  // oxlint-disable-next-line typescript/unbound-method -- Call the original with its object store below.
  const put = IDBObjectStore.prototype.put;
  const failing = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore, value, key) {
      if (key === "active-factory") throw new DOMException("Storage full", "QuotaExceededError");
      return put.call(this, value, key);
    });
  await expect(store.overwrite(target.id, createReferencePlans())).rejects.toThrow("Storage full");
  failing.mockRestore();
  expect((await store.loadActive())?.id).toBe(source.id);
  expect((await store.load(target.id))?.document).toEqual(empty);
  expect(await store.list()).toEqual(details);
  await store.delete(target.id);
  await expect(store.overwrite(target.id, empty)).rejects.toThrow("no longer saved");
  store.close();
});

it("rejects duplicate names after trimming without changing documents or active selection", async () => {
  const factory = new IDBFactory();
  const store = await createBrowserPlanStore(factory);
  const original = createReferencePlans();
  const saved = await store.create("Iron factory", original);
  const active = await store.create("Other factory", empty);
  await expect(store.create(" Iron factory ", empty)).rejects.toThrow("already exists");
  expect((await store.load(saved.id))?.document).toEqual(original);
  expect((await store.loadActive())?.id).toBe(active.id);
  expect(await store.list()).toHaveLength(2);
  store.close();
  const reopened = await createBrowserPlanStore(factory);
  await expect(reopened.create("Iron factory", empty)).rejects.toThrow("already exists");
  reopened.close();
});

it("serializes same-name creation across connections so only one factory is created", async () => {
  const factory = new IDBFactory();
  const first = await createBrowserPlanStore(factory);
  const second = await createBrowserPlanStore(factory);
  const results = await Promise.allSettled([
    first.create("Factory", empty),
    second.create(" Factory ", createReferencePlans()),
  ]);
  expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
  expect(await first.list()).toHaveLength(1);
  expect((await first.loadActive())?.document).toEqual(empty);
  first.close();
  second.close();
});

it("renames only the saved name, preserves selection and document, and keeps it after reopening", async () => {
  const factory = new IDBFactory();
  const store = await createBrowserPlanStore(factory);
  const saved = await store.create("Iron", createReferencePlans());
  const active = await store.create("Other", empty);
  const original = await store.load(saved.id);
  const renamed = await store.rename(saved.id, " Steel ");
  expect(renamed).toEqual({ ...saved, name: "Steel" });
  expect(await store.load(saved.id)).toEqual({ ...original, name: "Steel" });
  expect((await store.loadActive())?.id).toBe(active.id);
  await store.select(saved.id);
  await store.save(saved.id, empty);
  store.close();
  const reopened = await createBrowserPlanStore(factory);
  expect(await reopened.loadActive()).toMatchObject({
    id: saved.id,
    name: "Steel",
    document: empty,
  });
  reopened.close();
});

it("rejects blank, duplicate and deleted rename targets, and rolls back a failed rename", async () => {
  const store = await createBrowserPlanStore(new IDBFactory());
  const saved = await store.create("Iron", createReferencePlans());
  await store.create("Copper", empty);
  const before = await store.load(saved.id);
  await expect(store.rename(saved.id, " ")).rejects.toThrow("name");
  await expect(store.rename(saved.id, " Copper ")).rejects.toThrow("already exists");
  await expect(store.rename("missing", "Steel")).rejects.toThrow("no longer saved");
  expect(await store.rename(saved.id, " Iron ")).toEqual(saved);
  // oxlint-disable-next-line typescript/unbound-method -- Call the original with its object store below.
  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(
    function (this: IDBObjectStore, value, key) {
      if (this.name === "factory-details")
        throw new DOMException("Storage full", "QuotaExceededError");
      return put.call(this, value, key);
    },
  );
  await expect(store.rename(saved.id, "Steel")).rejects.toThrow("Storage full");
  expect(await store.load(saved.id)).toEqual(before);
  expect((await store.list()).find((entry) => entry.id === saved.id)).toEqual(saved);
  expect((await store.loadActive())?.name).toBe("Copper");
  store.close();
});

it("enforces unique rename destinations across simultaneous tabs", async () => {
  const factory = new IDBFactory();
  const first = await createBrowserPlanStore(factory);
  const second = await createBrowserPlanStore(factory);
  const iron = await first.create("Iron", empty);
  const copper = await second.create("Copper", createReferencePlans());
  const results = await Promise.allSettled([
    first.rename(iron.id, "Steel"),
    second.rename(copper.id, " Steel "),
  ]);
  expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
  expect((await first.list()).map((entry) => entry.name).toSorted()).toEqual(["Copper", "Steel"]);
  first.close();
  second.close();
});
