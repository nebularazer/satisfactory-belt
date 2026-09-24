import {
  nodeBounds,
  routeTopology,
  createMachineMembers,
  resizeMachineGroup,
} from "@satisfactory-belt/factory-core";
import type { ManufacturingNode } from "@satisfactory-belt/factory-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";
import { expect, it } from "vitest";

import { createFactoryEditor } from "./factory-editor";
import { inspectorSummary, inspectorTarget } from "./inspector";

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
  const editor = createFactoryEditor(catalog, { nodes: [], links: [] });
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
    machines: Array.from({ length: 3 }, () => ({ sloopsUsed: 1, clockPercent: 125 })),
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
    machines: createMachineMembers(3, { clockPercent: 125, sloopsUsed: 1 }),
    x: (5 + (index % 3) * 9) * 32,
    y: (5 + Math.floor(index / 3) * 10) * 32,
  }));
  return { ...createFactoryEditor(catalog, { nodes, links: [] }), catalog };
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
    nodes.map((node) =>
      node.kind !== "logistics" && node.id === "machine-1"
        ? resizeMachineGroup(node, 4, () => crypto.randomUUID())
        : node,
    ),
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
    machines: createMachineMembers(2, { clockPercent: 125 }),
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
    nodes.map((node) =>
      node.kind !== "logistics" && node.id === anchor.nodeId
        ? resizeMachineGroup(node, 5, () => crypto.randomUUID())
        : node,
    ),
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

it("clears the entire canvas in one undoable edit and resets the view", () => {
  const { controller, history, historyCommand, clearCanvas, connect, output, input } =
    createLinkedEditor();
  connect(output, input);
  const original = history.getSnapshot().state;
  controller.selectLink(original.links[0]!.id);
  controller.zoomTo(2, { x: 200, y: 150 });
  controller.setGridSnapping(false);
  clearCanvas();
  expect(history.getSnapshot().state).toMatchObject({
    nodes: [],
    links: [],
    externalFlows: [],
    routes: [],
  });
  expect(controller.getSnapshot()).toMatchObject({
    items: [],
    links: [],
    selection: new Set(),
    camera: { x: 0, y: 0, zoom: 1 },
    gridSnapping: false,
    interaction: "idle",
  });
  expect(controller.getLinkSnapshot().selected).toBeNull();
  clearCanvas();
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(original);
  historyCommand("redo");
  expect(controller.getSnapshot().items).toEqual([]);
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
  controller.selectPort(center);
  expect(controller.getPortSnapshot().anchor).toEqual(center);
  setSplitterProgram("smart-node", program);
  expect(controller.getPortSnapshot().anchor).toBeNull();
  controller.selectPort(center);
  expect(controller.getPortSnapshot().anchor).toBeNull();
  expect(
    editor.getDisplay("smart-node")!.ports.find((port) => port.key === center.portKey)?.disabled,
  ).toBe(true);
  expect(history.getSnapshot().state.links).toHaveLength(1);
  expect(editor.getMaterials({ nodeId: "smart-node", portKey: "output:0" })).toEqual(
    new Set(["Desc_WAT1_C"]),
  );
  expect(connect(center, input)).toEqual({ compatible: false, reason: "disabled-output" });
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(before);
  controller.selectPort(center);
  expect(controller.getPortSnapshot().anchor).toEqual(center);
  historyCommand("redo");
  expect(controller.getPortSnapshot().anchor).toBeNull();
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
    {
      kind: "sink",
      id: "sink-node",
      sinkId: "sink",
      machines: createMachineMembers(2),
      x: 1600,
      y: 160,
    },
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
  expect(pasted).toMatchObject({
    kind: "sink",
    sinkId: "sink",
    machines: [{ clockPercent: 100 }, { clockPercent: 100 }],
  });
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
  expect(connected.nodes.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
    before.nodes.map(({ id, x, y }) => ({ id, x, y })),
  );
  historyCommand("undo");
  expect(history.getSnapshot().state).toBe(before);
  historyCommand("redo");
  expect(history.getSnapshot().state).toBe(connected);
});

