import { expect, it } from "vitest";

import { storageFlowFixture } from "../test/storage-flow-fixture";
import { createFactoryEditor } from "./factory-editor";

it.each([false, true])(
  "storage collects surplus after locked production, with or without a splitter (%s)",
  (split) => {
    const { assets, document } = storageFlowFixture(split);
    const editor = createFactoryEditor(assets.catalog, document);
    expect(editor.getFlowAnalysis().status).toBe("feasible");
    expect(editor.getPortRate("storage", "input:0")).toBe("120");
    expect(editor.getPortRate("storage", "output:0")).toBe("0");
    expect(editor.getFlowAnalysis().balances[0]?.stored).toBe(120);
    expect(editor.history.getSnapshot().state.externalFlows).toBeUndefined();
    const consumer = editor.placeNode(
      { kind: "manufacturing", recipeId: "ingot", machineId: "smelter" },
      { x: 600, y: 400 },
    );
    editor.setProductionTarget(consumer.id, "iron", 30);
    const source = {
      nodeId: split ? "splitter" : "miner",
      portKey: split ? "output:1" : "output:copper",
    };
    const miner = editor.getNode("miner");
    editor.connect(source, { nodeId: consumer.id, portKey: "input:copper" });
    expect(editor.getNode("miner")).toBe(miner);
    expect(editor.getPortRate("storage", "input:0")).toBe("90");
    editor.historyCommand("undo");
    expect(editor.getPortRate("storage", "input:0")).toBe("120");
    editor.historyCommand("redo");
    expect(editor.getPortRate("storage", "input:0")).toBe("90");
    editor.controller.setSelection(new Set([consumer.id]));
    editor.deleteSelection();
    expect(editor.getNode("miner")).toBe(miner);
    expect(editor.getPortRate("storage", "input:0")).toBe("120");
  },
);

it("uses material currently entering storage when sizing a new consumer", () => {
  const { assets, document } = storageFlowFixture(false);
  const editor = createFactoryEditor(assets.catalog, document);
  const miner = editor.getNode("miner");
  const consumer = editor.placeNode(
    { kind: "manufacturing", recipeId: "ingot", machineId: "smelter" },
    { x: 600, y: 400 },
    { nodeId: "miner", portKey: "output:copper" },
  );
  expect(consumer.kind === "manufacturing" && consumer.machines.length).toBe(4);
  expect(editor.getNode("miner")).toBe(miner);
  expect(editor.getPortRate("storage", "input:0")).toBe("0");
});

it.each([false, true])(
  "grows production for a real shortage through a splitter regardless of final segment (%s)",
  (upstreamLast) => {
    const { assets, document } = storageFlowFixture();
    const editor = createFactoryEditor(
      assets.catalog,
      upstreamLast
        ? { ...document, links: document.links.filter((link) => link.id !== "ore") }
        : document,
    );
    const consumer = editor.placeNode(
      { kind: "manufacturing", recipeId: "ingot", machineId: "smelter" },
      { x: 600, y: 400 },
    );
    editor.setProductionTarget("miner", "copper", null);
    editor.setProductionTarget(consumer.id, "iron", 240);
    editor.connect(
      { nodeId: "splitter", portKey: "output:1" },
      { nodeId: consumer.id, portKey: "input:copper" },
    );
    if (upstreamLast)
      editor.connect(
        { nodeId: "miner", portKey: "output:copper" },
        { nodeId: "splitter", portKey: "input:0" },
      );
    expect(editor.getPortRate("miner", "output:copper")).toBe("240");
    expect(editor.getPortRate("storage", "input:0")).toBe("0");
  },
);

it("infers icons on both sides of transport nodes and refreshes them on material changes", () => {
  const { assets, document } = storageFlowFixture();
  assets.catalog.extractors.miner = {
    ...assets.catalog.extractors.miner!,
    resourceIds: ["copper", "iron"],
  };
  const editor = createFactoryEditor(assets.catalog, document);
  for (const id of ["splitter", "storage"])
    for (const port of ["input:0", "output:0"])
      expect(editor.getPortIcons(id, port)).toEqual(["copper"]);
  const cached = editor.getPortIcons("storage", "input:0");
  editor.updateNodes((nodes) => nodes.map((node) => ({ ...node, x: node.x + 32 })));
  expect(editor.getPortIcons("storage", "input:0")).toBe(cached);
  editor.updateNodes((nodes) =>
    nodes.map((node) => (node.kind === "extractor" ? { ...node, resourceId: "iron" } : node)),
  );
  expect(editor.getPortIcons("storage", "input:0")).toEqual([]);
  editor.connect(
    { nodeId: "miner", portKey: "output:iron" },
    { nodeId: "splitter", portKey: "input:0" },
  );
  for (const id of ["splitter", "storage"])
    for (const port of ["input:0", "output:0"])
      expect(editor.getPortIcons(id, port)).toEqual(["iron"]);
});
