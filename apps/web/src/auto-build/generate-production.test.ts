import { describe, expect, it } from "vitest";
import {
  createNode,
  findRecipe,
  searchRecipes,
} from "@satisfactory-belt/production";
import { generateProduction } from "./generate-production";
import {
  productionRequest,
  type AutoBuildSettings,
} from "./production-request";
import { prepareProductionInsertion } from "@/canvas/insert-production";
import { createCanvasEditor } from "@/canvas/editor";
import {
  parseCanvasDocument,
  serializeCanvasDocument,
} from "@/canvas/document-format";

const settings: AutoBuildSettings = {
  outputs: [
    { itemId: "Desc_ModularFrame_C", ratePerMinute: 10 },
    { itemId: "Desc_IronPlate_C", ratePerMinute: 20 },
  ],
  allowedAlternateIds: [],
  pinnedRecipes: {},
};
const cast = searchRecipes("Cast Screws").find(
  (recipe) => recipe.name === "Cast Screws",
)!;
const processes = (result: ReturnType<typeof generateProduction>) =>
  result.document.nodes.flatMap((node) =>
    node.configuration.kind === "process" ? [node.configuration.processId] : [],
  );

describe("Auto-build production", () => {
  it("builds the requested net outputs using only standard recipes by default", () => {
    const result = generateProduction(settings);
    expect(result.document.nodes.length).toBeGreaterThan(5);
    expect(processes(result)).toContain("extraction:Desc_OreIron_C");
    expect(
      result.document.nodes.some(
        (node) => node.configuration.buildableId === "Build_Converter_C",
      ),
    ).toBe(false);
    expect(processes(result)).not.toContain("extraction:Desc_SAM_C");
    expect(processes(result).every((id) => !findRecipe(id)?.alternate)).toBe(
      true,
    );
    const net = new Map<string, number>();
    for (const node of result.document.nodes) {
      const profile = createNode(node.configuration).profile.materials;
      if (profile.kind !== "calculated") continue;
      for (const output of profile.outputs)
        net.set(
          output.itemId,
          (net.get(output.itemId) ?? 0) + output.ratePerMinute,
        );
      for (const input of profile.inputs)
        net.set(
          input.itemId,
          (net.get(input.itemId) ?? 0) - input.ratePerMinute,
        );
    }
    for (const output of settings.outputs)
      expect(net.get(output.itemId)).toBeCloseTo(output.ratePerMinute);
  });

  it("considers allowed alternatives but gives a required standard recipe precedence", () => {
    const allowed = { ...settings, allowedAlternateIds: [cast.id] };
    expect(processes(generateProduction(allowed))).toContain(cast.id);
    const standard = searchRecipes("Screws").find(
      (recipe) =>
        !recipe.alternate &&
        recipe.outputs.some((output) => output.itemId === "Desc_IronScrew_C"),
    )!;
    const pinned = {
      ...allowed,
      pinnedRecipes: { Desc_IronScrew_C: standard.id },
    };
    const result = processes(generateProduction(pinned));
    expect(result).toContain(standard.id);
    expect(result).not.toContain(cast.id);
  });

  it("enables a required alternative without requiring a second setting", () => {
    const result = generateProduction({
      ...settings,
      pinnedRecipes: { Desc_IronScrew_C: cast.id },
    });
    expect(processes(result)).toContain(cast.id);
  });

  it("allocates miners to the selected tier, purity counts, and clock limit", () => {
    const result = generateProduction({
      ...settings,
      resourceNodes: [
        {
          itemId: "Desc_OreIron_C",
          buildableId: "Build_MinerMk2_C",
          impure: 0,
          normal: 1,
          pure: 1,
          maximumClockPercent: 100,
        },
      ],
    });
    const miner = result.document.nodes.find(
      (node) =>
        node.configuration.kind === "process" &&
        node.configuration.processId === "extraction:Desc_OreIron_C",
    )!;
    expect(miner.configuration).toMatchObject({
      buildableId: "Build_MinerMk2_C",
      instances: [
        { resourcePurity: "pure", clockSpeedPercent: 75 },
        { resourcePurity: "normal", clockSpeedPercent: 75 },
      ],
    });
    const output = createNode(miner.configuration).profile.materials;
    expect(output).toMatchObject({
      outputs: [{ itemId: "Desc_OreIron_C", ratePerMinute: 270 }],
    });
  });

  it("reports unavailable resources and insufficient node capacity", () => {
    expect(() =>
      generateProduction({ ...settings, resourceNodes: [] }),
    ).toThrow("Iron Ore needs 270 items/min; your listed nodes can supply 0");
    expect(() =>
      generateProduction({
        ...settings,
        resourceNodes: [
          {
            itemId: "Desc_OreIron_C",
            buildableId: "Build_MinerMk1_C",
            impure: 0,
            normal: 1,
            pure: 0,
            maximumClockPercent: 100,
          },
        ],
      }),
    ).toThrow("can supply 60 items/min");
  });

  it("rejects malformed resource budgets", () => {
    const budget = {
      itemId: "Desc_OreIron_C",
      buildableId: "Build_MinerMk1_C",
      impure: 0,
      normal: 1,
      pure: 0,
      maximumClockPercent: 100,
    };
    expect(() =>
      productionRequest({ ...settings, resourceNodes: [budget, budget] }),
    ).toThrow("List each resource once");
    expect(() =>
      productionRequest({
        ...settings,
        resourceNodes: [{ ...budget, normal: 1.5 }],
      }),
    ).toThrow("whole numbers");
    expect(() =>
      productionRequest({
        ...settings,
        resourceNodes: [{ ...budget, maximumClockPercent: 251 }],
      }),
    ).toThrow("between 1%");
    expect(() =>
      productionRequest({
        ...settings,
        resourceNodes: [{ ...budget, buildableId: "Build_OilPump_C" }],
      }),
    ).toThrow("compatible extractor");
  });

  it("rejects rates that would be changed by the minimum machine clock", () => {
    expect(() =>
      generateProduction({
        ...settings,
        outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: 0.001 }],
      }),
    ).toThrow("clock limits");
  });

  it("rejects invalid requests before generation", () => {
    for (const rate of [0, -1, NaN, Infinity])
      expect(() =>
        productionRequest({
          ...settings,
          outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: rate }],
        }),
      ).toThrow("greater than zero");
    expect(() =>
      productionRequest({
        ...settings,
        pinnedRecipes: { Desc_ModularFrame_C: cast.id },
      }),
    ).toThrow("does not produce");
  });

  it("inserts independent groups in free space as one saved, undoable operation", () => {
    const generated = generateProduction(settings).document;
    const editor = createCanvasEditor();
    const empty = editor.getState().document;
    const first = prepareProductionInsertion(empty, generated, "first");
    editor.dispatch({
      type: "document.insert",
      source: empty,
      document: first,
    });
    const before = editor.getState().document;
    const second = prepareProductionInsertion(before, generated, "second");
    expect(Math.min(...second.nodes.map((node) => node.x))).toBeGreaterThan(
      Math.max(...before.nodes.map((node) => node.x + node.width)),
    );
    editor.dispatch({
      type: "document.insert",
      source: before,
      document: second,
    });
    const after = editor.getState().document;
    expect(after.nodes.slice(0, before.nodes.length)).toEqual(before.nodes);
    expect(new Set(after.nodes.map((node) => node.configuration.id)).size).toBe(
      after.nodes.length,
    );
    expect(editor.getState().selectedIds).toEqual(
      second.nodes.map((node) => node.configuration.id),
    );
    expect(parseCanvasDocument(serializeCanvasDocument(after))).toEqual(after);
    editor.dispatch({ type: "history.undo" });
    expect(editor.getState().document).toEqual(before);
    editor.dispatch({ type: "history.redo" });
    expect(editor.getState().document).toEqual(after);
    editor.dispatch({
      type: "document.insert",
      source: before,
      document: second,
    });
    expect(editor.getState().document).toEqual(after);
  });
});