it("places at the snapped center, publishes ports, and restores the same node on redo", () => {
  const editor = createTestEditor();
  const before = editor.history.getSnapshot().state;
  const node = editor.placeNode(
    { kind: "manufacturing", recipeId: "Recipe", machineId: "Machine" },
    { x: 503, y: 401 },
  );
  expect(node).toMatchObject({ x: 368, y: 272, machines: [{ clockPercent: 100, sloopsUsed: 0 }] });
  expect(editor.controller.getSnapshot().selection).toEqual(new Set([node.id]));
  expect(editor.getDisplay(node.id)?.ports).toHaveLength(1);
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state).toBe(before);
  editor.historyCommand("redo");
  expect(editor.history.getSnapshot().state.nodes.at(-1)).toBe(node);
});

it("adds and connects the first valid logistics port atomically, rejecting stale sources", () => {
  const editor = createTestEditor();
  editor.catalog.logistics.merger = {
    id: "merger",
    name: "Merger",
    descriptorId: "merger",
    kind: "merger",
    description: "",
    iconId: "merger",
  };
  const configuration = { kind: "logistics" as const, partId: "merger" };
  const source = { nodeId: "machine-1", portKey: "output:Desc_WAT1_C" };
  const before = editor.history.getSnapshot().state;
  expect(editor.canPlace(configuration, source)).toBe(true);
  editor.controller.setGridSnapping(false);
  const node = editor.placeNode(configuration, { x: 501, y: 399 }, source);
  expect(node).toMatchObject({ x: 437, y: 335 });
  const after = editor.history.getSnapshot().state;
  expect(after.links).toEqual([
    { id: expect.any(String), output: source, input: { nodeId: node.id, portKey: "input:0" } },
  ]);
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state).toBe(before);
  editor.historyCommand("redo");
  expect(editor.history.getSnapshot().state).toBe(after);
  expect(() =>
    editor.placeNode(configuration, { x: 0, y: 0 }, { ...source, nodeId: "missing" }),
  ).toThrow("no longer supports");
  expect(editor.history.getSnapshot().state).toBe(after);
});

it("filters consumers and producers by configured material and transport before atomic placement", () => {
  const { catalog } = createTestEditor();
  catalog.items.fluid = { ...catalog.items.Desc_WAT1_C!, id: "fluid", form: "liquid", unit: "m3" };
  catalog.recipes.Consumer = {
    ...catalog.recipes.Recipe!,
    id: "Consumer",
    ingredients: [{ itemId: "Desc_WAT1_C", amount: 1 }],
    products: [{ itemId: "fluid", amount: 1 }],
  };
  const producer = { kind: "manufacturing" as const, recipeId: "Recipe", machineId: "Machine" };
  const consumer = { ...producer, recipeId: "Consumer" };
  const editor = createFactoryEditor(catalog, { nodes: [], links: [] });
  const a = editor.placeNode(producer, { x: 0, y: 0 });
  const source = { nodeId: a.id, portKey: "output:Desc_WAT1_C" };
  expect(editor.canPlace(producer, source)).toBe(false);
  expect(editor.canPlace(consumer, source)).toBe(true);
  const b = editor.placeNode(consumer, { x: 400, y: 0 }, source);
  const input = { nodeId: b.id, portKey: "input:Desc_WAT1_C" };
  expect(editor.canPlace(producer, input)).toBe(true);
  expect(editor.canPlace(consumer, input)).toBe(false);
  editor.placeNode(producer, { x: -400, y: 0 }, input);
  expect(editor.history.getSnapshot().state.links.at(-1)?.input).toEqual(input);
  expect(editor.canPlace(consumer, { nodeId: b.id, portKey: "output:fluid" })).toBe(false);
});

