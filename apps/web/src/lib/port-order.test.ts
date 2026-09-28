import { expect, it } from "vitest";

import { minerFlowFixture } from "../test/flow-fixture";
import { createFactoryEditor } from "./factory-editor";

it("reorders each side while preserving connections, rates, undo history and saved order", () => {
  const { assets, document, smelter } = minerFlowFixture();
  const recipe = assets.catalog.recipes.ingot!;
  assets.catalog.recipes.ingot = {
    ...recipe,
    ingredients: [...recipe.ingredients, { itemId: "iron", amount: 1 }],
    products: [...recipe.products, { itemId: "copper", amount: 1 }],
  };
  const editor = createFactoryEditor(assets.catalog, document);
  const before = editor.history.getSnapshot().state;
  const rates = editor.getLinkRates("ore");
  const route = editor.controller.getSnapshot().links.find((link) => link.id === "ore")!;
  const keys = (direction: "input" | "output") =>
    editor
      .getDisplay(smelter.id)!
      .ports.filter((port) => port.direction === direction)
      .map((port) => port.key);

  editor.movePort(smelter.id, "input:copper", 1);
  expect(keys("input")).toEqual(["input:iron", "input:copper"]);
  expect(keys("output")).toEqual(["output:iron", "output:copper"]);
  expect(editor.history.getSnapshot().state.links).toBe(before.links);
  expect(editor.getLinkRates("ore")).toEqual(rates);
  const movedRoute = editor.controller.getSnapshot().links.find((link) => link.id === "ore")!;
  expect(movedRoute.input).toEqual(route.input);
  expect(movedRoute.points.at(-1)!.y).toBe(route.points.at(-1)!.y + 32);

  editor.movePort(smelter.id, "output:copper", -1);
  const saved = editor.history.getSnapshot().state;
  expect(keys("output")).toEqual(["output:copper", "output:iron"]);
  expect(keys("input")).toEqual(["input:iron", "input:copper"]);
  const restored = createFactoryEditor(assets.catalog, JSON.parse(JSON.stringify(saved)));
  expect(restored.getDisplay(smelter.id)!.ports).toEqual(editor.getDisplay(smelter.id)!.ports);

  editor.movePort(smelter.id, "output:copper", -1);
  expect(editor.history.getSnapshot().state).toBe(saved);
  editor.historyCommand("undo");
  expect(keys("output")).toEqual(["output:iron", "output:copper"]);
  editor.historyCommand("undo");
  expect(editor.history.getSnapshot().state).toBe(before);
  editor.historyCommand("redo");
  editor.historyCommand("redo");
  expect(editor.history.getSnapshot().state).toBe(saved);
});

it.each(["splitter", "merger", "smart-splitter", "programmable-splitter"] as const)(
  "reorders %s ports without changing their links or filtering rules",
  (kind) => {
    const { assets, miner, smelter } = minerFlowFixture();
    assets.catalog.logistics.part = {
      id: "part",
      kind,
      name: kind,
      description: "",
      descriptorId: "part",
      iconId: "copper",
    };
    const program =
      kind === "smart-splitter" || kind === "programmable-splitter"
        ? {
            "output:0": [{ kind: "item" as const, itemId: "copper" }],
            "output:1": [{ kind: "none" as const }],
            "output:2": [{ kind: "overflow" as const }],
          }
        : undefined;
    const node = {
      id: "junction",
      kind: "logistics" as const,
      partId: "part",
      x: 256,
      y: 0,
      program,
    };
    const editor = createFactoryEditor(assets.catalog, {
      nodes: [miner, node, smelter],
      links: [
        {
          id: "in",
          output: { nodeId: miner.id, portKey: "output:copper" },
          input: { nodeId: node.id, portKey: "input:0" },
        },
        {
          id: "out",
          output: { nodeId: node.id, portKey: "output:0" },
          input: { nodeId: smelter.id, portKey: "input:copper" },
        },
      ],
    });
    const before = editor.history.getSnapshot().state;
    const direction = kind === "merger" ? "input" : "output";
    const portKey = `${direction}:0`;
    const y = () => editor.getDisplay(node.id)!.ports.find((port) => port.key === portKey)!.y;
    const originalY = y();
    const rates = editor.getLinkRates("out");
    editor.movePort(node.id, portKey, 1);
    expect(y()).toBe(originalY + 32);
    const after = editor.history.getSnapshot().state;
    expect(after.links).toBe(before.links);
    expect(editor.getNode(node.id)).toMatchObject({ program });
    expect(editor.getLinkRates("out")).toEqual(rates);
    const route = editor.controller
      .getSnapshot()
      .links.find((link) => link.id === (kind === "merger" ? "in" : "out"))!;
    expect((kind === "merger" ? route.points.at(-1)! : route.points[0]!).y).toBe(
      node.y + originalY + 32,
    );
    const restored = createFactoryEditor(assets.catalog, JSON.parse(JSON.stringify(after)));
    expect(restored.getDisplay(node.id)!.ports).toEqual(editor.getDisplay(node.id)!.ports);
    editor.historyCommand("undo");
    expect(y()).toBe(originalY);
    editor.historyCommand("redo");
    expect(editor.history.getSnapshot().state).toBe(after);
  },
);
