import { describe, expect, it } from "vitest";

import {
  ProcessNodeConfigurationError,
  createProcessNode,
  findProductionProcess,
  productionProcessesForBuildable,
} from "./index";

describe("Production Processes", () => {
  it("presents authored Recipes through the common process model", () => {
    expect(findProductionProcess("Recipe_IronPlate_C")).toEqual({
      buildableIds: ["Build_ConstructorMk1_C"],
      id: "Recipe_IronPlate_C",
      inputItemIds: ["Desc_IronIngot_C"],
      kind: "recipe",
      name: "Iron Plate",
      outputItemIds: ["Desc_IronPlate_C"],
      recipeId: "Recipe_IronPlate_C",
    });
  });

  it("presents resource extraction through the same process model", () => {
    const ironExtraction = productionProcessesForBuildable(
      "Build_MinerMk2_C",
    ).find(
      (process) =>
        process.kind === "extraction" &&
        process.resourceItemId === "Desc_OreIron_C",
    );

    expect(ironExtraction).toMatchObject({
      buildableIds: [
        "Build_MinerMk1_C",
        "Build_MinerMk2_C",
        "Build_MinerMk3_C",
      ],
      inputItemIds: [],
      kind: "extraction",
      name: "Iron Ore Extraction",
      outputItemIds: ["Desc_OreIron_C"],
    });
  });
});

describe("Process Nodes", () => {
  it("creates one machine at 100% by default", () => {
    expect(
      createProcessNode({
        buildableId: "Build_ConstructorMk1_C",
        id: "iron-plates",
        processId: "Recipe_IronPlate_C",
      }),
    ).toEqual({
      configuration: {
        buildableId: "Build_ConstructorMk1_C",
        id: "iron-plates",
        instances: [
          {
            clockSpeedPercent: 100,
            id: "iron-plates:instance-1",
            somersloopCount: 0,
          },
        ],
        processId: "Recipe_IronPlate_C",
        processKind: "recipe",
      },
      kind: "process",
      profile: {
        inputs: [{ itemId: "Desc_IronIngot_C", ratePerMinute: 30 }],
        outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
        power: {
          consumed: { maximumMw: 4, minimumMw: 4 },
          produced: { maximumMw: 0, minimumMw: 0 },
        },
      },
    });
  });

  it("aggregates whole machines with individual Clock Speeds", () => {
    const node = createProcessNode({
      buildableId: "Build_ConstructorMk1_C",
      id: "iron-plates",
      instances: [
        { clockSpeedPercent: 100, id: "constructor-1" },
        { clockSpeedPercent: 100, id: "constructor-2" },
        { clockSpeedPercent: 40, id: "constructor-3" },
      ],
      processId: "Recipe_IronPlate_C",
    });

    expect(node.profile.inputs).toEqual([
      { itemId: "Desc_IronIngot_C", ratePerMinute: 72 },
    ]);
    expect(node.profile.outputs).toEqual([
      { itemId: "Desc_IronPlate_C", ratePerMinute: 48 },
    ]);
    expect(node.configuration.instances).toHaveLength(3);
    expect(node.profile.power.consumed.minimumMw).toBeCloseTo(9.191274, 6);
  });

  it("amplifies products and power without amplifying ingredients", () => {
    const node = createProcessNode({
      buildableId: "Build_ConstructorMk1_C",
      id: "amplified-plates",
      instances: [
        {
          clockSpeedPercent: 100,
          id: "constructor-1",
          somersloopCount: 1,
        },
      ],
      processId: "Recipe_IronPlate_C",
    });

    expect(node.profile.inputs).toEqual([
      { itemId: "Desc_IronIngot_C", ratePerMinute: 30 },
    ]);
    expect(node.profile.outputs).toEqual([
      { itemId: "Desc_IronPlate_C", ratePerMinute: 40 },
    ]);
    expect(node.profile.power.consumed).toEqual({
      maximumMw: 16,
      minimumMw: 16,
    });
  });

  it("supports the Smelter's single Somersloop slot", () => {
    const node = createProcessNode({
      buildableId: "Build_SmelterMk1_C",
      id: "amplified-ingots",
      instances: [{ id: "smelter-1", somersloopCount: 1 }],
      processId: "Recipe_IngotIron_C",
    });

    expect(node.profile.outputs).toEqual([
      { itemId: "Desc_IronIngot_C", ratePerMinute: 60 },
    ]);
    expect(node.profile.power.consumed).toEqual({
      maximumMw: 16,
      minimumMw: 16,
    });
  });

  it("preserves variable power ranges", () => {
    const node = createProcessNode({
      buildableId: "Build_Converter_C",
      id: "converted-bauxite",
      processId: "Recipe_Bauxite_Caterium_C",
    });

    expect(node.profile.power.consumed).toEqual({
      maximumMw: 400,
      minimumMw: 100,
    });
  });

  it("derives extractor rates from Clock Speed and Resource Purity", () => {
    const process = productionProcessesForBuildable("Build_MinerMk2_C").find(
      (candidate) =>
        candidate.kind === "extraction" &&
        candidate.resourceItemId === "Desc_OreIron_C",
    );
    if (!process) throw new Error("Missing Iron Ore extraction process");

    const node = createProcessNode({
      buildableId: "Build_MinerMk2_C",
      id: "iron-ore",
      instances: [
        {
          clockSpeedPercent: 250,
          id: "miner-1",
          resourcePurity: "pure",
        },
      ],
      processId: process.id,
    });

    expect(node.profile.inputs).toEqual([]);
    expect(node.profile.outputs).toEqual([
      { itemId: "Desc_OreIron_C", ratePerMinute: 600 },
    ]);
    expect(node.profile.power.consumed.minimumMw).toBeCloseTo(50.366259, 6);
  });

  it("rejects incompatible machines and invalid operating settings", () => {
    expect(() =>
      createProcessNode({
        buildableId: "Build_SmelterMk1_C",
        id: "wrong-machine",
        processId: "Recipe_IronPlate_C",
      }),
    ).toThrow(ProcessNodeConfigurationError);

    expect(() =>
      createProcessNode({
        buildableId: "Build_ConstructorMk1_C",
        id: "too-many-somersloops",
        instances: [{ id: "constructor-1", somersloopCount: 2 }],
        processId: "Recipe_IronPlate_C",
      }),
    ).toThrow(/Somersloop count.*between 0 and 1/);
  });
});