it("inspects one grouped machine node, hides multi-selection, and follows delete/undo", () => {
  const editor = createTestEditor();
  const target = () => inspectorTarget(editor.controller.getSnapshot());
  expect(target()).toBeNull();
  editor.updateNodes((nodes) =>
    nodes.map((node) =>
      node.kind === "manufacturing" ? resizeMachineGroup(node, 5, () => crypto.randomUUID()) : node,
    ),
  );
  editor.controller.setSelection(new Set(["machine-1"]));
  const selected = target();
  expect(inspectorSummary(editor, selected)).toMatchObject({
    title: "Recipe",
    subtitle: "5× Assembler",
  });
  editor.controller.zoomTo(2);
  expect(target()).toBe(selected);
  editor.controller.setSelection(new Set(["machine-1", "machine-2"]));
  expect(target()).toBeNull();
  editor.controller.setSelection(new Set(["machine-1"]));
  editor.deleteSelection();
  expect(target()).toBeNull();
  expect(inspectorSummary(editor, selected)).toBeNull();
  editor.historyCommand("undo");
  expect(inspectorSummary(editor, target())).toMatchObject({ subtitle: "5× Assembler" });
});

it("inspects a link's transport and endpoints and drops deleted links", () => {
  const editor = createLinkedEditor();
  editor.connect(editor.output, editor.input);
  const link = editor.history.getSnapshot().state.links[0]!;
  editor.controller.selectLink(link.id);
  const target = inspectorTarget(editor.controller.getSnapshot());
  expect(inspectorSummary(editor, target)).toEqual({
    title: "Conveyor",
    subtitle: null,
    deleteLabel: "Delete link",
  });
  editor.deleteSelection();
  expect(inspectorTarget(editor.controller.getSnapshot())).toBeNull();
  expect(inspectorSummary(editor, target)).toBeNull();
});

it("commits All edits atomically, restores mixed settings with undo, and rejects invalid edits before publication", () => {
  const editor = createTestEditor();
  const node = editor.getNode("machine-1")!;
  if (node.kind !== "manufacturing") throw new Error("Expected a machine");
  editor.setOperatingSetting(node.id, node.machines[0]!.id, "clockPercent", 200);
  const mixed = editor.history.getSnapshot();
  editor.setOperatingSetting(node.id, "all", "clockPercent", 150);
  const uniform = editor.getNode(node.id)!;
  expect(
    uniform.kind !== "logistics" && uniform.machines.map((member) => member.clockPercent),
  ).toEqual([150, 150, 150]);
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state).toBe(mixed.state);
  expect(editor.getDisplay(node.id)).toMatchObject({ clockLabel: "Mixed" });
  editor.historyCommand("redo");
  const beforeInvalid = editor.history.getSnapshot();
  let notifications = 0;
  editor.history.subscribe(() => {
    notifications++;
  });
  expect(() => editor.setOperatingSetting(node.id, "all", "clockPercent", 999)).toThrow();
  expect(() => editor.setOperatingSetting(node.id, "missing", "sloopsUsed", 1)).toThrow();
  editor.setOperatingSetting(node.id, "all", "clockPercent", 150);
  expect(editor.history.getSnapshot()).toBe(beforeInvalid);
  expect(notifications).toBe(0);
});

it("keeps links and member identities through settings edits, count changes, and undo", () => {
  const editor = createLinkedEditor();
  editor.connect(editor.output, editor.input);
  const before = editor.history.getSnapshot().state;
  const node = editor.getNode(editor.output.nodeId)!;
  if (node.kind !== "manufacturing") throw new Error("Expected a machine");
  editor.setOperatingSetting(node.id, node.machines[0]!.id, "sloopsUsed", 2);
  editor.setMachineCount(node.id, 5);
  const after = editor.getNode(node.id)!;
  expect(
    after.kind !== "logistics" && after.machines.slice(0, 3).map((member) => member.id),
  ).toEqual(node.machines.map((member) => member.id));
  expect(editor.history.getSnapshot().state.links).toBe(before.links);
  editor.historyCommand("undo");
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state).toBe(before);
});

