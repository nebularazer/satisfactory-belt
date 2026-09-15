import { GRID_SIZE } from "@satisfactory-belt/canvas-core";
import type { FactoryNode } from "@satisfactory-belt/factory-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";

/** Demo document supplied explicitly by the app; the editor does not seed content. */
export function createExampleFactory(catalog: GameCatalog): readonly FactoryNode[] {
  const examples = [
    { recipeId: "Recipe_IronPlate_C", machineCount: 1, sloopsUsed: 0 },
    { recipeId: "Recipe_IronPlateReinforced_C", machineCount: 3, sloopsUsed: 1 },
    { recipeId: "Recipe_Plastic_C", machineCount: 1, sloopsUsed: 2 },
    { recipeId: "Recipe_ComputerSuper_C", machineCount: 1, sloopsUsed: 0 },
    { recipeId: "Recipe_AlienPowerFuel_C", machineCount: 1, sloopsUsed: 0 },
    { recipeId: "Recipe_QuantumEnergy_C", machineCount: 1, sloopsUsed: 0 },
    { recipeId: "Recipe_CoolingSystem_C", machineCount: 1, sloopsUsed: 0 },
  ];
  const nodes: FactoryNode[] = examples.map((example, index) => {
    const recipe = catalog.recipes[example.recipeId];
    if (!recipe)
      throw new Error(`The example recipe ${example.recipeId} is missing from the catalog.`);
    return {
      recipeId: example.recipeId,
      machineCount: example.machineCount,
      sloopsUsed: example.sloopsUsed,
      kind: "manufacturing",
      id: `machine-${index + 1}`,
      machineId: recipe.machineIds[0]!,
      clockPercent: 100,
      x: (5 + (index % 3) * 10) * GRID_SIZE,
      y: (5 + Math.floor(index / 3) * 10) * GRID_SIZE,
    };
  });
  nodes.push({
    kind: "fixed-producer",
    id: "gift-tree",
    producerId: "Build_TreeGiftProducer_C",
    machineCount: 1,
    x: 15 * GRID_SIZE,
    y: 25 * GRID_SIZE,
  });
  const extractions = [
    { id: "iron-miner", extractorId: "Build_MinerMk1_C", resourceId: "Desc_OreIron_C" },
    { id: "copper-miner", extractorId: "Build_MinerMk2_C", resourceId: "Desc_OreCopper_C" },
    { id: "water-extractor", extractorId: "Build_WaterPump_C", resourceId: "Desc_Water_C" },
    { id: "oil-extractor", extractorId: "Build_OilPump_C", resourceId: "Desc_LiquidOil_C" },
  ];
  for (const extraction of extractions) {
    const index = nodes.length;
    nodes.push({
      ...extraction,
      kind: "extractor",
      machineCount: 1,
      clockPercent: 100,
      x: (5 + (index % 3) * 10) * GRID_SIZE,
      y: (5 + Math.floor(index / 3) * 10) * GRID_SIZE,
    });
  }
  nodes.push(
    {
      kind: "logistics",
      id: "splitter",
      partId: "Build_ConveyorAttachmentSplitter_C",
      x: 35 * GRID_SIZE,
      y: 5 * GRID_SIZE,
    },
    {
      kind: "logistics",
      id: "merger",
      partId: "Build_ConveyorAttachmentMerger_C",
      x: 35 * GRID_SIZE,
      y: 11 * GRID_SIZE,
    },
  );
  return nodes;
}
