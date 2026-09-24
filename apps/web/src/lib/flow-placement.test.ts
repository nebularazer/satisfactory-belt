/* oxlint-disable oxc/no-map-spread -- Test fixtures keep their source documents immutable. */
import { createMachineMembers, resolveProduction } from "@satisfactory-belt/factory-core";
import { expect, it } from "vitest";

import { minerFlowFixture } from "../test/flow-fixture";
import { createFactoryEditor } from "./factory-editor";

const recipe = { kind: "manufacturing", recipeId: "ingot", machineId: "smelter" } as const;

it("sizes downstream placement from remaining supply and keeps the edit atomic", () => {
  const { assets, document: initial } = minerFlowFixture();
  const document = {
    ...initial,
    nodes: initial.nodes.map((node) => ({
      ...node,
      flow: {
        targets: {
          [node.kind === "extractor" ? "copper" : "iron"]: node.kind === "extractor" ? 120 : 30,
        },
      },
    })),
  };
  const editor = createFactoryEditor(assets.catalog, document);
  const node = editor.placeNode(
    recipe,
    { x: 800, y: 200 },
    { nodeId: "miner", portKey: "output:copper" },
  );
  expect(node.kind === "manufacturing" && node.machines).toHaveLength(3);
  expect(resolveProduction(node, assets.catalog).inputs[0]?.perMinute).toBe(90);
  expect(editor.getNode("smelter")).toEqual(document.nodes[1]);
  expect(editor.history.getSnapshot().state.links).toHaveLength(2);
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state).toEqual(document);
  editor.historyCommand("redo");
  expect(editor.getNode(node.id)).toEqual(node);
});

it("places one finite miner upstream and sizes the consumer to its supply", () => {
  const { assets, smelter } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, {
    nodes: [{ ...smelter, machines: createMachineMembers(5) }],
    links: [],
  });
  const node = editor.placeNode(
    { kind: "extractor", extractorId: "miner", resourceId: "copper" },
    { x: 0, y: 0 },
    { nodeId: "smelter", portKey: "input:copper" },
  );
  expect(node.kind === "extractor" && node.machines.map((m) => m.clockPercent)).toEqual([100]);
  expect(resolveProduction(node, assets.catalog).outputs[0]?.perMinute).toBe(120);
});

it("sizes a selected alternate recipe by its matching output", () => {
  const { assets, smelter } = minerFlowFixture();
  assets.catalog.recipes.cast = {
    ...assets.catalog.recipes.ingot!,
    id: "cast",
    alternate: true,
    durationSeconds: 24,
    ingredients: [{ itemId: "iron", amount: 5 }],
    products: [{ itemId: "copper", amount: 20 }],
  };
  // A consumer requiring 360/min: the selected producer makes 50/min at 100%.
  const editor = createFactoryEditor(assets.catalog, {
    nodes: [{ ...smelter, machines: createMachineMembers(12) }],
    links: [],
  });
  const node = editor.placeNode(
    { ...recipe, recipeId: "cast" },
    { x: 0, y: 0 },
    { nodeId: "smelter", portKey: "input:copper" },
  );
  expect(node.kind === "manufacturing" && node.machines.map((m) => m.clockPercent)).toEqual(
    Array(8).fill(90),
  );
  expect(resolveProduction(node, assets.catalog).outputs[0]?.perMinute).toBe(360);
  expect(node.kind === "manufacturing" && new Set(node.machines.map((m) => m.id)).size).toBe(8);
});

it("uses amplified source production when building forward and leaves standalone placement at one machine", () => {
  const { assets, smelter } = minerFlowFixture();
  assets.catalog.machines.smelter = {
    ...assets.catalog.machines.smelter!,
    sloopSlots: 1,
    productionBoost: { base: 1, perSloop: 1, powerExponent: 2 },
  };
  assets.catalog.items.Desc_WAT1_C = { ...assets.catalog.items.iron!, id: "Desc_WAT1_C" };
  assets.catalog.recipes.consumer = {
    ...assets.catalog.recipes.ingot!,
    id: "consumer",
    ingredients: [{ itemId: "iron", amount: 1 }],
    products: [{ itemId: "copper", amount: 1 }],
  };
  const editor = createFactoryEditor(assets.catalog, {
    nodes: [
      { ...smelter, machines: createMachineMembers(1, { clockPercent: 150, sloopsUsed: 1 }) },
    ],
    links: [],
  });
  const node = editor.placeNode(
    { ...recipe, recipeId: "consumer" },
    { x: 0, y: 0 },
    { nodeId: "smelter", portKey: "output:iron" },
  );
  expect(resolveProduction(node, assets.catalog).inputs[0]?.perMinute).toBe(90);
  const standalone = editor.placeNode(recipe, { x: 100, y: 100 });
  expect(standalone.kind === "manufacturing" && standalone.machines).toHaveLength(1);
});

