import { nodeBounds } from "@satisfactory-belt/factory-core";
import type { ManufacturingNode } from "@satisfactory-belt/factory-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";
import { expect, it } from "vitest";

import { createFactoryEditor } from "./factory-editor";

it("starts an explicitly empty document without requiring any demo recipes", () => {
  const catalog: GameCatalog = {
    schemaVersion: 1,
    source: { locale: "en", docsSha256: "a".repeat(64) },
    items: {},
    recipes: {},
    machines: {},
    fixedProducers: {},
    extractors: {},
    logistics: {},
    sinks: {},
  };
  const editor = createFactoryEditor(catalog, []);
  expect(editor.history.getSnapshot().state.nodes).toEqual([]);
  expect(editor.controller.getSnapshot().items).toEqual([]);
  editor.clipboardCommand("paste");
  editor.deleteSelection();
  expect(editor.history.getSnapshot().canUndo).toBe(false);
});

it("deletes a group in one edit and restores its items, order, and selection on undo", () => {
  const { controller, history, historyCommand, deleteSelection } = createTestEditor();
  const original = history.getSnapshot().state.nodes;
  const selection = new Set(["machine-1", "machine-3"]);
  controller.setSelection(selection);
  controller.zoomTo(2);
  controller.setGridSnapping(false);
  const { camera } = controller.getSnapshot();
  deleteSelection();
  const deleted = history.getSnapshot().state.nodes;
  expect(deleted).toEqual(original.filter((item) => !selection.has(item.id)));
  expect(controller.getSnapshot().selection.size).toBe(0);
  controller.setSelection(new Set(["machine-2"]));
  historyCommand("undo");
  expect(history.getSnapshot().state.nodes).toBe(original);
  expect(history.getSnapshot().canUndo).toBe(false);
  expect(controller.getSnapshot()).toMatchObject({ selection, camera, gridSnapping: false });
  historyCommand("redo");
  expect(history.getSnapshot().state.nodes).toBe(deleted);
  expect(controller.getSnapshot().selection.size).toBe(0);
  historyCommand("undo");
  expect(controller.getSnapshot().selection).toEqual(selection);
});

it("ignores deletion without selection and during gestures without adding history", () => {
  const { controller, history, historyCommand, deleteSelection } = createTestEditor();
  const original = history.getSnapshot().state.nodes;
  deleteSelection();
  expect(history.getSnapshot().state.nodes).toBe(original);
  expect(history.getSnapshot().canUndo).toBe(false);
  controller.setSelection(new Set(["machine-1"]));
  controller.pointerDown({ id: 1, x: 200, y: 200 });
  controller.pointerMove({ id: 1, x: 232, y: 200 });
  deleteSelection();
  expect(history.getSnapshot().state.nodes).toBe(original);
  expect(controller.getSnapshot().interaction).toBe("drag");
  controller.cancel();
  deleteSelection();
  deleteSelection();
  historyCommand("undo");
  expect(history.getSnapshot().state.nodes).toBe(original);
  expect(history.getSnapshot().canUndo).toBe(false);
  controller.command("escape");
  deleteSelection();
  expect(history.getSnapshot().canRedo).toBe(true);
});

it("keeps copied items after deletion and records paste and delete independently", () => {
  const { controller, history, historyCommand, clipboardCommand, deleteSelection } =
    createTestEditor();
  const original = history.getSnapshot().state.nodes;
  controller.setSelection(new Set(original.map((item) => item.id)));
  clipboardCommand("copy");
  deleteSelection();
  expect(controller.getSnapshot().items).toEqual([]);
  clipboardCommand("paste");
  const pasted = history.getSnapshot().state.nodes;
  expect(pasted).toHaveLength(original.length);
  expect(pasted.every((item) => !original.some((source) => source.id === item.id))).toBe(true);
  historyCommand("undo");
  expect(controller.getSnapshot().items).toEqual([]);
  historyCommand("undo");
  expect(history.getSnapshot().state.nodes).toBe(original);
  expect(controller.getSnapshot().selection).toEqual(new Set(original.map((item) => item.id)));
  deleteSelection();
  expect(history.getSnapshot().canRedo).toBe(false);
});

