import { describe, expect, it } from "vitest";

import {
  searchBuffers,
  searchExtractorResources,
  searchExtractors,
  searchLogistics,
  searchMachines,
  searchPowerGenerators,
  searchRecipes,
  searchResourceWellPressurizers,
  searchSpecialBuildables,
  searchTransports,
} from "./index";

describe("production search", () => {
  it("searches each Buildable group by names and domain terms", () => {
    expect(searchMachines("constructor").map(({ name }) => name)).toEqual([
      "Constructor",
    ]);
    expect(searchExtractors("iron ore").map(({ name }) => name)).toEqual([
      "Miner Mk.1",
      "Miner Mk.2",
      "Miner Mk.3",
    ]);
    expect(searchLogistics("junction").map(({ name }) => name)).toEqual([
      "Pipeline Junction",
      "Pipeline T-Junction",
    ]);
    expect(searchSpecialBuildables("sink").map(({ name }) => name)).toEqual([
      "AWESOME Sink",
    ]);
    expect(searchPowerGenerators("nuclear").map(({ name }) => name)).toEqual([
      "Nuclear Power Plant",
    ]);
    expect(searchBuffers("fluid").map(({ name }) => name)).toEqual([
      "Fluid Buffer",
      "Industrial Fluid Buffer",
    ]);
    expect(searchTransports("freight").map(({ name }) => name)).toEqual([
      "Fluid Freight Platform",
      "Freight Platform",
    ]);
    expect(
      searchResourceWellPressurizers("nitrogen").map(({ name }) => name),
    ).toEqual(["Resource Well Pressurizer"]);
  });

  it("ranks a Recipe name above material-only matches", () => {
    expect(searchRecipes("iron plate")[0]?.name).toBe("Iron Plate");
  });

  it("limits Recipe results to the selected Production Machine", () => {
    expect(
      searchRecipes("iron", { machineId: "Build_SmelterMk1_C" }).every(
        ({ machineIds }) => machineIds.includes("Build_SmelterMk1_C"),
      ),
    ).toBe(true);
  });

  it("searches the resources supported by an extractor", () => {
    expect(
      searchExtractorResources("Build_MinerMk1_C", "iron").map(
        ({ name }) => name,
      ),
    ).toEqual(["Iron Ore"]);
  });
});
