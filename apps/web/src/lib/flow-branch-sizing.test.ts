import { isFlowGroup, resolveProduction } from "@satisfactory-belt/factory-core";
import { expect, it } from "vitest";

import { minerFlowFixture } from "../test/flow-fixture";
import { createFactoryEditor } from "./factory-editor";
import { createModularFrameReference } from "./modular-frame-reference";

function referenceCatalog() {
  const { assets } = minerFlowFixture();
  const catalog = assets.catalog;
  for (const id of [
    "OreIron",
    "IronIngot",
    "IronPlate",
    "IronScrew",
    "IronRod",
    "IronPlateReinforced",
    "ModularFrame",
  ]) {
    const itemId = `Desc_${id}_C`;
    catalog.items[itemId] = { ...catalog.items.iron!, id: itemId };
  }
  catalog.extractors.Build_MinerMk2_C = {
    ...catalog.extractors.miner!,
    id: "Build_MinerMk2_C",
    resourceIds: ["Desc_OreIron_C"],
  };
  for (const id of ["Build_SmelterMk1_C", "Build_ConstructorMk1_C", "Build_AssemblerMk1_C"])
    catalog.machines[id] = { ...catalog.machines.smelter!, id };
  const recipes = [
    ["Recipe_IngotIron_C", "Build_SmelterMk1_C", [["OreIron", 30]], "IronIngot", 30],
    ["Recipe_IronPlate_C", "Build_ConstructorMk1_C", [["IronIngot", 30]], "IronPlate", 20],
    ["Recipe_Alternate_Screw_C", "Build_ConstructorMk1_C", [["IronIngot", 12.5]], "IronScrew", 50],
    ["Recipe_IronRod_C", "Build_ConstructorMk1_C", [["IronIngot", 15]], "IronRod", 15],
    [
      "Recipe_IronPlateReinforced_C",
      "Build_AssemblerMk1_C",
      [
        ["IronPlate", 30],
        ["IronScrew", 60],
      ],
      "IronPlateReinforced",
      5,
    ],
    [
      "Recipe_ModularFrame_C",
      "Build_AssemblerMk1_C",
      [
        ["IronPlateReinforced", 3],
        ["IronRod", 12],
      ],
      "ModularFrame",
      2,
    ],
  ] as const;
  for (const [id, machineId, inputs, output, amount] of recipes)
    catalog.recipes[id] = {
      ...catalog.recipes.ingot!,
      id,
      durationSeconds: 60,
      machineIds: [machineId],
      ingredients: inputs.map(([item, inputAmount]) => ({
        itemId: `Desc_${item}_C`,
        amount: inputAmount,
      })),
      products: [{ itemId: `Desc_${output}_C`, amount }],
    };
  return catalog;
}

it.each([false, true])(
  "sizes the modular frame branches from persistent targets (reversed graph: %s)",
  (reverse) => {
    const catalog = referenceCatalog();
    const reference = createModularFrameReference();
    const document = reverse
      ? { ...reference, nodes: reference.nodes.toReversed(), links: reference.links.toReversed() }
      : reference;
    const editor = createFactoryEditor(catalog, document);
    editor.setAutomaticSizing("iron-miners", true);
    editor.setProductionTarget("modular-frames", "Desc_ModularFrame_C", 10);
    expect(editor.getPortRate("iron-miners", "output:Desc_OreIron_C")).toBe("240");
    editor.setProductionTarget("modular-frames", "Desc_ModularFrame_C", 20);
    expect(editor.getPortRate("iron-miners", "output:Desc_OreIron_C")).toBe("480");
    editor.setMachineCount("cast-screws", 7);
    expect(editor.getPortRate("cast-screws", "output:Desc_IronScrew_C")).toBe("350");
    expect(editor.getNode("cast-screws")).toMatchObject({
      machines: Array.from({ length: 7 }, () => expect.objectContaining({ clockPercent: 100 })),
    });
    editor.setAutomaticSizing("cast-screws", true);
    editor.setProductionTarget("modular-frames", "Desc_ModularFrame_C", 40);
    expect(editor.getPortRate("cast-screws", "output:Desc_IronScrew_C")).toBe("720");
    expect(editor.getNode("cast-screws")).toMatchObject({
      machines: Array.from({ length: 15 }, () =>
        expect.objectContaining({ clockPercent: expect.closeTo(96) }),
      ),
    });
    expect(editor.getPortRate("cast-screws", "output:Desc_IronScrew_C")).toBe("720");
    editor.setProductionTarget("modular-frames", "Desc_ModularFrame_C", 20);
    editor.setProductionLocked("iron-miners", true);
    editor.setOperatingSetting("iron-miners", "all", "purity", 0.5);
    expect(editor.getNode("iron-miners")).toMatchObject({
      machines: Array.from({ length: 8 }, () =>
        expect.objectContaining({ purity: 0.5, clockPercent: 100 }),
      ),
    });
    expect(editor.getPortRate("iron-miners", "output:Desc_OreIron_C")).toBe("480");
  },
);