it("records a group drag once, retaining selection, camera, and preferences through undo", () => {
  const { controller, history, historyCommand } = createTestEditor();
  const original = history.getSnapshot().state.nodes;
  controller.pointerDown({ id: 1, x: 100, y: 100, marquee: true });
  controller.pointerUp({ id: 1, x: 750, y: 300 });
  controller.pointerDown({ id: 1, x: 200, y: 200 });
  controller.pointerMove({ id: 1, x: 232, y: 216 });
  expect(history.getSnapshot().canUndo).toBe(false);
  controller.pointerUp({ id: 1, x: 248, y: 232 });
  const moved = history.getSnapshot().state.nodes;
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
  const { controller, history, historyCommand } = createTestEditor();
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
  const { controller, history, historyCommand, clipboardCommand } = createTestEditor();
  const original = history.getSnapshot().state.nodes;
  controller.setSelection(new Set([original[0]!.id, original[1]!.id]));
  clipboardCommand("copy");
  expect(history.getSnapshot().canUndo).toBe(false);
  clipboardCommand("paste");
  const pasted = history.getSnapshot().state.nodes.slice(original.length);
  expect(pasted).toHaveLength(2);
  pasted.forEach((item, index) => {
    expect(item).toEqual({
      ...original[index],
      id: expect.any(String),
      x: original[index]!.x + 32,
      y: original[index]!.y + 32,
    });
  });
  expect(new Set(history.getSnapshot().state.nodes.map((item) => item.id)).size).toBe(8);
  expect(controller.getSnapshot().selection).toEqual(new Set(pasted.map((item) => item.id)));
  historyCommand("undo");
  expect(history.getSnapshot().state.nodes).toBe(original);
  expect(history.getSnapshot().canUndo).toBe(false);
  expect(controller.getSnapshot().selection.size).toBe(0);
  historyCommand("redo");
  expect(history.getSnapshot().state.nodes.slice(original.length)).toEqual(pasted);
});

it("retains copied geometry after moving originals and advances each paste independently of zoom", () => {
  const { controller, history, historyCommand, clipboardCommand } = createTestEditor();
  controller.setSelection(new Set(["machine-1"]));
  clipboardCommand("copy");
  controller.command("move-right");
  controller.zoomTo(2);
  clipboardCommand("paste");
  const first = history.getSnapshot().state.nodes.at(-1)!;
  expect(first).toMatchObject({ x: 192, y: 192 });
  clipboardCommand("paste");
  const second = history.getSnapshot().state.nodes.at(-1)!;
  expect(second).toMatchObject({ x: 224, y: 224 });
  expect(second.id).not.toBe(first.id);
  historyCommand("undo");
  expect(history.getSnapshot().state.nodes.at(-1)).toBe(first);
  clipboardCommand("paste");
  expect(history.getSnapshot().state.nodes.at(-1)).toMatchObject({ x: 256, y: 256 });
  expect(history.getSnapshot().state.nodes.at(-1)!.id).not.toBe(second.id);
  expect(history.getSnapshot().canRedo).toBe(false);
  clipboardCommand("copy");
  clipboardCommand("paste");
  expect(history.getSnapshot().state.nodes.at(-1)).toMatchObject({ x: 288, y: 288 });
});

it.each([true, false])("pastes off-grid groups with grid snapping %s", (gridSnapping) => {
  const { updateNodes, controller, history, clipboardCommand } = createTestEditor();
  updateNodes((items) =>
    items.map((item, index) => ({
      ...item,
      x: item.x + 3 + index,
      y: item.y - 5 - index,
    })),
  );
  const originals = history.getSnapshot().state.nodes.slice(0, 2);
  controller.setSelection(new Set(originals.map((item) => item.id)));
  clipboardCommand("copy");
  controller.setGridSnapping(gridSnapping);
  clipboardCommand("paste");
  const pasted = history.getSnapshot().state.nodes.slice(-2);
  expect(pasted[0]).toMatchObject(gridSnapping ? { x: 192, y: 193 } : { x: 195, y: 187 });
  expect(pasted[1]!.x - pasted[0]!.x).toBe(originals[1]!.x - originals[0]!.x);
  expect(pasted[1]!.y - pasted[0]!.y).toBe(originals[1]!.y - originals[0]!.y);
});

