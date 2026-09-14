import { describe, expect, it } from "vitest";

import { validateGameData } from "./index";
import type { GameCatalog, IconManifest } from "./index";

const hash = "a".repeat(64);
function fixture(): { catalog: GameCatalog; icons: IconManifest } {
  const variant = { path: `icons/${hash}.webp`, bytes: 42, sha256: hash };
  return {
    catalog: {
      schemaVersion: 1,
      source: { locale: "en-US", docsSha256: hash },
      items: {
        Item: {
          id: "Item",
          name: "Item",
          description: "",
          form: "solid",
          unit: "item",
          iconId: hash,
        },
      },
      machines: {
        Machine: {
          id: "Machine",
          descriptorId: "Descriptor",
          name: "Machine",
          description: "",
          iconId: hash,
          manufacturingSpeed: 1,
          power: { kind: "fixed", megawatts: 4 },
          powerConsumptionExponent: 1.321929,
        },
      },
      recipes: {
        Recipe: {
          id: "Recipe",
          name: "Recipe",
          durationSeconds: 6,
          ingredients: [],
          products: [{ itemId: "Item", amount: 2 }],
          machineIds: ["Machine"],
          alternate: false,
          events: [],
          variablePower: { constantMegawatts: 0, factorMegawatts: 1 },
        },
      },
    },
    icons: {
      schemaVersion: 1,
      format: "webp",
      encoding: "quality90",
      icons: {
        [hash]: {
          id: hash,
          variants: {
            64: { ...variant, width: 64, height: 64 },
            128: { ...variant, width: 128, height: 128 },
            256: { ...variant, width: 256, height: 256 },
          },
        },
      },
    },
  };
}
describe("game data validation", () => {
  it("allows recipes with no ingredients and complete references", () => {
    const { catalog, icons } = fixture();
    expect(() => validateGameData(catalog, icons)).not.toThrow();
  });
  it("rejects invalid durations and quantities", () => {
    for (const value of [0, -1, Infinity, NaN]) {
      const { catalog, icons } = fixture();
      catalog.recipes.Recipe.durationSeconds = value;
      expect(() => validateGameData(catalog, icons)).toThrow("duration");
      catalog.recipes.Recipe.durationSeconds = 6;
      catalog.recipes.Recipe.products[0].amount = value;
      expect(() => validateGameData(catalog, icons)).toThrow("amount");
    }
  });
  it("rejects missing items, machines and images", () => {
    const { catalog, icons } = fixture();
    catalog.recipes.Recipe.products[0].itemId = "Missing";
    expect(() => validateGameData(catalog, icons)).toThrow("Missing item");
    catalog.recipes.Recipe.products[0].itemId = "Item";
    catalog.recipes.Recipe.machineIds = ["Missing"];
    expect(() => validateGameData(catalog, icons)).toThrow("Missing machine");
    catalog.recipes.Recipe.machineIds = ["Machine"];
    delete icons.icons[hash];
    expect(() => validateGameData(catalog, icons)).toThrow("Missing icon");
  });
});