it("keeps unfinished upstream recipes productive and respects connected finite supply", () => {
  const catalog = referenceCatalog();
  catalog.extractors.Build_MinerMk2_C!.baseRate = 60;
  const editor = createFactoryEditor(catalog, { nodes: [], links: [] });
  const place = (recipeId: string, consumer?: string, ingredient?: string) =>
    editor.placeNode(
      { kind: "manufacturing", machineId: catalog.recipes[recipeId]!.machineIds[0]!, recipeId },
      { x: 0, y: 0 },
      consumer ? { nodeId: consumer, portKey: `input:Desc_${ingredient}_C` } : undefined,
    ).id;
  const rate = (id: string, direction: "inputs" | "outputs", item: string) => {
    const node = editor.getNode(id)!;
    if (!isFlowGroup(node)) throw new Error("Expected machine group");
    return resolveProduction(node, catalog)[direction].find((r) => r.itemId === `Desc_${item}_C`)!
      .perMinute;
  };
  const frames = place("Recipe_ModularFrame_C");
  editor.setLimit(frames, { kind: "output", itemId: "Desc_ModularFrame_C", value: 10 });
  expect(rate(frames, "outputs", "ModularFrame")).toBeCloseTo(10);
  const reinforced = place("Recipe_IronPlateReinforced_C", frames, "IronPlateReinforced");
  expect(rate(frames, "outputs", "ModularFrame")).toBeCloseTo(10);
  expect(rate(reinforced, "inputs", "IronPlate")).toBeCloseTo(90);
  expect(rate(reinforced, "inputs", "IronScrew")).toBeCloseTo(180);
  const plates = place("Recipe_IronPlate_C", reinforced, "IronPlate");
  expect(rate(frames, "outputs", "ModularFrame")).toBeCloseTo(10);
  expect(rate(plates, "inputs", "IronIngot")).toBeCloseTo(135);
  const ingots = place("Recipe_IngotIron_C", plates, "IronIngot");
  expect(rate(frames, "outputs", "ModularFrame")).toBeCloseTo(10);
  const miner = editor.placeNode(
    { kind: "extractor", extractorId: "Build_MinerMk2_C", resourceId: "Desc_OreIron_C" },
    { x: 0, y: 0 },
    { nodeId: ingots, portKey: "input:Desc_OreIron_C" },
  ).id;
  expect(rate(ingots, "outputs", "IronIngot")).toBeCloseTo(60);
  expect(rate(plates, "outputs", "IronPlate")).toBeCloseTo(40);
  expect(rate(frames, "outputs", "ModularFrame")).toBeCloseTo(40 / 9);
  expect(rate(reinforced, "inputs", "IronScrew")).toBeCloseTo(80);
  expect(editor.getNode(frames)).toMatchObject({
    flow: { outputLimit: { itemId: "Desc_ModularFrame_C", perMinute: 10 } },
  });
  editor.historyCommand("undo");
  expect(rate(frames, "outputs", "ModularFrame")).toBeCloseTo(10);
  editor.historyCommand("redo");
  expect(rate(frames, "outputs", "ModularFrame")).toBeCloseTo(40 / 9);
  editor.setOperatingSetting(miner, "all", "purity", 2);
  expect(rate(frames, "outputs", "ModularFrame")).toBeCloseTo(80 / 9);
  const saved = editor.history.getSnapshot().state;
  const reopened = createFactoryEditor(catalog, {
    ...saved,
    nodes: saved.nodes.toReversed(),
    links: saved.links.toReversed(),
  });
  expect(reopened.getNode(frames)).toEqual(editor.getNode(frames));
});