it("disables incompatible recipe changes and records compatible changes as one undo step", () => {
  const editor = createLinkedEditor();
  editor.connect(editor.output, editor.input);
  const node = editor.getNode(editor.output.nodeId)!;
  if (node.kind !== "manufacturing") throw new Error();
  editor.catalog.recipes.Alternative = {
    ...editor.catalog.recipes[node.recipeId]!,
    id: "Alternative",
    name: "Alternative",
    durationSeconds: 20,
  };
  editor.catalog.recipes.Incompatible = {
    ...editor.catalog.recipes[node.recipeId]!,
    id: "Incompatible",
    products: [],
  };
  const before = editor.history.getSnapshot();
  const bad = { ...node, recipeId: "Incompatible" };
  expect(editor.canReplaceNode(bad)).toBe(false);
  editor.replaceNode(bad);
  expect(editor.history.getSnapshot()).toBe(before);
  const next = { ...node, recipeId: "Alternative" };
  expect(editor.canReplaceNode(next)).toBe(true);
  editor.replaceNode(next);
  expect(editor.getNode(node.id)).toBe(next);
  expect(editor.history.getSnapshot().state.links).toBe(before.state.links);
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state).toBe(before.state);
});

it("records belt tiers without changing connections and preserves them through copy/paste and undo", () => {
  const editor = createLinkedEditor();
  editor.connect(editor.output, editor.input);
  const original = editor.history.getSnapshot().state;
  const id = original.links[0]!.id;
  editor.setLinkTier(id, 6);
  const configured = editor.history.getSnapshot();
  editor.setLinkTier(id, 6);
  expect(editor.history.getSnapshot()).toBe(configured);
  expect(editor.getLink(id)).toMatchObject({ tier: 6, output: editor.output, input: editor.input });
  expect(() => editor.setLinkTier(id, 7)).toThrow("Invalid transport tier");
  editor.controller.setSelection(new Set([editor.output.nodeId, editor.input.nodeId]));
  editor.clipboardCommand("copy");
  editor.clipboardCommand("paste");
  expect(editor.history.getSnapshot().state.links.at(-1)?.tier).toBe(6);
  editor.historyCommand("undo");
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state).toBe(original);
  const undone = editor.history.getSnapshot();
  editor.setLinkTier(id, 1);
  expect(editor.history.getSnapshot()).toBe(undone);
  expect(undone.canRedo).toBe(true);
});

function createTransportEditor() {
  const { catalog } = createTestEditor();
  const base = {
    description: "",
    descriptorId: "station",
    iconId: "station",
    powerMegawatts: 20,
    canOverclock: false,
    powerConsumptionExponent: 1,
    transport: "belt" as const,
    capacity: 48,
    fuels: [],
    resourceIds: [],
    baseRate: 0,
    loadFollowing: false,
  };
  catalog.buildings = {
    station: { ...base, id: "station", name: "Station", kind: "train-station" },
    platform: { ...base, id: "platform", name: "Platform", kind: "freight-platform" },
  };
  const editor = createFactoryEditor(catalog, { nodes: [], links: [] });
  const station = editor.placeNode({ kind: "facility", buildingId: "station" }, { x: 512, y: 512 });
  if (station.kind !== "facility") throw new Error();
  return { ...editor, catalog, station };
}

