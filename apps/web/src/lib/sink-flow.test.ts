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
  const setRate = (perMinute?: number) => {
    const node = editor.getNode("sink");
    if (node?.kind !== "sink") throw new Error("Expected sink");
    editor.replaceNode({
      ...node,
      sinkRate: perMinute === undefined ? undefined : { itemId: "iron", perMinute },
    });
  };
  return { editor, assets, rate, setRate };
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

it("does not grow an unconstrained source for surplus, but an explicit sinking rate may request production", () => {
  const { editor, rate, setRate } = setup(false);
  expect(rate("sink", "input:0")).toBe(0);
  expect(editor.getPortRate("smelter", "output:iron")).toBe("96");
  setRate(10);
  expect(rate("sink", "input:0")).toBeCloseTo(10);
  expect(editor.getPortRate("smelter", "output:iron")).toBe("106");
  setRate();
  expect(rate("sink", "input:0")).toBe(0);
  expect(editor.getPortRate("smelter", "output:iron")).toBe("96");
});

it("keeps the explicit rate through shortages, undo, reload and reversed graph order", () => {
  const { editor, assets, rate, setRate } = setup();
  setRate(60);
  expect(rate("sink", "input:0")).toBeCloseTo(24);
  expect(editor.getNode("sink")).toMatchObject({ sinkRate: { perMinute: 60 } });
  editor.setOperatingSetting("miner", "all", "purity", 2);
  expect(rate("sink", "input:0")).toBeCloseTo(60);
  expect(editor.getPortRate("smelter", "output:iron")).toBe("156");
  editor.historyCommand("undo");
  expect(rate("sink", "input:0")).toBeCloseTo(24);
  editor.historyCommand("redo");
  const saved = editor.history.getSnapshot().state;
  const reopened = createFactoryEditor(
    assets.catalog,
    JSON.parse(
      JSON.stringify({
        ...saved,
        nodes: saved.nodes.toReversed(),
        links: saved.links.toReversed(),
      }),
    ),
  );
  expect(reopened.getPortRate("sink", "input:0")).toBe("60");
  setRate(-1);
  expect(editor.history.getSnapshot().state).toBe(saved);
});

it("uses an authored machine limit as finite supply without treating automatic machine counts as limits", () => {
  const { editor, rate } = setup(false);
  expect(rate("sink", "input:0")).toBe(0);
  editor.setLimit("smelter", { kind: "machines", value: 4 });
  expect(rate("sink", "input:0")).toBeCloseTo(24);
  editor.setLimit("smelter", null);
  expect(rate("sink", "input:0")).toBe(0);
});

it("serves an explicit sinking rate before a surplus sink regardless of node order", () => {
  const { editor, assets, setRate } = setup();
  setRate(10);
  const saved = editor.history.getSnapshot().state;
  const sink = saved.nodes.find((node) => node.kind === "sink")!;
  if (sink.kind !== "sink") throw new Error("Expected sink");
  const second = { ...sink, id: "surplus", sinkRate: undefined };
  const secondLink = {
    ...saved.links.find((link) => link.id === "sink")!,
    id: "surplus",
    input: { nodeId: "surplus", portKey: "input:0" },
  };
  for (const reverse of [false, true]) {
    const nodes = [second, ...saved.nodes];
    const links = [secondLink, ...saved.links];
    const reopened = createFactoryEditor(assets.catalog, {
      nodes: reverse ? nodes.toReversed() : nodes,
      links: reverse ? links.toReversed() : links,
    });
    expect(reopened.getPortRate("sink", "input:0")).toBe("10");
    expect(reopened.getPortRate("surplus", "input:0")).toBe("14");
    expect(reopened.getPortRate("wire", "output:wire")).toBe("192");
  }
});
