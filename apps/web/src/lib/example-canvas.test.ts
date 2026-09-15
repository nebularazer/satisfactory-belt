import { nodeBounds } from "@satisfactory-belt/factory-core";
import type { ManufacturingNode } from "@satisfactory-belt/factory-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";
import { expect, it } from "vitest";

import { createExampleCanvas as createCanvas } from "./example-canvas";

it("deletes a group in one edit and restores its items, order, and selection on undo", () => {
  const { controller, history, historyCommand, deleteSelection } = createExampleCanvas();
  const original = history.getSnapshot().state;
  const selection = new Set(["machine-1", "machine-3"]);
  controller.setSelection(selection);
  controller.zoomTo(2);
  controller.setGridSnapping(false);
  const { camera } = controller.getSnapshot();
  deleteSelection();
  const deleted = history.getSnapshot().state;
  expect(deleted).toEqual(original.filter((item) => !selection.has(item.id)));
  expect(controller.getSnapshot().selection.size).toBe(0);
  controller.setSelection(new Set(["machine-2"]));
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
  controller.setSelection(new Set(["machine-1"]));
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
  expect(controller.getSnapshot().items).toEqual(original.map(nodeBounds));
  expect(history.getSnapshot().canUndo).toBe(false);
  expect(controller.getSnapshot()).toMatchObject({ camera, selection, gridSnapping: false });
  historyCommand("redo");
  expect(controller.getSnapshot().items).toEqual(moved.map(nodeBounds));
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
  controller.setSelection(new Set(["machine-1"]));
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
  controller.setSelection(new Set(["machine-1"]));
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
    recipeId: "Recipe",
    sloopsUsed: 1,
    clockPercent: 125,
    x: 192,
    y: 192,
  });
  expect(createExampleCanvas().history.getSnapshot().state).toHaveLength(6);
});

function createExampleCanvas() {
  const catalog: GameCatalog = {
    schemaVersion: 1,
    extractors: {},
    logistics: {},
    source: { locale: "en", docsSha256: "a".repeat(64) },
    items: {
      Desc_WAT1_C: {
        id: "Desc_WAT1_C",
        name: "Somersloop",
        description: "",
        form: "solid",
        unit: "item",
        iconId: "sloop",
      },
    },
    machines: {
      Machine: {
        id: "Machine",
        name: "Assembler",
        description: "",
        descriptorId: "Descriptor",
        iconId: "machine",
        manufacturingSpeed: 1,
        power: { kind: "fixed", megawatts: 15 },
        powerConsumptionExponent: 1.321929,
        canOverclock: true,
        sloopSlots: 2,
        productionBoost: { base: 1, perSloop: 0.5, powerExponent: 2 },
      },
    },
    recipes: {
      Recipe: {
        id: "Recipe",
        name: "Recipe",
        durationSeconds: 12,
        ingredients: [],
        products: [{ itemId: "Desc_WAT1_C", amount: 1 }],
        machineIds: ["Machine"],
        alternate: false,
        events: [],
        variablePower: { constantMegawatts: 0, factorMegawatts: 1 },
      },
    },
    fixedProducers: {},
  };
  const nodes: ManufacturingNode[] = Array.from({ length: 6 }, (_, index) => ({
    kind: "manufacturing",
    id: `machine-${index + 1}`,
    recipeId: "Recipe",
    machineId: "Machine",
    machineCount: 3,
    clockPercent: 125,
    sloopsUsed: 1,
    x: (5 + (index % 3) * 9) * 32,
    y: (5 + Math.floor(index / 3) * 10) * 32,
  }));
  return { ...createCanvas(catalog, nodes), catalog };
}

it("reuses card content on movement and publishes new content before geometry notifications", () => {
  const { controller, history, getDisplay } = createExampleCanvas();
  const display = getDisplay("machine-1");
  controller.setSelection(new Set(["machine-1"]));
  controller.command("move-right");
  expect(getDisplay("machine-1")).toBe(display);
  let observed: string | undefined;
  const unsubscribe = controller.subscribe(() => {
    const current = getDisplay("machine-1");
    observed = current?.layout === "machine" ? current.subtitle : undefined;
  });
  history.update((nodes) =>
    nodes.map((node) => (node.id === "machine-1" ? { ...node, machineCount: 4 } : node)),
  );
  expect(observed).toBe("4× Assembler");
  expect(getDisplay("machine-1")).not.toBe(display);
  unsubscribe();
});

