import { describe, expect, it } from "vitest";

import { nodeChoicesForBuildable } from "./index";

describe("Node choices", () => {
  it("lists Production Processes with caller-ready templates", () => {
    expect(nodeChoicesForBuildable("Build_ConstructorMk1_C")).toContainEqual({
      label: "Iron Plate",
      template: {
        buildableId: "Build_ConstructorMk1_C",
        kind: "process",
        processId: "Recipe_IronPlate_C",
      },
    });
    expect(nodeChoicesForBuildable("Build_MinerMk1_C")).toContainEqual({
      label: "Iron Ore",
      template: {
        buildableId: "Build_MinerMk1_C",
        kind: "process",
        processId: "extraction:Desc_OreIron_C",
      },
    });
    expect(nodeChoicesForBuildable("Build_FrackingSmasher_C")).toContainEqual({
      label: "Nitrogen Gas",
      template: {
        buildableId: "Build_FrackingSmasher_C",
        kind: "process",
        processId: "resource-well:Desc_NitrogenGas_C",
      },
    });
    expect(nodeChoicesForBuildable("Build_GeneratorCoal_C")).toContainEqual({
      label: "Coal-Powered Generator: Coal",
      template: {
        buildableId: "Build_GeneratorCoal_C",
        kind: "process",
        processId: "power-generation:Build_GeneratorCoal_C:Desc_Coal_C",
      },
    });
  });

  it("lists material behavior without exposing its catalog classification", () => {
    expect(
      nodeChoicesForBuildable("Build_ConveyorAttachmentSplitter_C"),
    ).toEqual([
      {
        label: "Conveyor Splitter",
        template: {
          buildableId: "Build_ConveyorAttachmentSplitter_C",
          kind: "router",
        },
      },
    ]);
    expect(nodeChoicesForBuildable("Build_StorageContainerMk1_C")).toEqual([
      {
        label: "Storage Container",
        template: {
          buildableId: "Build_StorageContainerMk1_C",
          kind: "buffer",
        },
      },
    ]);
    expect(nodeChoicesForBuildable("Build_TruckStation_C")).toEqual([
      {
        label: "Truck Station (Load)",
        template: {
          buildableId: "Build_TruckStation_C",
          kind: "transport",
          mode: "load",
        },
      },
      {
        label: "Truck Station (Unload)",
        template: {
          buildableId: "Build_TruckStation_C",
          kind: "transport",
          mode: "unload",
        },
      },
    ]);
  });

  it("does not offer an independent Resource Well Extractor Node", () => {
    expect(nodeChoicesForBuildable("Build_FrackingExtractor_C")).toEqual([]);
  });
});