it("keeps shared research and routes through movement, cloning and deletion with undo", () => {
  const editor = createTransportEditor(),
    id = editor.station.id;
  editor.setDepotResearch({ speedLevel: 3, capacityLevel: 2 });
  const original = editor.history.getSnapshot().state,
    route = original.routes![0]!;
  editor.controller.setSelection(new Set([id]));
  editor.controller.pointerDown({ id: 1, x: 500, y: 500 });
  editor.controller.pointerMove({ id: 1, x: 532, y: 532 });
  editor.controller.pointerUp({ id: 1, x: 532, y: 532 });
  expect(editor.history.getSnapshot().state.depotResearch).toBe(original.depotResearch);
  expect(editor.history.getSnapshot().state.routes).toBe(original.routes);
  editor.clipboardCommand("copy");
  editor.clipboardCommand("paste");
  const pasted = editor.history.getSnapshot().state;
  const clone = pasted.nodes.at(-1)!;
  expect(clone).toMatchObject({
    kind: "facility",
    configuration: { routeId: pasted.routes![1]!.id },
  });
  expect(pasted.routes![1]!.id).not.toBe(route.id);
  expect(pasted.routes![1]!.stops[0]!.nodeId).toBe(clone.id);
  editor.controller.setSelection(new Set([id]));
  editor.deleteSelection();
  expect(
    editor.history
      .getSnapshot()
      .state.routes!.some((candidate) => candidate.stops.some((stop) => stop.nodeId === id)),
  ).toBe(false);
  expect(editor.history.getSnapshot().state.depotResearch).toBe(original.depotResearch);
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state).toBe(pasted);
});

function configurePlatform(
  editor: ReturnType<typeof createTransportEditor>,
  index: number,
  mode: "load" | "unload" = "unload",
) {
  const station = editor.getNode(editor.station.id);
  if (station?.kind !== "facility" || station.configuration.type !== "train-station")
    throw new Error();
  const platforms = [...station.configuration.platforms];
  platforms[index] = { buildingId: "platform", mode, materialId: null };
  editor.replaceNode({ ...station, configuration: { ...station.configuration, platforms } });
}

it("copies station-owned platforms and restores the whole station with undo", () => {
  const editor = createTransportEditor();
  configurePlatform(editor, 0);
  const before = editor.history.getSnapshot().state;
  editor.controller.setSelection(new Set([editor.station.id]));
  editor.clipboardCommand("copy");
  editor.clipboardCommand("paste");
  const clone = editor.history.getSnapshot().state.nodes.at(-1)!;
  expect(clone).toMatchObject({
    configuration: { platforms: [{ buildingId: "platform", mode: "unload" }] },
  });
  expect(editor.canReplaceNode(clone)).toBe(true);
  editor.controller.setSelection(new Set([editor.station.id]));
  editor.deleteSelection();
  expect(editor.getNode(editor.station.id)).toBeUndefined();
  editor.historyCommand("undo");
  expect(editor.getNode(editor.station.id)).toBe(before.nodes[0]);
});

const depart = (node: { id: string }) => ({ nodeId: node.id, portKey: "route:output" });
const arrive = (node: { id: string }) => ({ nodeId: node.id, portKey: "route:input" });

it("builds a three-stop route loop without mixing material streams and restores it with undo", () => {
  const editor = createTransportEditor();
  const a = editor.station;
  const b = editor.placeNode({ kind: "facility", buildingId: "station" }, { x: 1000, y: 500 });
  const c = editor.placeNode({ kind: "facility", buildingId: "station" }, { x: 1500, y: 500 });
  expect(editor.connect(depart(a), arrive(b)).compatible).toBe(true);
  expect(editor.connect(depart(a), arrive(c)).compatible).toBe(false);
  expect(editor.connect(depart(b), arrive(c)).compatible).toBe(true);
  expect(routeTopology(editor.history.getSnapshot().state, a.id)).toEqual({
    nodeIds: [a.id, b.id, c.id],
    closed: false,
  });
  const route = editor.history.getSnapshot().state.routes![0]!;
  editor.setRouteSettings({ ...route, vehicleCount: 3, roundTripSeconds: 300 });
  expect(editor.connect(depart(c), arrive(a)).compatible).toBe(true);
  const closed = editor.history.getSnapshot().state;
  expect(routeTopology(closed, a.id).closed).toBe(true);
  expect(closed.routes).toHaveLength(1);
  expect(closed.routes![0]).toMatchObject({ vehicleCount: 3, roundTripSeconds: 300 });
  expect(editor.getMaterials(depart(a)).size).toBe(0);
  const link = closed.links.at(-1)!;
  expect(() => editor.setLinkTier(link.id, 2)).toThrow("Invalid transport tier");
  editor.controller.setSelection(new Set());
  editor.controller.selectLink(link.id);
  editor.deleteSelection();
  expect(routeTopology(editor.history.getSnapshot().state, a.id).closed).toBe(false);
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state).toBe(closed);
  editor.controller.setSelection(new Set([a.id, b.id, c.id]));
  editor.clipboardCommand("copy");
  editor.clipboardCommand("paste");
  const cloned = editor.history.getSnapshot().state;
  const clonedIds = new Set(cloned.nodes.slice(-3).map((node) => node.id));
  const clonedTopology = routeTopology(cloned, cloned.nodes.at(-1)!.id);
  expect(clonedTopology.closed).toBe(true);
  expect(new Set(clonedTopology.nodeIds)).toEqual(clonedIds);
});