it("preserves logistics identity and compact bounds through editing beside machines", () => {
  const {
    catalog,
    controller,
    history,
    clipboardCommand,
    historyCommand,
    getDisplay,
    deleteSelection,
  } = createExampleCanvas();
  for (const kind of ["splitter", "merger"] as const)
    catalog.logistics[kind] = {
      id: kind,
      name: kind,
      kind,
      description: "",
      descriptorId: kind,
      iconId: kind,
    };
  const node = { kind: "logistics", id: "splitter", partId: "splitter", x: 1024, y: 160 } as const;
  history.update((nodes) => [...nodes, node]);
  expect(controller.getSnapshot().items.find((item) => item.id === node.id)).toMatchObject({
    width: 128,
    height: 128,
  });
  controller.setSelection(new Set([node.id]));
  const display = getDisplay(node.id);
  controller.command("move-right");
  expect(getDisplay(node.id)).toBe(display);
  clipboardCommand("copy");
  clipboardCommand("paste");
  const pasted = history.getSnapshot().state.at(-1)!;
  expect(pasted).toMatchObject({ ...node, id: expect.any(String), x: 1072, y: 192 });
  expect(pasted.id).not.toBe(node.id);
  deleteSelection();
  expect(getDisplay(pasted.id)).toBeUndefined();
  historyCommand("undo");
  expect(getDisplay(pasted.id)).toEqual(display);
  historyCommand("redo");
  expect(getDisplay(pasted.id)).toBeUndefined();
  history.update((nodes) =>
    nodes.map((entry) => (entry.kind === "logistics" ? { ...entry, partId: "merger" } : entry)),
  );
  expect(getDisplay(node.id)?.ports.filter((port) => port.direction === "input")).toHaveLength(3);
});

it("retains extraction settings through movement, copy/paste and undo and refreshes resource changes", () => {
  const { catalog, controller, history, clipboardCommand, historyCommand, getDisplay } =
    createExampleCanvas();
  for (const id of ["Iron", "Copper"])
    catalog.items[id] = {
      id,
      name: `${id} Ore`,
      description: "",
      form: "solid",
      unit: "item",
      iconId: id,
    };
  catalog.extractors.Miner = {
    id: "Miner",
    name: "Miner Mk.1",
    description: "",
    descriptorId: "Desc_Miner",
    iconId: "miner-icon",
    resourceIds: ["Iron", "Copper"],
    powerMegawatts: 5,
    powerConsumptionExponent: 1.321929,
    canOverclock: true,
  };
  const miner = {
    kind: "extractor",
    id: "miner",
    extractorId: "Miner",
    resourceId: "Iron",
    machineCount: 2,
    clockPercent: 125,
    x: 160,
    y: 160,
  } as const;
  history.update(() => [miner]);
  controller.setSelection(new Set([miner.id]));
  const display = getDisplay(miner.id);
  controller.command("move-right");
  expect(getDisplay(miner.id)).toBe(display);
  clipboardCommand("copy");
  clipboardCommand("paste");
  const pasted = history.getSnapshot().state.at(-1)!;
  expect(pasted).toMatchObject({ ...miner, id: expect.any(String), x: 208, y: 192 });
  expect(pasted.id).not.toBe(miner.id);
  historyCommand("undo");
  expect(history.getSnapshot().state).toHaveLength(1);
  historyCommand("redo");
  expect(history.getSnapshot().state.at(-1)).toEqual(pasted);
  history.update((nodes) =>
    nodes.map((node) => (node.kind === "extractor" ? { ...node, resourceId: "Copper" } : node)),
  );
  expect(getDisplay(miner.id)?.title).toBe("Copper Ore");
  expect(getDisplay(miner.id)?.ports[0]?.iconId).toBe("Copper");
});
