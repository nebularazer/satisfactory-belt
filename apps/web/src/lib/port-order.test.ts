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