it("expands the station for four cars, exposes only car three and preserves connected ports", () => {
  const editor = createTransportEditor();
  expect(() =>
    editor.placeNode({ kind: "facility", buildingId: "platform" }, { x: 0, y: 0 }),
  ).toThrow("Configure freight platforms");
  const second = editor.placeNode({ kind: "facility", buildingId: "station" }, { x: 1000, y: 500 });
  editor.connect(depart(editor.station), arrive(second));
  editor.setRouteSettings({
    ...editor.history.getSnapshot().state.routes![0]!,
    freightCarCount: 4,
  });
  configurePlatform(editor, 2);
  const station = editor.getNode(editor.station.id);
  if (station?.kind !== "facility") throw new Error();
  const display = editor.getDisplay(station.id)!;
  expect(display).toMatchObject({
    height: 288,
    bodyRows: [
      { label: "1 · No transfer" },
      { label: "2 · No transfer" },
      { label: "3 · Freight" },
      { label: "4 · No transfer" },
    ],
  });
  expect(nodeBounds(station).height).toBe(288);
  expect(nodeBounds(editor.getNode(second.id)!).height).toBe(256);
  expect(display.ports.map((port) => port.key)).toEqual([
    "route:input",
    "route:output",
    "car:3:output:0",
    "car:3:output:1",
  ]);
  const target = editor.getNode(second.id);
  if (target?.kind !== "facility") throw new Error();
  if (target.configuration.type !== "train-station") throw new Error();
  editor.replaceNode({
    ...target,
    configuration: {
      ...target.configuration,
      platforms: [{ buildingId: "platform", mode: "load", materialId: null }, null, null, null],
    },
  });
  expect(
    editor.connect(
      { nodeId: station.id, portKey: "car:3:output:1" },
      { nodeId: target.id, portKey: "car:1:input:0" },
    ).compatible,
  ).toBe(true);
  const before = editor.history.getSnapshot().state;
  if (station.configuration.type !== "train-station") throw new Error();
  expect(
    editor.canReplaceNode({
      ...station,
      configuration: { ...station.configuration, platforms: [null, null, null, null] },
    }),
  ).toBe(false);
  expect(
    editor.canReplaceNode({
      ...station,
      configuration: {
        ...station.configuration,
        platforms: [null, null, { buildingId: "platform", mode: "load", materialId: null }, null],
      },
    }),
  ).toBe(false);
  expect(() => editor.setRouteSettings({ ...before.routes![0]!, freightCarCount: 2 })).toThrow(
    "assigned freight car",
  );
  editor.setRouteSettings({ ...before.routes![0]!, freightCarCount: 3 });
  expect(nodeBounds(editor.getNode(station.id)!).height).toBe(256);
  expect(editor.history.getSnapshot().state.links).toBe(before.links);
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state).toBe(before);
});

