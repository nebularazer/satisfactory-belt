import { describe, expect, it } from "vitest";

import {
  NodeConfigurationError,
  createNode,
  findProductionProcess,
  productionProcessesForBuildable,
  type NodeRequest,
} from "./index";

type ProcessNodeRequest = Extract<NodeRequest, { kind: "process" }>;

function createTestProcessNode(request: Omit<ProcessNodeRequest, "kind">) {
  const node = createNode({ ...request, kind: "process" });
  if (node.kind !== "process") throw new Error("Expected a Process Node");
  return node;
}

function calculatedMaterials(node: ReturnType<typeof createTestProcessNode>) {
  if (node.profile.materials.kind !== "calculated") {
    throw new Error("Expected a calculated Material Profile");
  }
  return node.profile.materials;
}

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
      createTestProcessNode({
        buildableId: "Build_ConstructorMk1_C",
        id: "iron-plates",
        processId: "Recipe_IronPlate_C",
      }),
    ).toMatchObject({
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
        kind: "process",
        processId: "Recipe_IronPlate_C",
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
        materials: {
          inputs: [{ itemId: "Desc_IronIngot_C", ratePerMinute: 30 }],
          kind: "calculated",
          outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
        },
        power: {
          consumed: { maximumMw: 4, minimumMw: 4 },
          produced: { maximumMw: 0, minimumMw: 0 },
        },
      },
    });
  });

  it("aggregates whole machines with individual Clock Speeds", () => {
    const node = createTestProcessNode({
      buildableId: "Build_ConstructorMk1_C",
      id: "iron-plates",
      instances: [
        { clockSpeedPercent: 100, id: "constructor-1" },
        { clockSpeedPercent: 100, id: "constructor-2" },
        { clockSpeedPercent: 40, id: "constructor-3" },
      ],
      processId: "Recipe_IronPlate_C",
    });

    expect(calculatedMaterials(node).inputs).toEqual([
      { itemId: "Desc_IronIngot_C", ratePerMinute: 72 },
    ]);
    expect(calculatedMaterials(node).outputs).toEqual([
      { itemId: "Desc_IronPlate_C", ratePerMinute: 48 },
    ]);
    expect(node.configuration.instances).toHaveLength(3);
    expect(node.profile.power.consumed.minimumMw).toBeCloseTo(9.191274, 6);
  });

  it("amplifies products and power without amplifying ingredients", () => {
    const node = createTestProcessNode({
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

    expect(calculatedMaterials(node).inputs).toEqual([
      { itemId: "Desc_IronIngot_C", ratePerMinute: 30 },
    ]);
    expect(calculatedMaterials(node).outputs).toEqual([
      { itemId: "Desc_IronPlate_C", ratePerMinute: 40 },
    ]);
    expect(node.profile.power.consumed).toEqual({
      maximumMw: 16,
      minimumMw: 16,
    });
  });

  it("supports the Smelter's single Somersloop slot", () => {
    const node = createTestProcessNode({
      buildableId: "Build_SmelterMk1_C",
      id: "amplified-ingots",
      instances: [{ id: "smelter-1", somersloopCount: 1 }],
      processId: "Recipe_IngotIron_C",
    });

    expect(calculatedMaterials(node).outputs).toEqual([
      { itemId: "Desc_IronIngot_C", ratePerMinute: 60 },
    ]);
    expect(node.profile.power.consumed).toEqual({
      maximumMw: 16,
      minimumMw: 16,
    });
  });

  it("preserves variable power ranges", () => {
    const node = createTestProcessNode({
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

    const node = createTestProcessNode({
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

    expect(calculatedMaterials(node).inputs).toEqual([]);
    expect(calculatedMaterials(node).outputs).toEqual([
      { itemId: "Desc_OreIron_C", ratePerMinute: 600 },
    ]);
    expect(node.profile.power.consumed.minimumMw).toBeCloseTo(50.366259, 6);
  });

  it("derives fuel, supplemental input, and power generation linearly", () => {
    const node = createTestProcessNode({
      buildableId: "Build_GeneratorCoal_C",
      id: "coal-power",
      instances: [
        { clockSpeedPercent: 100, id: "generator-1" },
        { clockSpeedPercent: 50, id: "generator-2" },
      ],
      processId: "power-generation:Build_GeneratorCoal_C:Desc_Coal_C",
    });

    expect(calculatedMaterials(node).inputs).toEqual([
      { itemId: "Desc_Coal_C", ratePerMinute: 22.5 },
      { itemId: "Desc_Water_C", ratePerMinute: 67.5 },
    ]);
    expect(calculatedMaterials(node).outputs).toEqual([]);
    expect(node.profile.power).toEqual({
      consumed: { maximumMw: 0, minimumMw: 0 },
      produced: { maximumMw: 112.5, minimumMw: 112.5 },
    });
  });

  it("derives nuclear waste from the selected fuel", () => {
    const node = createTestProcessNode({
      buildableId: "Build_GeneratorNuclear_C",
      id: "uranium-power",
      processId:
        "power-generation:Build_GeneratorNuclear_C:Desc_NuclearFuelRod_C",
    });

    expect(calculatedMaterials(node).inputs).toEqual([
      { itemId: "Desc_NuclearFuelRod_C", ratePerMinute: 0.2 },
      { itemId: "Desc_Water_C", ratePerMinute: 240 },
    ]);
    expect(calculatedMaterials(node).outputs).toEqual([
      { itemId: "Desc_NuclearWaste_C", ratePerMinute: 10 },
    ]);
    expect(node.profile.power.produced).toEqual({
      maximumMw: 2500,
      minimumMw: 2500,
    });
  });

  it("represents Geothermal Generator fluctuation by Geyser purity", () => {
    const node = createTestProcessNode({
      buildableId: "Build_GeneratorGeoThermal_C",
      id: "geothermal-power",
      instances: [
        { id: "geothermal-1", resourcePurity: "impure" },
        { id: "geothermal-2", resourcePurity: "pure" },
      ],
      processId: "power-generation:Build_GeneratorGeoThermal_C",
    });

    expect(calculatedMaterials(node).inputs).toEqual([]);
    expect(calculatedMaterials(node).outputs).toEqual([]);
    expect(node.profile.power.produced).toEqual({
      maximumMw: 750,
      minimumMw: 250,
    });
  });

  it("creates an AWESOME Sink without inventing a consumption rate", () => {
    const node = createTestProcessNode({
      buildableId: "Build_ResourceSink_C",
      id: "sink",
      itemId: "Desc_IronPlate_C",
      processId: "consumption:Build_ResourceSink_C",
    });

    expect(node.ports).toEqual([
      {
        direction: "input",
        forms: ["solid"],
        id: "input:material",
        itemId: "Desc_IronPlate_C",
        medium: "conveyor",
      },
    ]);
    expect(node.profile.materials).toEqual({ kind: "connection-dependent" });
    expect(node.profile.power.consumed).toEqual({
      maximumMw: 30,
      minimumMw: 30,
    });
  });

  it("coordinates Resource Well Pressurizers and satellite Extractors", () => {
    const node = createTestProcessNode({
      buildableId: "Build_FrackingSmasher_C",
      id: "oil-well",
      instances: [
        {
          id: "pressurizer-1",
          satellites: [
            { id: "extractor-1", resourcePurity: "impure" },
            { id: "extractor-2", resourcePurity: "normal" },
            { id: "extractor-3", resourcePurity: "pure" },
          ],
        },
      ],
      processId: "resource-well:Desc_LiquidOil_C",
    });

    expect(node.configuration).toMatchObject({
      buildableId: "Build_FrackingSmasher_C",
      instances: [
        {
          clockSpeedPercent: 100,
          satellites: [
            { id: "extractor-1", resourcePurity: "impure" },
            { id: "extractor-2", resourcePurity: "normal" },
            { id: "extractor-3", resourcePurity: "pure" },
          ],
        },
      ],
    });
    expect(calculatedMaterials(node).outputs).toEqual([
      { itemId: "Desc_LiquidOil_C", ratePerMinute: 210 },
    ]);
    expect(node.profile.power.consumed).toEqual({
      maximumMw: 150,
      minimumMw: 150,
    });
  });

  it("rejects incompatible machines and invalid operating settings", () => {
    expect(() =>
      createTestProcessNode({
        buildableId: "Build_SmelterMk1_C",
        id: "wrong-machine",
        processId: "Recipe_IronPlate_C",
      }),
    ).toThrow(NodeConfigurationError);

    expect(() =>
      createTestProcessNode({
        buildableId: "Build_ConstructorMk1_C",
        id: "too-many-somersloops",
        instances: [{ id: "constructor-1", somersloopCount: 2 }],
        processId: "Recipe_IronPlate_C",
      }),
    ).toThrow(/Somersloop count.*between 0 and 1/);

    expect(() =>
      createTestProcessNode({
        buildableId: "Build_GeneratorGeoThermal_C",
        id: "overclocked-geothermal",
        instances: [{ clockSpeedPercent: 100, id: "geothermal-1" }],
        processId: "power-generation:Build_GeneratorGeoThermal_C",
      }),
    ).toThrow(/cannot change Clock Speed/);

    expect(() =>
      createTestProcessNode({
        buildableId: "Build_ResourceSink_C",
        id: "radioactive-sink",
        itemId: "Desc_NuclearWaste_C",
        processId: "consumption:Build_ResourceSink_C",
      }),
    ).toThrow(/cannot consume Uranium Waste/);

    expect(() =>
      createTestProcessNode({
        buildableId: "Build_FrackingSmasher_C",
        id: "empty-well",
        instances: [{ id: "pressurizer-1", satellites: [] }],
        processId: "resource-well:Desc_Water_C",
      }),
    ).toThrow(/at least one satellite Extractor/);
  });
});
