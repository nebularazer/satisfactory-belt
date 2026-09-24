/* oxlint-disable oxc/no-map-spread -- Fixtures model immutable graph edits. */
import { createMachineMembers } from "@satisfactory-belt/factory-core";
import type { FactoryDocument, FactoryNode } from "@satisfactory-belt/factory-core";
import { expect, it } from "vitest";

import { minerFlowFixture } from "../test/flow-fixture";
import { createFactoryEditor } from "./factory-editor";

function setup(finite = true) {
  const { assets, miner, smelter, document } = minerFlowFixture();
  const c = assets.catalog;
  c.items.wire = { ...c.items.iron!, id: "wire", name: "Wire" };
  c.recipes.wire = {
    ...c.recipes.ingot!,
    id: "wire",
    ingredients: [{ itemId: "iron", amount: 1 }],
    products: [{ itemId: "wire", amount: 2 }],
  };
  c.sinks.sink = {
    id: "sink",
    name: "AWESOME Sink",
    description: "",
    descriptorId: "sink",
    iconId: "iron",
    powerMegawatts: 30,
  };
  const sink: Extract<FactoryNode, { kind: "sink" }> = {
    id: "sink",
    kind: "sink",
    sinkId: "sink",
    machines: createMachineMembers(1),
    x: 800,
    y: 400,
  };
  const plan: FactoryDocument = {
    nodes: [
      ...(finite ? [miner] : []),
      smelter,
      {
        ...smelter,
        id: "wire",
        recipeId: "wire",
        flow: { outputLimit: { itemId: "wire", perMinute: 192 }, clockMode: "auto" },
      },
      sink,
    ],
    links: [
      ...(finite ? document.links : []),
      {
        id: "wire",
        output: { nodeId: smelter.id, portKey: "output:iron" },
        input: { nodeId: "wire", portKey: "input:iron" },
      },
      {
        id: "sink",
        output: { nodeId: smelter.id, portKey: "output:iron" },
        input: { nodeId: "sink", portKey: "input:0" },
      },
    ],
  };
  const editor = createFactoryEditor(c, plan);
  const rate = (id: string, key: string) =>
    editor
      .getPortFlows({ nodeId: id, portKey: key })
      .reduce((sum, r) => sum + (r.perMinute ?? 0), 0);
  return { editor, assets, rate };
}

it("uses spare finite supply for sinking after production and preserves connections", () => {
  const { editor, rate } = setup();
  expect(editor.getPortRate("wire", "output:wire")).toBe("192");
  expect(rate("sink", "input:0")).toBeCloseTo(24);
  const links = editor.history.getSnapshot().state.links;
  editor.setOperatingSetting("miner", "all", "purity", 0.5);
  expect(editor.getPortRate("wire", "output:wire")).toBe("120");
  expect(rate("sink", "input:0")).toBe(0);
  editor.setOperatingSetting("miner", "all", "purity", 2);
  expect(rate("sink", "input:0")).toBeCloseTo(144);
  expect(editor.history.getSnapshot().state.links).toEqual(links);
});

it("does not grow an unconstrained source for surplus", () => {
  const { editor, rate } = setup(false);
  expect(rate("sink", "input:0")).toBe(0);
  expect(editor.getPortRate("smelter", "output:iron")).toBe("96");
});

it("rejects saved plans containing removed sink rate settings", () => {
  const { editor, assets } = setup(false);
  const saved = editor.history.getSnapshot().state;
  const unsupported = {
    ...saved,
    nodes: saved.nodes.map((node) =>
      node.kind === "sink" ? { ...node, sinkRate: { itemId: "iron", perMinute: 10 } } : node,
    ),
  };
  expect(() => createFactoryEditor(assets.catalog, unsupported)).toThrow(/no longer supported/);
});

it("uses an authored machine limit as finite supply without treating automatic machine counts as limits", () => {
  const { editor, rate } = setup(false);
  expect(rate("sink", "input:0")).toBe(0);
  editor.setLimit("smelter", { kind: "machines", value: 4 });
  expect(rate("sink", "input:0")).toBeCloseTo(24);
  editor.setLimit("smelter", null);
  expect(rate("sink", "input:0")).toBe(0);
});

it("keeps the ingot-to-rod surplus predictable through limits, undo and reload", () => {
  const { assets } = setup(false);
  assets.catalog.items.wire = { ...assets.catalog.items.wire!, name: "Iron Rod" };
  assets.catalog.recipes.wire = {
    ...assets.catalog.recipes.wire!,
    name: "Iron Rod",
    durationSeconds: 4,
    products: [{ itemId: "wire", amount: 1 }],
  };
  const editor = createFactoryEditor(assets.catalog, { nodes: [], links: [] });
  const smelter = editor.placeNode(
    { kind: "manufacturing", machineId: "smelter", recipeId: "ingot" },
    { x: 0, y: 0 },
  );
  const output = { nodeId: smelter.id, portKey: "output:iron" };
  const rods = editor.placeNode(
    { kind: "manufacturing", machineId: "smelter", recipeId: "wire" },
    { x: 400, y: 0 },
    output,
  );
  const sink = editor.placeNode({ kind: "sink", sinkId: "sink" }, { x: 400, y: 400 }, output);
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("30");
  expect(editor.getPortRate(rods.id, "input:iron")).toBe("30");
  expect(editor.getPortRate(sink.id, "input:0")).toBe("0");
  editor.setLimit(rods.id, { kind: "output", itemId: "wire", value: 15 });
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("15");
  expect(editor.getPortRate(sink.id, "input:0")).toBe("0");
  editor.setLimit(smelter.id, { kind: "output", itemId: "iron", value: 30 });
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("30");
  expect(editor.getPortRate(rods.id, "input:iron")).toBe("15");
  expect(editor.getPortRate(sink.id, "input:0")).toBe("15");
  editor.historyCommand("undo");
  expect(editor.getPortRate(sink.id, "input:0")).toBe("0");
  editor.historyCommand("redo");
  expect(editor.getPortRate(sink.id, "input:0")).toBe("15");
  const saved = editor.history.getSnapshot().state;
  const reopened = createFactoryEditor(assets.catalog, {
    ...saved,
    nodes: saved.nodes.toReversed(),
    links: saved.links.toReversed(),
  });
  expect(reopened.getPortRate(sink.id, "input:0")).toBe("15");
  editor.setLimit(smelter.id, { kind: "machines", value: 1 });
  expect(editor.getPortRate(sink.id, "input:0")).toBe("15");
  editor.setLimit(smelter.id, null);
  expect(editor.getPortRate(sink.id, "input:0")).toBe("0");
  expect(editor.history.getSnapshot().state.links).toEqual(saved.links);
});