it("allows only one Space Elevator through placement and copy/paste", () => {
  const editor = createTransportEditor();
  editor.catalog.buildings!.elevator = {
    ...editor.catalog.buildings!.station!,
    id: "elevator",
    kind: "space-elevator",
  };
  const configuration = { kind: "facility", buildingId: "elevator" } as const;
  const elevator = editor.placeNode(configuration, { x: 0, y: 0 });
  expect(editor.canPlace(configuration)).toBe(false);
  expect(() => editor.placeNode(configuration, { x: 0, y: 0 })).toThrow("only one Space Elevator");
  editor.controller.setSelection(new Set([elevator.id, editor.station.id]));
  editor.clipboardCommand("copy");
  editor.clipboardCommand("paste");
  expect(editor.history.getSnapshot().state.nodes).toHaveLength(3);
  editor.controller.setSelection(new Set([elevator.id]));
  editor.deleteSelection();
  expect(editor.canPlace(configuration)).toBe(true);
});

it("keeps drone routes as two-port loops and rejects other transport and cargo ports", () => {
  const editor = createTransportEditor();
  editor.catalog.buildings!.drone = {
    ...editor.catalog.buildings!.station!,
    id: "drone",
    kind: "drone-port",
    fuels: [{ itemId: "Desc_WAT1_C", supplementalPerMinute: 0 }],
  };
  const a = editor.placeNode({ kind: "facility", buildingId: "drone" }, { x: 1000, y: 500 });
  const b = editor.placeNode({ kind: "facility", buildingId: "drone" }, { x: 1500, y: 500 });
  const c = editor.placeNode({ kind: "facility", buildingId: "drone" }, { x: 2000, y: 500 });
  expect(editor.getDisplay(a.id)!.ports.find((port) => port.key === "input:fuel")).toMatchObject({
    purpose: "fuel",
    transport: "belt",
  });
  expect(editor.connect(depart(a), arrive(editor.station)).compatible).toBe(false);
  expect(editor.connect(depart(a), { nodeId: b.id, portKey: "input:cargo" }).compatible).toBe(
    false,
  );
  expect(editor.connect(depart(a), arrive(b)).compatible).toBe(true);
  expect(editor.connect(depart(b), arrive(c)).compatible).toBe(false);
  expect(editor.connect(depart(c), arrive(a)).compatible).toBe(false);
  expect(editor.connect(depart(b), arrive(a)).compatible).toBe(true);
  expect(routeTopology(editor.history.getSnapshot().state, a.id).closed).toBe(true);
});

it("preserves redo and document identity when unchanged settings are submitted", () => {
  const editor = createTransportEditor();
  const route = editor.history.getSnapshot().state.routes![0]!;
  editor.setRouteSettings({ ...route, roundTripSeconds: 300 });
  editor.historyCommand("undo");
  const before = editor.history.getSnapshot();
  expect(before.canRedo).toBe(true);
  editor.setRouteSettings(structuredClone(before.state.routes![0]!));
  editor.setDepotResearch({ capacityLevel: 0, speedLevel: 0 });
  editor.replaceNode(structuredClone(before.state.nodes[0]!));
  editor.setMachineCount(editor.station.id, 1);
  expect(editor.history.getSnapshot()).toBe(before);
  editor.historyCommand("redo");
  expect(editor.history.getSnapshot().state.routes![0]!.roundTripSeconds).toBe(300);
});

it("caches Flow analysis across geometry edits and invalidates it for external rates and machine settings", () => {
  const editor = createTestEditor();
  const first = editor.getFlowAnalysis();
  editor.controller.setSelection(new Set(["machine-1"]));
  editor.controller.command("move-right");
  expect(editor.getFlowAnalysis()).toBe(first);
  const port = { nodeId: "machine-1", portKey: "output:Desc_WAT1_C" };
  editor.setExternalFlow(port, "Desc_WAT1_C", 28.125);
  const exported = editor.getFlowAnalysis();
  expect(exported).not.toBe(first);
  expect(exported.issues.some((issue) => issue.nodeId === "machine-1")).toBe(false);
  editor.setExternalFlow(port, "Desc_WAT1_C", 28.125);
  expect(editor.getFlowAnalysis()).toBe(exported);
  editor.setOperatingSetting("machine-1", "all", "clockPercent", 100);
  expect(editor.getFlowAnalysis()).not.toBe(exported);
  expect(editor.getFlowAnalysis().issues).toContainEqual(
    expect.objectContaining({ code: "missing-export", nodeId: "machine-1" }),
  );
  editor.historyCommand("undo");
  expect(editor.getFlowAnalysis().issues.some((issue) => issue.nodeId === "machine-1")).toBe(false);
});

