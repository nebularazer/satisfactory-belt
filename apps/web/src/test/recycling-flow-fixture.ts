import { createRecyclingReference } from "../lib/recycling-reference";
import { storageFlowFixture } from "./storage-flow-fixture";

/** Rates at 100%, independently specified from the reference's member settings. */
export function recyclingFlowFixture() {
  const { assets } = storageFlowFixture();
  const catalog = assets.catalog;
  const recipes = [
    [
      "Recipe_Alternate_HeavyOilResidue_C",
      [["LiquidOil", 30]],
      [
        ["HeavyOilResidue", 40],
        ["PolymerResin", 20],
      ],
    ],
    [
      "Recipe_Alternate_DilutedFuel_C",
      [
        ["HeavyOilResidue", 50],
        ["Water", 100],
      ],
      [["LiquidFuel", 100]],
    ],
    [
      "Recipe_Alternate_Plastic_1_C",
      [
        ["Rubber", 30],
        ["LiquidFuel", 30],
      ],
      [["Plastic", 60]],
    ],
    [
      "Recipe_Alternate_RecycledRubber_C",
      [
        ["Plastic", 30],
        ["LiquidFuel", 30],
      ],
      [["Rubber", 60]],
    ],
    [
      "Recipe_ResidualRubber_C",
      [
        ["PolymerResin", 40],
        ["Water", 40],
      ],
      [["Rubber", 20]],
    ],
  ] as const;
  for (const [id, ingredients, products] of recipes) {
    for (const [name] of [...ingredients, ...products]) {
      const itemId = `Desc_${name}_C`;
      const fluid = ["LiquidOil", "HeavyOilResidue", "Water", "LiquidFuel"].includes(name);
      catalog.items[itemId] = {
        ...catalog.items.iron!,
        id: itemId,
        iconId: itemId,
        form: fluid ? "liquid" : "solid",
        unit: fluid ? "m3" : "item",
      };
    }
    catalog.recipes[id] = {
      ...catalog.recipes.ingot!,
      id,
      durationSeconds: 60,
      machineIds: [id.includes("Diluted") ? "Build_Blender_C" : "Build_OilRefinery_C"],
      ingredients: ingredients.map(([name, amount]) => ({ itemId: `Desc_${name}_C`, amount })),
      products: products.map(([name, amount]) => ({ itemId: `Desc_${name}_C`, amount })),
    };
  }
  for (const id of ["Build_Blender_C", "Build_OilRefinery_C"])
    catalog.machines[id] = { ...catalog.machines.smelter!, id };
  catalog.extractors.Build_WaterPump_C = {
    ...catalog.extractors.miner!,
    id: "Build_WaterPump_C",
    resourceIds: ["Desc_Water_C"],
    hasPurity: false,
  };
  catalog.logistics.Build_ConveyorAttachmentSplitter_C = {
    ...catalog.logistics.splitter!,
    id: "Build_ConveyorAttachmentSplitter_C",
  };
  catalog.buildings!.Build_StorageContainerMk1_C = {
    ...catalog.buildings!.storage!,
    id: "Build_StorageContainerMk1_C",
  };
  return { assets, document: createRecyclingReference() };
}
