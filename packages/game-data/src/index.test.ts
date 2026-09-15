import { describe, expect, it } from "vitest";

import { validateGameData } from "./index";
import type { GameCatalog, IconManifest } from "./index";

const hash = "a".repeat(64);
function fixture(): { catalog: GameCatalog; icons: IconManifest } {
  const variant = { path: `icons/${hash}.webp`, bytes: 42, sha256: hash };
  return {
    catalog: {
      schemaVersion: 1,
      extractors: {},
      logistics: {},
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
          canOverclock: true,
          sloopSlots: 1,
          productionBoost: { base: 1, perSloop: 1, powerExponent: 2 },
        },
      },
      fixedProducers: {},
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
  it("rejects logistics parts with missing images or invalid identities", () => {
    const { catalog, icons } = fixture();
    catalog.logistics.Part = {
      id: "Part",
      name: "Splitter",
      description: "",
      descriptorId: "Desc_Part",
      iconId: hash,
      kind: "splitter",
    };
    expect(() => validateGameData(catalog, icons)).not.toThrow();
    catalog.logistics.Part.iconId = "missing";
    expect(() => validateGameData(catalog, icons)).toThrow("Missing icon");
    catalog.logistics.Part.iconId = hash;
    catalog.logistics.Part.id = "other";
    expect(() => validateGameData(catalog, icons)).toThrow("Invalid logistics part");
  });
  it("validates extractor resources, power and image references", () => {
    const { catalog, icons } = fixture();
    const extractor = {
      id: "Miner",
      name: "Miner",
      description: "",
      descriptorId: "Desc_Miner",
      iconId: hash,
      resourceIds: ["Item"],
      powerMegawatts: 5,
      powerConsumptionExponent: 1.321929,
      canOverclock: true,
    };
    catalog.extractors.Miner = extractor;
    expect(() => validateGameData(catalog, icons)).not.toThrow();
    extractor.resourceIds = ["Missing"];
    expect(() => validateGameData(catalog, icons)).toThrow("Missing resource");
    extractor.resourceIds = [];
    expect(() => validateGameData(catalog, icons)).toThrow("Invalid resources");
    extractor.resourceIds = ["Item", "Item"];
    expect(() => validateGameData(catalog, icons)).toThrow("Invalid resources");
    extractor.resourceIds = ["Item"];
    extractor.powerMegawatts = -1;
    expect(() => validateGameData(catalog, icons)).toThrow("Invalid power");
    extractor.powerMegawatts = 5;
    extractor.iconId = "Missing";
    expect(() => validateGameData(catalog, icons)).toThrow("Missing icon");
  });
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
  it("validates fixed producer output, interval, power and references", () => {
    const { catalog, icons } = fixture();
    const producer = {
      id: "Tree",
      name: "Tree",
      description: "",
      descriptorId: "TreeDescriptor",
      iconId: hash,
      durationSeconds: 4,
      products: [{ itemId: "Item", amount: 1 }],
      powerMegawatts: 0,
      canOverclock: false,
      events: ["EV_Christmas"],
    };
    catalog.fixedProducers.Tree = producer;
    expect(() => validateGameData(catalog, icons)).not.toThrow();
    producer.durationSeconds = 0;
    expect(() => validateGameData(catalog, icons)).toThrow("duration");
    producer.durationSeconds = 4;
    producer.products = [{ itemId: "Missing", amount: 1 }];
    expect(() => validateGameData(catalog, icons)).toThrow("Missing item");
    producer.products = [{ itemId: "Item", amount: 0 }];
    expect(() => validateGameData(catalog, icons)).toThrow("amount");
    producer.products = [{ itemId: "Item", amount: 1 }];
    producer.iconId = "Missing";
    expect(() => validateGameData(catalog, icons)).toThrow("Missing icon");
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