it("copies, remaps, deletes and restores external declarations atomically with their groups", () => {
  const editor = createTestEditor();
  editor.setExternalFlow(
    { nodeId: "machine-1", portKey: "output:Desc_WAT1_C" },
    "Desc_WAT1_C",
    28.125,
  );
  editor.controller.setSelection(new Set(["machine-1"]));
  editor.clipboardCommand("copy");
  editor.clipboardCommand("paste");
  const pasted = editor.history.getSnapshot().state.nodes.at(-1)!;
  expect(editor.history.getSnapshot().state.externalFlows).toContainEqual({
    port: { nodeId: pasted.id, portKey: "output:Desc_WAT1_C" },
    itemId: "Desc_WAT1_C",
    perMinute: 28.125,
  });
  editor.deleteSelection();
  expect(editor.history.getSnapshot().state.externalFlows).toHaveLength(1);
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state.externalFlows).toHaveLength(2);
  const before = editor.history.getSnapshot();
  expect(() =>
    editor.setExternalFlow({ nodeId: "machine-1", portKey: "missing" }, "Desc_WAT1_C", 10),
  ).toThrow();
  expect(() =>
    editor.setExternalFlow(
      { nodeId: "machine-1", portKey: "output:Desc_WAT1_C" },
      "Desc_WAT1_C",
      NaN,
    ),
  ).toThrow();
  expect(editor.history.getSnapshot()).toBe(before);
});

it("does not solve again for route guides or informational tiers", () => {
  const editor = createLinkedEditor();
  editor.connect(editor.output, editor.input);
  const link = editor.history.getSnapshot().state.links[0]!;
  const analysis = editor.getFlowAnalysis();
  editor.setRoute(link.id, [{ axis: "y", position: 96 }]);
  expect(editor.getFlowAnalysis()).toBe(analysis);
  editor.setLinkTier(link.id, 6);
  expect(editor.getFlowAnalysis()).toBe(analysis);
});

it("persists only authored port references and reconciles a copied export with missing upstream material", () => {
  const editor = createTestEditor();
  const output = editor.getPorts("machine-1")[0]!;
  editor.setExternalFlow(output, "Desc_WAT1_C", 28.125);
  expect(editor.history.getSnapshot().state.externalFlows?.[0]?.port).toEqual({
    nodeId: "machine-1",
    portKey: "output:Desc_WAT1_C",
  });
  editor.catalog.logistics.splitter = {
    id: "splitter",
    name: "Splitter",
    description: "",
    descriptorId: "splitter",
    iconId: "splitter",
    kind: "splitter",
  };
  const splitter = editor.placeNode({ kind: "logistics", partId: "splitter" }, { x: 0, y: 0 });
  editor.setExternalFlow(output, "Desc_WAT1_C", 0);
  editor.connect(output, { nodeId: splitter.id, portKey: "input:0" });
  editor.setExternalFlow({ nodeId: splitter.id, portKey: "output:0" }, "Desc_WAT1_C", 28.125);
  editor.controller.setSelection(new Set([splitter.id]));
  editor.clipboardCommand("copy");
  editor.clipboardCommand("paste");
  expect(editor.history.getSnapshot().state.externalFlows).toHaveLength(1);
  expect(editor.getFlowAnalysis().status).not.toBe("invalid");
  const connection = editor.history.getSnapshot().state.links[0]!;
  editor.controller.selectLink(connection.id);
  editor.deleteSelection();
  expect(editor.history.getSnapshot().state.externalFlows).toHaveLength(0);
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state.externalFlows).toHaveLength(1);
});
