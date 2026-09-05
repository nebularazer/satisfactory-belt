import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "oxfmt";

import {
  generateImageVariants,
  mapConcurrent,
  removeUnexpectedWebpAssets,
  writeAssetVersionManifest,
} from "./image-assets.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(
  repositoryRoot,
  ".dev/assets/data/game-docs.en-US.json",
);
const outputDirectory = path.join(
  repositoryRoot,
  "packages/production/src/data",
);
const sourceItemImageDirectory = path.join(
  repositoryRoot,
  ".dev/assets/game/items",
);
const outputItemImageDirectory = path.join(
  repositoryRoot,
  "apps/web/public/items",
);

const productionMachineIds = new Set([
  "Build_AssemblerMk1_C",
  "Build_Blender_C",
  "Build_ConstructorMk1_C",
  "Build_Converter_C",
  "Build_FoundryMk1_C",
  "Build_HadronCollider_C",
  "Build_ManufacturerMk1_C",
  "Build_OilRefinery_C",
  "Build_Packager_C",
  "Build_QuantumEncoder_C",
  "Build_SmelterMk1_C",
]);

function round(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function producedInMachineIds(value) {
  return [...value.matchAll(/Build_[A-Za-z0-9_]+_C/g)]
    .map(([machineId]) => machineId)
    .filter((machineId) => productionMachineIds.has(machineId));
}

function parseAmounts(value) {
  return [
    ...value.matchAll(/ItemClass="[^"]*\.([^.'"/]+)'",Amount=([\d.-]+)/g),
  ].map(([, itemId, amount]) => ({ itemId, rawAmount: Number(amount) }));
}

function normalizedMaterial(material, durationSeconds, itemsById) {
  const item = itemsById.get(material.itemId);
  if (!item) throw new Error(`Missing item descriptor ${material.itemId}`);

  const unitScale = item.mForm === "RF_SOLID" ? 1 : 1_000;
  const amount = material.rawAmount / unitScale;
  return {
    amount: round(amount),
    itemId: material.itemId,
    ratePerMinute: round((amount * 60) / durationSeconds),
  };
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const classes = source.flatMap(({ Classes = [] }) => Classes);
const classesById = new Map(classes.map((entry) => [entry.ClassName, entry]));
const machineBasePowerById = new Map(
  [...productionMachineIds].map((machineId) => {
    const machine = classesById.get(machineId);
    if (!machine) throw new Error(`Missing machine descriptor ${machineId}`);
    return [machineId, Number(machine.mPowerConsumption)];
  }),
);
const recipeClasses = source.find(({ NativeClass }) =>
  NativeClass.endsWith("FactoryGame.FGRecipe'"),
)?.Classes;

if (!recipeClasses) throw new Error("Could not find FGRecipe data");

const referencedItemIds = new Set();
const recipes = recipeClasses
  .map((recipe) => {
    const machineIds = producedInMachineIds(recipe.mProducedIn);
    if (machineIds.length === 0) return null;

    const durationSeconds = Number(recipe.mManufactoringDuration);
    if (!(durationSeconds > 0)) {
      throw new Error(`Invalid duration for ${recipe.ClassName}`);
    }

    const inputs = parseAmounts(recipe.mIngredients);
    const outputs = parseAmounts(recipe.mProduct);
    if (outputs.length === 0) {
      throw new Error(`Recipe ${recipe.ClassName} has no parsed outputs`);
    }
    for (const { itemId } of [...inputs, ...outputs])
      referencedItemIds.add(itemId);

    const alternate = recipe.mDisplayName.startsWith("Alternate:");
    const name = alternate
      ? recipe.mDisplayName.replace(/^Alternate:\s*/, "")
      : recipe.mDisplayName;
    const variablePowerConstant = Number(
      recipe.mVariablePowerConsumptionConstant,
    );
    const variablePowerFactor = Number(recipe.mVariablePowerConsumptionFactor);
    const usesVariablePower = machineIds.some(
      (machineId) => machineBasePowerById.get(machineId) === 0,
    );

    return {
      alternate,
      durationSeconds,
      id: recipe.ClassName,
      inputs,
      machineIds,
      name,
      outputs,
      ...(usesVariablePower
        ? {
            power: {
              maximumMw: round(variablePowerConstant + variablePowerFactor),
              minimumMw: round(variablePowerConstant),
            },
          }
        : {}),
    };
  })
  .filter(Boolean);

const itemsById = new Map(
  [...referencedItemIds].map((itemId) => {
    const item = classesById.get(itemId);
    if (!item?.mDisplayName || !item.mForm) {
      throw new Error(`Missing item metadata for ${itemId}`);
    }
    return [itemId, item];
  }),
);

for (const recipe of recipes) {
  recipe.inputs = recipe.inputs.map((material) =>
    normalizedMaterial(material, recipe.durationSeconds, itemsById),
  );
  recipe.outputs = recipe.outputs.map((material) =>
    normalizedMaterial(material, recipe.durationSeconds, itemsById),
  );
}

recipes.sort(
  (left, right) =>
    left.name.localeCompare(right.name) ||
    Number(left.alternate) - Number(right.alternate),
);

const items = [...itemsById.entries()]
  .map(([id, item]) => {
    const form =
      item.mForm === "RF_LIQUID"
        ? "liquid"
        : item.mForm === "RF_GAS"
          ? "gas"
          : "solid";
    const energyMj = Number(item.mEnergyValue) * (form === "solid" ? 1 : 1_000);
    const sinkPoints = Number(item.mResourceSinkPoints);
    return {
      ...(energyMj > 0 ? { energyMj: round(energyMj) } : {}),
      form,
      id,
      name: item.mDisplayName,
      ...(sinkPoints > 0 ? { sinkPoints } : {}),
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

async function writeFormattedJson(fileName, value) {
  const filePath = path.join(outputDirectory, fileName);
  const result = await format(filePath, JSON.stringify(value, null, 2));
  if (result.errors.length > 0) {
    throw new Error(`Could not format ${fileName}`);
  }
  await writeFile(filePath, result.code);
}

await Promise.all([
  writeFormattedJson("items.json", items),
  writeFormattedJson("recipes.json", recipes),
  mapConcurrent(items, 8, ({ id }) =>
    generateImageVariants(
      path.join(sourceItemImageDirectory, `${id}.png`),
      outputItemImageDirectory,
      [64, 128, 256],
    ),
  ),
]);
await removeUnexpectedWebpAssets(
  outputItemImageDirectory,
  new Set(
    items.flatMap(({ id }) =>
      [64, 128, 256].map((width) => `${id}-${width}.webp`),
    ),
  ),
);
await writeAssetVersionManifest(
  [
    outputItemImageDirectory,
    path.join(repositoryRoot, "apps/web/public/buildables"),
  ],
  path.join(repositoryRoot, "apps/web/src/game/image-assets.generated.json"),
);

console.log(
  `Extracted ${recipes.length} recipes and ${items.length} items with images.`,
);
