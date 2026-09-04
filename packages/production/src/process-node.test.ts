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
      ports: [
        {
          direction: "input",
          forms: ["solid"],
          id: "input:Desc_IronIngot_C",
          itemId: "Desc_IronIngot_C",
          medium: "conveyor",
        },
        {
          direction: "output",
          forms: ["solid"],
          id: "output:Desc_IronPlate_C",
          itemId: "Desc_IronPlate_C",
          medium: "conveyor",
        },
      ],
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

  it("derives fuel, supplemental input, and power generation linearly", () => {
    const node = createProcessNode({
      buildableId: "Build_GeneratorCoal_C",
      id: "coal-power",
      instances: [
        { clockSpeedPercent: 100, id: "generator-1" },
        { clockSpeedPercent: 50, id: "generator-2" },
      ],
      processId: "power-generation:Build_GeneratorCoal_C:Desc_Coal_C",
    });

    expect(node.profile.inputs).toEqual([
      { itemId: "Desc_Coal_C", ratePerMinute: 22.5 },
      { itemId: "Desc_Water_C", ratePerMinute: 67.5 },
    ]);
    expect(node.profile.outputs).toEqual([]);
    expect(node.profile.power).toEqual({
      consumed: { maximumMw: 0, minimumMw: 0 },
      produced: { maximumMw: 112.5, minimumMw: 112.5 },
    });
  });

  it("derives nuclear waste from the selected fuel", () => {
    const node = createProcessNode({
      buildableId: "Build_GeneratorNuclear_C",
      id: "uranium-power",
      processId:
        "power-generation:Build_GeneratorNuclear_C:Desc_NuclearFuelRod_C",
    });

    expect(node.profile.inputs).toEqual([
      { itemId: "Desc_NuclearFuelRod_C", ratePerMinute: 0.2 },
      { itemId: "Desc_Water_C", ratePerMinute: 240 },
    ]);
    expect(node.profile.outputs).toEqual([
      { itemId: "Desc_NuclearWaste_C", ratePerMinute: 10 },
    ]);
    expect(node.profile.power.produced).toEqual({
      maximumMw: 2500,
      minimumMw: 2500,
    });
  });

  it("represents Geothermal Generator fluctuation by Geyser purity", () => {
    const node = createProcessNode({
      buildableId: "Build_GeneratorGeoThermal_C",
      id: "geothermal-power",
      instances: [
        { id: "geothermal-1", resourcePurity: "impure" },
        { id: "geothermal-2", resourcePurity: "pure" },
      ],
      processId: "power-generation:Build_GeneratorGeoThermal_C",
    });

    expect(node.profile.inputs).toEqual([]);
    expect(node.profile.outputs).toEqual([]);
    expect(node.profile.power.produced).toEqual({
      maximumMw: 750,
      minimumMw: 250,
    });
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

    expect(() =>
      createProcessNode({
        buildableId: "Build_GeneratorGeoThermal_C",
        id: "overclocked-geothermal",
        instances: [{ clockSpeedPercent: 100, id: "geothermal-1" }],
        processId: "power-generation:Build_GeneratorGeoThermal_C",
      }),
    ).toThrow(/cannot change Clock Speed/);
  });
});
