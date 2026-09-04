import { describe, expect, it } from "vitest";

import {
  catalogBuildable,
  productionItem,
  recipesProducing,
} from "./production-catalog";

describe("production catalog", () => {
  it("normalizes alternate recipes and calculates per-minute rates", () => {
    const castScrews = recipesProducing("Desc_IronScrew_C").find(
      ({ id }) => id === "Recipe_Alternate_Screw_C",
    );

    expect(castScrews).toMatchObject({
      alternate: true,
      inputs: [
        {
          itemId: "Desc_IronIngot_C",
          ratePerMinute: 12.5,
        },
      ],
      name: "Cast Screws",
      outputs: [
        {
          itemId: "Desc_IronScrew_C",
          ratePerMinute: 50,
        },
      ],
    });
  });

  it("lists standard production routes before alternate routes", () => {
    expect(
      recipesProducing("Desc_IronScrew_C").map(({ alternate, name }) => ({
        alternate,
        name,
      })),
    ).toEqual([
      { alternate: false, name: "Screws" },
      { alternate: true, name: "Cast Screws" },
      { alternate: true, name: "Steel Screws" },
    ]);
  });

  it("keeps fluid rates in cubic metres per minute", () => {
    const water = productionItem("Desc_Water_C");
    const wetConcrete = recipesProducing("Desc_Cement_C").find(
      ({ name }) => name === "Wet Concrete",
    );

    expect(water?.form).toBe("liquid");
    expect(water?.imageUrl).toBe("/items/Desc_Water_C.png");
    expect(
      wetConcrete?.inputs.find(({ itemId }) => itemId === "Desc_Water_C"),
    ).toMatchObject({ amount: 5, ratePerMinute: 100 });
  });

  it("includes directly placeable infrastructure", () => {
    expect(catalogBuildable("Build_MinerMk1_C")?.name).toBe("Miner Mk.1");
    expect(catalogBuildable("Build_ConveyorAttachmentSplitter_C")?.name).toBe(
      "Conveyor Splitter",
    );
    expect(catalogBuildable("Build_ResourceSink_C")?.name).toBe("AWESOME Sink");
  });
});