it("sizes shared suppliers from the sum of persistent consumer targets", () => {
  const { assets } = minerFlowFixture();
  assets.catalog.recipes.consumer = {
    ...assets.catalog.recipes.ingot!,
    id: "consumer",
    ingredients: [{ itemId: "iron", amount: 1 }],
    products: [{ itemId: "copper", amount: 1 }],
  };
  const editor = createFactoryEditor(assets.catalog, { nodes: [], links: [] });
  const first = editor.placeNode({ ...recipe, recipeId: "consumer" }, { x: 600, y: 0 });
  editor.setProductionTarget(first.id, "copper", 30);
  const smelt = editor.placeNode(
    recipe,
    { x: 300, y: 0 },
    { nodeId: first.id, portKey: "input:iron" },
  );
  const miner = editor.placeNode(
    { kind: "extractor", extractorId: "miner", resourceId: "copper" },
    { x: 0, y: 0 },
    { nodeId: smelt.id, portKey: "input:copper" },
  );
  const second = editor.placeNode({ ...recipe, recipeId: "consumer" }, { x: 600, y: 400 });
  editor.setProductionTarget(second.id, "copper", 60);
  editor.connect(
    { nodeId: smelt.id, portKey: "output:iron" },
    { nodeId: second.id, portKey: "input:iron" },
  );
  expect(editor.getPortRate(smelt.id, "output:iron")).toBe("90");
  expect(editor.getPortRate(miner.id, "output:copper")).toBe("90");
  editor.setMachineCount(smelt.id, 2);
  expect(editor.getPortRate(smelt.id, "output:iron")).toBe("60");
  expect(editor.getNode(smelt.id)).toMatchObject({
    machines: Array.from({ length: 2 }, () => expect.objectContaining({ clockPercent: 100 })),
  });
  editor.setAutomaticSizing(smelt.id, true);
  editor.setProductionTarget(second.id, "copper", 90);
  expect(editor.getPortRate(smelt.id, "output:iron")).toBe("120");
  expect(editor.getNode(smelt.id)).toMatchObject({
    machines: Array.from({ length: 4 }, () => expect.objectContaining({ clockPercent: 100 })),
  });
  editor.historyCommand("undo");
  expect(editor.getPortRate(smelt.id, "output:iron")).toBe("90");
  editor.historyCommand("redo");
  expect(editor.getPortRate(smelt.id, "output:iron")).toBe("120");
});

it("builds forward from an extraction target and trades count for clock without changing supply", () => {
  const { assets } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, { nodes: [], links: [] });
  const miner = editor.placeNode(
    { kind: "extractor", extractorId: "miner", resourceId: "copper" },
    { x: 0, y: 0 },
  );
  const smelt = editor.placeNode(
    recipe,
    { x: 300, y: 0 },
    { nodeId: miner.id, portKey: "output:copper" },
  );
  expect(editor.getPortRate(smelt.id, "output:iron")).toBe("120");
  editor.setMachineCount(miner.id, 3);
  expect(editor.getPortRate(smelt.id, "output:iron")).toBe("360");
  editor.setProductionTarget(miner.id, "copper", 360);
  expect(editor.getPortRate(smelt.id, "output:iron")).toBe("360");
  editor.setMachineCount(smelt.id, 6);
  expect(editor.getNode(smelt.id)).toMatchObject({
    machines: Array.from({ length: 6 }, () => expect.objectContaining({ clockPercent: 100 })),
  });
  expect(editor.getPortRate(smelt.id, "output:iron")).toBe("180");
  editor.setAutomaticSizing(smelt.id, true);
  editor.setOperatingSetting(miner.id, "all", "purity", 2);
  expect(editor.getPortRate(smelt.id, "output:iron")).toBe("360");
  editor.setProductionTarget(miner.id, "copper", 720);
  expect(editor.getPortRate(smelt.id, "output:iron")).toBe("720");
});