it("ignores empty clipboards, empty selections, and clipboard commands during a gesture", () => {
  const { controller, history, clipboardCommand } = createTestEditor();
  const original = history.getSnapshot().state.nodes;
  clipboardCommand("paste");
  clipboardCommand("copy");
  clipboardCommand("paste");
  expect(history.getSnapshot().state.nodes).toBe(original);
  controller.setSelection(new Set(["machine-1"]));
  clipboardCommand("copy");
  controller.command("escape");
  clipboardCommand("copy");
  controller.pointerDown({ id: 1, x: 500, y: 200 });
  controller.pointerMove({ id: 1, x: 532, y: 200 });
  clipboardCommand("copy");
  clipboardCommand("paste");
  expect(history.getSnapshot().state.nodes).toBe(original);
  controller.cancel();
  clipboardCommand("paste");
  expect(history.getSnapshot().state.nodes.at(-1)).toMatchObject({
    recipeId: "Recipe",
    sloopsUsed: 1,
    clockPercent: 125,
    x: 192,
    y: 192,
  });
  expect(createTestEditor().history.getSnapshot().state.nodes).toHaveLength(6);
});

function createTestEditor() {
  const catalog: GameCatalog = {
    schemaVersion: 1,
    extractors: {},
    logistics: {},
    sinks: {},
    source: { locale: "en", docsSha256: "a".repeat(64) },
    items: {
      Desc_WAT1_C: {
        id: "Desc_WAT1_C",
        name: "Somersloop",
        description: "",
        form: "solid",
        sinkable: false,
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
  return { ...createFactoryEditor(catalog, nodes), catalog };
}

it("reuses card content on movement and publishes new content before geometry notifications", () => {
  const { updateNodes, controller, getDisplay } = createTestEditor();
  const display = getDisplay("machine-1");
  controller.setSelection(new Set(["machine-1"]));
  controller.command("move-right");
  expect(getDisplay("machine-1")).toBe(display);
  let observed: string | undefined;
  const unsubscribe = controller.subscribe(() => {
    const current = getDisplay("machine-1");
    observed = current?.layout === "machine" ? current.subtitle : undefined;
  });
  updateNodes((nodes) =>
    nodes.map((node) => (node.id === "machine-1" ? { ...node, machineCount: 4 } : node)),
  );
  expect(observed).toBe("4× Assembler");
  expect(getDisplay("machine-1")).not.toBe(display);
  unsubscribe();
});

it("preserves logistics identity and compact bounds through editing beside machines", () => {
  const {
    updateNodes,
    catalog,
    controller,
    history,
    clipboardCommand,
    historyCommand,
    getDisplay,
    deleteSelection,
  } = createTestEditor();
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
  updateNodes((nodes) => [...nodes, node]);
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
  const pasted = history.getSnapshot().state.nodes.at(-1)!;
  expect(pasted).toMatchObject({ ...node, id: expect.any(String), x: 1072, y: 192 });
  expect(pasted.id).not.toBe(node.id);
  deleteSelection();
  expect(getDisplay(pasted.id)).toBeUndefined();
  historyCommand("undo");
  expect(getDisplay(pasted.id)).toEqual(display);
  historyCommand("redo");
  expect(getDisplay(pasted.id)).toBeUndefined();
  updateNodes((nodes) =>
    nodes.map((entry) => (entry.kind === "logistics" ? { ...entry, partId: "merger" } : entry)),
  );
  expect(getDisplay(node.id)?.ports.filter((port) => port.direction === "input")).toHaveLength(3);
});

it("retains extraction settings through movement, copy/paste and undo and refreshes resource changes", () => {
  const {
    updateNodes,
    catalog,
    controller,
    history,
    clipboardCommand,
    historyCommand,
    getDisplay,
  } = createTestEditor();
  for (const id of ["Iron", "Copper"])
    catalog.items[id] = {
      id,
      name: `${id} Ore`,
      description: "",
      form: "solid",
      sinkable: false,
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
  updateNodes(() => [miner]);
  controller.setSelection(new Set([miner.id]));
  const display = getDisplay(miner.id);
  controller.command("move-right");
  expect(getDisplay(miner.id)).toBe(display);
  clipboardCommand("copy");
  clipboardCommand("paste");
  const pasted = history.getSnapshot().state.nodes.at(-1)!;
  expect(pasted).toMatchObject({ ...miner, id: expect.any(String), x: 208, y: 192 });
  expect(pasted.id).not.toBe(miner.id);
  historyCommand("undo");
  expect(history.getSnapshot().state.nodes).toHaveLength(1);
  historyCommand("redo");
  expect(history.getSnapshot().state.nodes.at(-1)).toEqual(pasted);
  updateNodes((nodes) =>
    nodes.map((node) => (node.kind === "extractor" ? { ...node, resourceId: "Copper" } : node)),
  );
  expect(getDisplay(miner.id)?.title).toBe("Copper Ore");
  expect(getDisplay(miner.id)?.ports[0]?.iconId).toBe("Copper");
});

it("keeps transient port selection across movement and metadata edits, but clears removed ports", () => {
  const { updateNodes, controller, history, historyCommand, deleteSelection, catalog } =
    createTestEditor();
  const anchor = { nodeId: "machine-1", portKey: "output:Desc_WAT1_C" };
  controller.selectPort(anchor);
  expect(history.getSnapshot().canUndo).toBe(false);
  const compatible = controller.getPortSnapshot().compatible;
  controller.command("move-right");
  expect(controller.getPortSnapshot().anchor).toEqual(anchor);
  expect(controller.getPortSnapshot().compatible).toBe(compatible);
  historyCommand("undo");
  expect(controller.getPortSnapshot().anchor).toEqual(anchor);
  updateNodes((nodes) =>
    nodes.map((node) => (node.id === anchor.nodeId ? { ...node, machineCount: 5 } : node)),
  );
  expect(controller.getPortSnapshot().anchor).toEqual(anchor);
  deleteSelection();
  expect(controller.getPortSnapshot().anchor).toBeNull();
  historyCommand("undo");
  expect(controller.getPortSnapshot().anchor).toBeNull();
  controller.selectPort(anchor);
  catalog.recipes.Empty = { ...catalog.recipes.Recipe!, id: "Empty", products: [] };
  updateNodes((nodes) =>
    nodes.map((node) => (node.id === anchor.nodeId ? { ...node, recipeId: "Empty" } : node)),
  );
  expect(controller.getPortSnapshot().anchor).toBeNull();
});

it("connects logistics wildcard targets and removes links after slot changes", () => {
  const { updateNodes, controller, history, catalog } = createTestEditor();
  for (const kind of ["splitter", "merger"] as const)
    catalog.logistics[kind] = {
      id: kind,
      name: kind,
      kind,
      description: "",
      descriptorId: kind,
      iconId: kind,
    };
  updateNodes((nodes) => [
    ...nodes,
    { kind: "logistics", id: "logistics", partId: "merger", x: 1200, y: 160 },
  ]);
  const anchor = { nodeId: "machine-1", portKey: "output:Desc_WAT1_C" };
  const target = { nodeId: "logistics", portKey: "input:2" };
  controller.selectPort(anchor);
  expect(controller.getPortSnapshot().compatible.size).toBe(3);
  controller.selectPort(target);
  expect(history.getSnapshot().state.links).toHaveLength(1);
  expect(controller.getPortSnapshot().anchor).toBeNull();
  updateNodes((nodes) =>
    nodes.map((node) => (node.kind === "logistics" ? { ...node, partId: "splitter" } : node)),
  );
  expect(history.getSnapshot().state.links).toHaveLength(0);
  controller.selectPort(anchor);
  expect(controller.getPortSnapshot().compatible.size).toBe(1);
  controller.clearPorts();
  controller.selectPort({ nodeId: "logistics", portKey: "input:0" });
  expect(controller.getPortSnapshot().compatible.size).toBe(6);
});

function createLinkedEditor() {
  const editor = createTestEditor();
  editor.catalog.recipes.Consumer = {
    ...editor.catalog.recipes.Recipe!,
    id: "Consumer",
    ingredients: [{ itemId: "Desc_WAT1_C", amount: 1 }],
    products: [],
  };
  editor.updateNodes((nodes) =>
    nodes.map((node, index) =>
      index >= 2 && node.kind === "manufacturing" ? { ...node, recipeId: "Consumer" } : node,
    ),
  );
  const output = { nodeId: "machine-1", portKey: "output:Desc_WAT1_C" };
  const input = { nodeId: "machine-3", portKey: "input:Desc_WAT1_C" };
  return { ...editor, output, input };
}

it("commits links on the second port tap and supports fan-in/fan-out and independent undo", () => {
  const { controller, history, historyCommand, connect, output, input } = createLinkedEditor();
  const before = history.getSnapshot().state;
  controller.selectPort(input);
  expect(history.getSnapshot().state).toBe(before);
  controller.selectPort(output);
  expect(history.getSnapshot().state.links).toHaveLength(1);
  expect(controller.getPortSnapshot().anchor).toBeNull();
  const first = history.getSnapshot().state.links[0]!;
  expect(first).toMatchObject({ output, input });
  expect(connect(output, { ...input, nodeId: "machine-4" }).compatible).toBe(true);
  expect(connect({ ...output, nodeId: "machine-2" }, input).compatible).toBe(true);
  const connected = history.getSnapshot().state;
  expect(connect(input, output)).toEqual({ compatible: false, reason: "duplicate-link" });
  expect(history.getSnapshot().state).toBe(connected);
  historyCommand("undo");
  expect(history.getSnapshot().state.links).toHaveLength(2);
  historyCommand("undo");
  expect(history.getSnapshot().state.links).toEqual([first]);
  historyCommand("redo");
  expect(history.getSnapshot().state.links).toHaveLength(2);
});

it("deletes links with their nodes atomically and restores both with undo", () => {
  const { controller, history, historyCommand, deleteSelection, connect, output, input } =
    createLinkedEditor();
  connect(output, input);
  const connected = history.getSnapshot().state;
  controller.setSelection(new Set([output.nodeId]));
  deleteSelection();
  expect(history.getSnapshot().state.links).toHaveLength(0);
  expect(history.getSnapshot().state.nodes).toHaveLength(5);
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(connected);
  controller.selectLink(connected.links[0]!.id);
  deleteSelection();
  expect(history.getSnapshot().state.nodes).toHaveLength(6);
  expect(history.getSnapshot().state.links).toHaveLength(0);
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(connected);
});

it("copies internal links with remapped endpoints and translated route adjustments", () => {
  const { controller, history, clipboardCommand, connect, setRoute, output, input } =
    createLinkedEditor();
  connect(output, input);
  const original = history.getSnapshot().state.links[0]!;
  setRoute(original.id, [{ axis: "y", position: 96 }]);
  connect(output, { ...input, nodeId: "machine-4" });
  controller.setSelection(new Set([output.nodeId, input.nodeId]));
  clipboardCommand("copy");
  clipboardCommand("paste");
  const { nodes, links } = history.getSnapshot().state;
  expect(links).toHaveLength(3);
  const copied = links.at(-1)!;
  expect(copied.id).not.toBe(original.id);
  expect(copied.output).toEqual({ ...output, nodeId: nodes.at(-2)!.id });
  expect(copied.input).toEqual({ ...input, nodeId: nodes.at(-1)!.id });
  expect(copied.guides).toEqual([{ axis: "y", position: 128 }]);
});

it("retains manual constraints through endpoint movement and translates them with a group", () => {
  const { controller, history, historyCommand, connect, setRoute, output, input } =
    createLinkedEditor();
  connect(output, input);
  const id = history.getSnapshot().state.links[0]!.id;
  setRoute(id, [{ axis: "y", position: 96 }]);
  controller.setSelection(new Set([output.nodeId]));
  controller.command("move-down");
  expect(history.getSnapshot().state.links[0]!.guides).toEqual([{ axis: "y", position: 96 }]);
  const points = controller.getSnapshot().links[0]!.points;
  expect(points.some((point) => point.y === 96)).toBe(true);
  controller.setSelection(new Set([output.nodeId, input.nodeId]));
  controller.command("move-down");
  expect(history.getSnapshot().state.links[0]!.guides).toEqual([{ axis: "y", position: 112 }]);
  historyCommand("undo");
  expect(history.getSnapshot().state.links[0]!.guides).toEqual([{ axis: "y", position: 96 }]);
  setRoute(id);
  expect(history.getSnapshot().state.links[0]!.guides).toBeUndefined();
  historyCommand("undo");
  expect(history.getSnapshot().state.links[0]!.guides).toEqual([{ axis: "y", position: 96 }]);
});

it("reuses unaffected routes and material compatibility during movement and camera changes", () => {
  const { controller, history, connect, output, input } = createLinkedEditor();
  connect(output, input);
  const route = controller.getSnapshot().links[0];
  controller.selectPort(output);
  const compatible = controller.getPortSnapshot().compatible;
  controller.zoomTo(2);
  expect(controller.getSnapshot().links[0]).toBe(route);
  controller.command("move-right");
  expect(controller.getPortSnapshot().compatible).toBe(compatible);
  expect(controller.getSnapshot().links[0]).not.toBe(route);
  const movedRoute = controller.getSnapshot().links[0];
  controller.setSelection(new Set(["machine-6"]));
  controller.command("move-down");
  expect(controller.getSnapshot().links[0]).toBe(movedRoute);
  expect(history.getSnapshot().state.links).toHaveLength(1);
});

it("reconciles links removed by recipe changes in the same undo step", () => {
  const { history, historyCommand, connect, updateNodes, output, input } = createLinkedEditor();
  connect(output, input);
  const before = history.getSnapshot().state;
  updateNodes((nodes) =>
    nodes.map((node) =>
      node.id === input.nodeId && node.kind === "manufacturing"
        ? { ...node, recipeId: "Recipe" }
        : node,
    ),
  );
  expect(history.getSnapshot().state.links).toHaveLength(0);
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(before);
});

it("stores splitter programs, revalidates connected outputs and restores everything with undo", () => {
  const editor = createLinkedEditor();
  const {
    catalog,
    controller,
    history,
    historyCommand,
    connect,
    updateNodes,
    setSplitterProgram,
    clipboardCommand,
    output,
    input,
  } = editor;
  catalog.logistics.smart = {
    id: "smart",
    kind: "smart-splitter",
    name: "Smart Splitter",
    description: "",
    descriptorId: "desc",
    iconId: "icon",
  };
  updateNodes((nodes) => [
    ...nodes,
    { kind: "logistics", id: "smart-node", partId: "smart", x: 1600, y: 160 },
  ]);
  const center = { nodeId: "smart-node", portKey: "output:1" };
  expect(connect(output, { nodeId: "smart-node", portKey: "input:0" }).compatible).toBe(true);
  expect(connect(center, input).compatible).toBe(true);
  const before = history.getSnapshot().state;
  const program = {
    "output:0": [{ kind: "item", itemId: "Desc_WAT1_C" }],
    "output:1": [{ kind: "none" }],
    "output:2": [{ kind: "any-undefined" }],
  } as const;
  setSplitterProgram("smart-node", program);
  expect(history.getSnapshot().state.links).toHaveLength(1);
  expect(editor.getMaterials({ nodeId: "smart-node", portKey: "output:0" })).toEqual(
    new Set(["Desc_WAT1_C"]),
  );
  expect(connect(center, input)).toEqual({ compatible: false, reason: "disabled-output" });
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(before);
  historyCommand("redo");
  controller.setSelection(new Set(["smart-node"]));
  clipboardCommand("copy");
  clipboardCommand("paste");
  expect(history.getSnapshot().state.nodes.at(-1)).toMatchObject({
    kind: "logistics",
    partId: "smart",
    program,
  });
  const after = history.getSnapshot().state;
  expect(() =>
    setSplitterProgram("smart-node", {
      ...program,
      "output:0": [{ kind: "any" }, { kind: "none" }],
    }),
  ).toThrow("one rule");
  expect(history.getSnapshot().state).toBe(after);
});

it("uses Sink acceptance in the editor and preserves Sink nodes through copy, deletion and undo", () => {
  const editor = createTestEditor();
  const {
    catalog,
    history,
    controller,
    updateNodes,
    connect,
    clipboardCommand,
    deleteSelection,
    historyCommand,
    getDisplay,
  } = editor;
  catalog.sinks.sink = {
    id: "sink",
    name: "AWESOME Sink",
    description: "",
    descriptorId: "desc",
    iconId: "sink-icon",
    powerMegawatts: 30,
  };
  catalog.items.Iron = {
    id: "Iron",
    name: "Iron",
    description: "",
    form: "solid",
    unit: "item",
    iconId: "iron",
    sinkable: true,
  };
  catalog.recipes.Iron = {
    ...catalog.recipes.Recipe!,
    id: "Iron",
    products: [{ itemId: "Iron", amount: 1 }],
  };
  updateNodes((nodes) => [
    ...nodes.map((node) =>
      node.kind === "manufacturing" && node.id === "machine-1"
        ? { ...node, recipeId: "Iron" }
        : node,
    ),
    { kind: "sink", id: "sink-node", sinkId: "sink", machineCount: 2, x: 1600, y: 160 },
  ]);
  const input = { nodeId: "sink-node", portKey: "input:0" };
  expect(connect({ nodeId: "machine-1", portKey: "output:Iron" }, input).compatible).toBe(true);
  expect(connect({ nodeId: "machine-2", portKey: "output:Desc_WAT1_C" }, input)).toEqual({
    compatible: false,
    reason: "unsinkable-material",
  });
  expect(getDisplay("sink-node")).toMatchObject({ powerLabel: "60 MW" });
  controller.setSelection(new Set(["sink-node"]));
  clipboardCommand("copy");
  clipboardCommand("paste");
  const pasted = history.getSnapshot().state.nodes.at(-1)!;
  expect(pasted).toMatchObject({ kind: "sink", sinkId: "sink", machineCount: 2 });
  deleteSelection();
  historyCommand("undo");
  expect(history.getSnapshot().state.nodes.at(-1)).toEqual(pasted);
});

it("commits a port drag as one undoable connection without moving either node", () => {
  const { controller, history, historyCommand, getDisplay, output, input } = createLinkedEditor();
  const before = history.getSnapshot().state;
  const point = (ref: typeof output) => {
    const node = before.nodes.find((entry) => entry.id === ref.nodeId)!;
    const port = getDisplay(ref.nodeId)!.ports.find((entry) => entry.key === ref.portKey)!;
    return { id: 1, x: node.x + port.x, y: node.y + port.y };
  };
  controller.pointerDown(point(output));
  controller.pointerMove(point(input));
  expect(history.getSnapshot().state).toBe(before);
  expect(controller.getSnapshot().connectionPreview).not.toBeNull();
  controller.pointerUp(point(input));
  const connected = history.getSnapshot().state;
  expect(connected.links).toHaveLength(1);
  expect(connected.nodes).toBe(before.nodes);
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(before);
  historyCommand("redo");
  expect(history.getSnapshot().state).toBe(connected);
});
