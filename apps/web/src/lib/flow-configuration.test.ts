/* oxlint-disable oxc/no-map-spread -- Fixtures and editor commands preserve immutable snapshots. */
import {
  createMachineMembers,
  isProductionLocked,
  withRecipe,
} from "@satisfactory-belt/factory-core";
import type { FlowGroup } from "@satisfactory-belt/factory-core";
import { expect, it } from "vitest";

import { minerFlowFixture } from "../test/flow-fixture";
import { createFactoryEditor } from "./factory-editor";

const changes = ["tier", "purity", "count", "clock", "recipe", "machine", "sloops"] as const;
it.each(changes.flatMap((change) => [false, true].map((locked) => ({ change, locked }))))(
  "propagates $change edits with production locked=$locked",
  ({ change, locked }) => {
    const { assets, miner, smelter } = minerFlowFixture();
    const catalog = assets.catalog;
    catalog.items.Desc_WAT1_C = { ...catalog.items.iron!, id: "Desc_WAT1_C" };
    catalog.extractors.mk3 = { ...catalog.extractors.miner!, id: "mk3", baseRate: 240 };
    catalog.machines.smelter = {
      ...catalog.machines.smelter!,
      sloopSlots: 1,
      productionBoost: { base: 1, perSloop: 1, powerExponent: 2 },
    };
    catalog.machines.fast = { ...catalog.machines.smelter, id: "fast", manufacturingSpeed: 2 };
    catalog.recipes.ingot = { ...catalog.recipes.ingot!, machineIds: ["smelter", "fast"] };
    catalog.recipes.double = {
      ...catalog.recipes.ingot,
      id: "double",
      products: [{ itemId: "iron", amount: 2 }],
    };
    catalog.recipes.consumer = {
      ...catalog.recipes.ingot,
      id: "consumer",
      ingredients: [{ itemId: "iron", amount: 1 }],
      products: [{ itemId: "copper", amount: 1 }],
    };
    const manufacturing = ["recipe", "machine", "sloops"].includes(change);
    const source: FlowGroup = manufacturing
      ? { ...smelter, machines: createMachineMembers(4) }
      : miner;
    const sourceItem = manufacturing ? "iron" : "copper";
    const consumer = {
      ...smelter,
      id: "consumer",
      recipeId: manufacturing ? "consumer" : "ingot",
      machines: createMachineMembers(4),
    };
    const editor = createFactoryEditor(catalog, {
      nodes: [...(manufacturing ? [miner] : []), source, consumer],
      links: [
        ...(manufacturing
          ? [
              {
                id: "ore",
                output: { nodeId: miner.id, portKey: "output:copper" },
                input: { nodeId: source.id, portKey: "input:copper" },
              },
            ]
          : []),
        {
          id: "supply",
          output: { nodeId: source.id, portKey: `output:${sourceItem}` },
          input: { nodeId: consumer.id, portKey: `input:${sourceItem}` },
        },
      ],
    });
    if (manufacturing) editor.setAutomaticSizing(miner.id, true);
    if (locked) editor.setProductionLocked(source.id, true);
    const before = editor.history.getSnapshot().state;
    const current = editor.getNode(source.id)!;
    switch (change) {
      case "tier":
        if (current.kind !== "extractor") throw new Error("Expected miner");
        editor.replaceNode({ ...current, extractorId: "mk3" });
        break;
      case "purity":
        editor.setOperatingSetting(source.id, "all", "purity", 2);
        break;
      case "count":
        editor.setMachineCount(source.id, 2);
        break;
      case "clock":
        editor.setFlowClock(source.id, 200);
        break;
      case "recipe":
        if (current.kind !== "manufacturing") throw new Error("Expected smelter");
        editor.replaceNode(withRecipe(current, "double", catalog));
        break;
      case "machine":
        if (current.kind !== "manufacturing") throw new Error("Expected smelter");
        editor.replaceNode({ ...current, machineId: "fast" });
        break;
      case "sloops":
        editor.setOperatingSetting(source.id, "all", "sloopsUsed", 1);
        break;
    }
    expect(editor.getLinkRates("supply")).toEqual([locked ? "120" : "240"]);
    expect(editor.getNode(consumer.id)).toMatchObject({
      machines: Array.from({ length: locked ? 4 : 8 }, () =>
        expect.objectContaining({ clockPercent: 100 }),
      ),
    });
    const edited = editor.getNode(source.id)!;
    expect(isProductionLocked(edited)).toBe(locked);
    if (!locked)
      expect(edited).toMatchObject({
        machines: Array.from({ length: manufacturing ? 4 : change === "count" ? 2 : 1 }, () =>
          expect.objectContaining({ clockPercent: change === "clock" ? 200 : 100 }),
        ),
      });
    const after = editor.history.getSnapshot().state;
    editor.historyCommand("undo");
    expect(editor.history.getSnapshot().state).toBe(before);
    editor.historyCommand("redo");
    expect(editor.history.getSnapshot().state).toBe(after);
  },
);

it("preserves used output when rebalancing an underused finite source", () => {
  const { assets, document, miner, smelter } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, {
    ...document,
    nodes: [
      { ...miner, flow: { clockPercent: 200 } },
      { ...smelter, flow: { targets: { iron: 120 } }, machines: createMachineMembers(4) },
    ],
  });
  editor.setMachineCount(miner.id, 2);
  expect(editor.getPortRate(miner.id, "output:copper")).toBe("120");
  editor.rebalanceAt100(miner.id);
  expect(editor.getPortRate(miner.id, "output:copper")).toBe("120");
  expect(editor.getNode(miner.id)).toMatchObject({
    flow: { clockPercent: 100 },
    machines: [expect.objectContaining({ clockPercent: 100 })],
  });
  expect(isProductionLocked(editor.getNode(miner.id)!)).toBe(false);
});