it("builds forward from a production target such as an existing supply of screws", () => {
  const { assets } = minerFlowFixture();
  assets.catalog.recipes.consumer = {
    ...assets.catalog.recipes.ingot!,
    id: "consumer",
    ingredients: [{ itemId: "iron", amount: 1 }],
    products: [{ itemId: "copper", amount: 1 }],
  };
  const editor = createFactoryEditor(assets.catalog, { nodes: [], links: [] });
  const source = editor.placeNode(recipe, { x: 0, y: 0 });
  editor.setProductionTarget(source.id, "iron", 500);
  const consumer = editor.placeNode(
    { ...recipe, recipeId: "consumer" },
    { x: 300, y: 0 },
    { nodeId: source.id, portKey: "output:iron" },
  );
  expect(editor.getPortRate(consumer.id, "output:copper")).toBe("500");
  editor.setProductionTarget(source.id, "iron", 250);
  expect(editor.getPortRate(consumer.id, "output:copper")).toBe("250");
});

it("sizes a downstream recipe from available material while exposing its unfinished ingredient branch", () => {
  const { assets } = minerFlowFixture();
  assets.catalog.items.extra = { ...assets.catalog.items.iron!, id: "extra" };
  assets.catalog.recipes.consumer = {
    ...assets.catalog.recipes.ingot!,
    id: "consumer",
    ingredients: [
      { itemId: "iron", amount: 1 },
      { itemId: "extra", amount: 2 },
    ],
    products: [{ itemId: "copper", amount: 1 }],
  };
  const editor = createFactoryEditor(assets.catalog, { nodes: [], links: [] });
  const source = editor.placeNode(recipe, { x: 0, y: 0 });
  editor.setProductionTarget(source.id, "iron", 500);
  const consumer = editor.placeNode(
    { ...recipe, recipeId: "consumer" },
    { x: 300, y: 0 },
    { nodeId: source.id, portKey: "output:iron" },
  );
  expect(editor.getPortRate(consumer.id, "output:copper")).toBe("500");
  expect(editor.getFlowAnalysis().issues).toContainEqual(
    expect.objectContaining({
      nodeId: consumer.id,
      code: "missing-input",
      itemId: "extra",
      perMinute: expect.closeTo(1000),
    }),
  );
});

it.each([false, true])(
  "Auto suppliers follow demand regardless of placement order (%s)",
  (consumerFirst) => {
    const { assets } = minerFlowFixture();
    const editor = createFactoryEditor(assets.catalog, { nodes: [], links: [] });
    const addMiner = () =>
      editor.placeNode(
        { kind: "extractor", extractorId: "miner", resourceId: "copper" },
        { x: 0, y: 0 },
      );
    const addConsumer = () => editor.placeNode(recipe, { x: 400, y: 0 });
    const first = consumerFirst ? addConsumer() : addMiner();
    const second = consumerFirst ? addMiner() : addConsumer();
    const miner = consumerFirst ? second : first;
    const consumer = consumerFirst ? first : second;
    for (const node of [miner, consumer]) {
      if (node.kind !== "extractor" && node.kind !== "manufacturing")
        throw new Error("Expected production group");
      expect(node.flow?.targets).toBeUndefined();
    }
    editor.setAutomaticSizing(miner.id, true);
    editor.setProductionTarget(consumer.id, "iron", 240);
    editor.connect(
      { nodeId: miner.id, portKey: "output:copper" },
      { nodeId: consumer.id, portKey: "input:copper" },
    );
    expect(editor.getPortRate(miner.id, "output:copper")).toBe("240");
    const resized = editor.getNode(miner.id);
    expect(resized?.kind === "extractor" && resized.flow?.targets).toBeUndefined();
    editor.setProductionLocked(consumer.id, false);
    expect(editor.getPortRate(miner.id, "output:copper")).toBe("240");
    // Without any locks, the final product still supplies demand for automatic suppliers.
    const extra = editor.placeNode(recipe, { x: 400, y: 400 });
    editor.connect(
      { nodeId: miner.id, portKey: "output:copper" },
      { nodeId: extra.id, portKey: "input:copper" },
    );
    expect(editor.getPortRate(miner.id, "output:copper")).toBe("270");
    editor.historyCommand("undo");
    expect(editor.getPortRate(miner.id, "output:copper")).toBe("240");
  },
);
