import { describe, expect, it } from "vitest";

import type { GameCatalog } from "./index";
import {
  createSearchIndex,
  searchCatalog,
  recipeSearchSummary,
  recipeAlternatives,
  compareRecipes,
} from "./search";

const catalog: GameCatalog = {
  schemaVersion: 1,
  source: { locale: "en-US", docsSha256: "test" },
  items: Object.fromEntries(
    ["Iron Ore", "Iron Plate", "Copper Ore"].map((name) => [
      name,
      {
        id: name,
        name,
        description: "",
        iconId: name,
        form: "solid",
        sinkable: false,
        unit: "item",
      },
    ]),
  ),
  machines: {
    Constructor: {
      id: "Constructor",
      name: "Constructor",
      description: "",
      descriptorId: "Constructor",
      iconId: "Constructor",
      manufacturingSpeed: 1,
      power: { kind: "fixed", megawatts: 4 },
      powerConsumptionExponent: 1.6,
      canOverclock: true,
      sloopSlots: 1,
      productionBoost: { base: 1, perSloop: 1, powerExponent: 2 },
    },
  },
  extractors: {
    Miner: {
      id: "Miner",
      name: "Miner Mk.2",
      description: "",
      descriptorId: "Miner",
      iconId: "Miner",
      resourceIds: ["Iron Ore", "Copper Ore"],
      powerMegawatts: 12,
      powerConsumptionExponent: 1.6,
      canOverclock: true,
    },
  },
  fixedProducers: {},
  logistics: {},
  sinks: {
    Sink: {
      id: "Sink",
      name: "AWESOME Sink",
      description: "",
      descriptorId: "Sink",
      iconId: "Sink",
      powerMegawatts: 30,
    },
  },
  recipes: Object.fromEntries(
    ["Iron Plate", "Coated Plate"].map((name) => [
      name,
      {
        id: name,
        name: name === "Coated Plate" ? "Alternate: Coated Plate" : name,
        durationSeconds: 6,
        ingredients: [{ itemId: "Iron Ore", amount: 3 }],
        products: [{ itemId: "Iron Plate", amount: 2 }],
        machineIds: ["Constructor"],
        alternate: name === "Coated Plate",
        events: [],
        variablePower: { constantMegawatts: 0, factorMegawatts: 0 },
      },
    ]),
  ),
};
const index = createSearchIndex(catalog);
const names = (query: string, options = {}) =>
  searchCatalog(index, query, options).map((entry) => entry.name);

describe("catalog search", () => {
  it("ranks exact names before output matches and supports unordered words", () => {
    expect(names("iron plate")).toEqual(["Iron Plate", "Coated Plate"]);
    expect(names("plate iron")).toEqual(["Iron Plate", "Coated Plate"]);
    expect(names("constructor")).toEqual(["Constructor", "Coated Plate", "Iron Plate"]);
    expect(names("iron ore")).toEqual(["Iron Ore"]); // Ingredients do not pollute ordinary search.
  });
  it("normalizes miner tiers and finds alternate aliases and the AWESOME Sink", () => {
    expect(names("mk 2")).toEqual(["Miner Mk.2"]);
    expect(names("MK.2")).toEqual(["Miner Mk.2"]);
    expect(names("alt plate")).toEqual(["Coated Plate"]);
    expect(names("sink")).toEqual(["AWESOME Sink"]);
  });
  it("uses a bounded typo fallback only when direct matches are absent", () => {
    expect(names("constrctor")).toEqual(["Coated Plate", "Constructor", "Iron Plate"]);
    expect(names("plte")).toEqual(["Coated Plate", "Iron Plate"]);
    expect(names("snk")).toEqual([]);
    expect(names("unknown")).toEqual([]);
  });
  it("filters categories and displays alternate badges without a name prefix", () => {
    expect(names("", { category: "recipes" })).toEqual([
      "Coated Plate",
      "Copper Ore",
      "Iron Ore",
      "Iron Plate",
    ]);
    expect(names("constructor", { category: "buildings" })).toEqual(["Constructor"]);
    expect(index.find((entry) => entry.entityId === "Coated Plate")).toMatchObject({
      name: "Coated Plate",
      alternate: true,
    });
  });
  it("summarizes baseline machine power and primary production rate", () => {
    expect(recipeSearchSummary(catalog, "Iron Plate")).toBe("Constructor · 4 MW · 20/min");
    const modified = structuredClone(catalog);
    modified.machines.Constructor.manufacturingSpeed = 2;
    modified.recipes["Iron Plate"].products.push({ itemId: "Copper Ore", amount: 10 });
    expect(recipeSearchSummary(modified, "Iron Plate")).toBe("Constructor · 4 MW · 40/min");
    modified.items["Iron Plate"].unit = "m3";
    modified.machines.Constructor.power = { kind: "variable" };
    expect(recipeSearchSummary(modified, "Iron Plate")).toBe(
      "Constructor · Variable power · 40 m³/min",
    );
  });
  it("only exposes compatible recipes/resources within their building scope", () => {
    expect(names("", { scope: { kind: "machine", id: "Constructor" } })).toEqual([
      "Coated Plate",
      "Iron Plate",
    ]);
    expect(names("", { scope: { kind: "extractor", id: "Miner" } })).toEqual([
      "Copper Ore",
      "Iron Ore",
    ]);
    expect(names("", { scope: { kind: "machine", id: "missing" } })).toEqual([]);
    expect(new Set(index.map((entry) => entry.id)).size).toBe(index.length);
  });
  it("offers extraction directly in global and recipe search while respecting eligibility", () => {
    for (const category of ["all", "recipes"] as const) {
      expect(searchCatalog(index, "iron ore", { category })).toMatchObject([
        { kind: "resource", entityId: "Iron Ore", extractorId: "Miner", subtitle: "Miner Mk.2" },
      ]);
      expect(
        names("ore", { category, allowedEntryIds: new Set(["resource:Miner:Iron Ore"]) }),
      ).toEqual(["Iron Ore"]);
    }
    expect(names("iron ore", { category: "buildings" })).toEqual([]);
    expect(names("iron ore", { allowedEntryIds: new Set(["recipe:Iron Plate"]) })).toEqual([]);
  });
});

it("finds alternatives by primary output and excludes the current recipe and byproducts", () => {
  const copy = structuredClone(catalog);
  copy.recipes.Byproduct = {
    ...copy.recipes["Iron Plate"],
    id: "Byproduct",
    name: "Byproduct",
    products: [
      { itemId: "Copper Ore", amount: 1 },
      { itemId: "Iron Plate", amount: 1 },
    ],
  };
  expect(recipeAlternatives(copy, "Iron Plate")).toEqual(["Coated Plate"]);
  expect(recipeAlternatives(copy, "Coated Plate")).toEqual(["Iron Plate"]);
  expect(recipeAlternatives(copy, "missing")).toEqual([]);
});

it("keeps eligibility restrictions through categories, scopes, and typo fallback", () => {
  const allowedEntryIds = new Set(["recipe:Iron Plate", "machine:Constructor"]);
  expect(names("", { allowedEntryIds })).toEqual(["Constructor", "Iron Plate"]);
  expect(names("plate", { allowedEntryIds })).toEqual(["Iron Plate"]);
  expect(names("plte", { allowedEntryIds })).toEqual(["Iron Plate"]);
  expect(names("", { allowedEntryIds, category: "buildings" })).toEqual(["Constructor"]);
  expect(names("", { allowedEntryIds, scope: { kind: "machine", id: "Constructor" } })).toEqual([
    "Iron Plate",
  ]);
  expect(names("", { allowedEntryIds: new Set() })).toEqual([]);
  expect(names("plate", { allowedEntryIds: new Set(["Iron Plate"]) })).toEqual([]);
  expect(
    names("ore", {
      allowedEntryIds: new Set(["resource:Miner:Iron Ore"]),
      scope: { kind: "extractor", id: "Miner" },
    }),
  ).toEqual(["Iron Ore"]);
});

it("supports multiword initialisms without giving them precedence over exact names", () => {
  const copy = structuredClone(catalog);
  copy.recipes.Heavy = { ...copy.recipes["Iron Plate"], id: "Heavy", name: "Heavy Modular Frame" };
  copy.recipes.Exact = { ...copy.recipes["Iron Plate"], id: "Exact", name: "HMF" };
  const entries = createSearchIndex(copy);
  expect(searchCatalog(entries, "hmf").map((entry) => entry.name)).toEqual([
    "HMF",
    "Heavy Modular Frame",
  ]);
  expect(searchCatalog(entries, "heavy mod")[0]?.name).toBe("Heavy Modular Frame");
});

it("finds alternate recipes by their output initialism", () => {
  const copy = structuredClone(catalog);
  copy.items["Iron Plate"].name = "Heavy Modular Frame";
  expect(searchCatalog(createSearchIndex(copy), "hmf").map((entry) => entry.entityId)).toEqual([
    "Coated Plate",
    "Iron Plate",
  ]);
});

it("compares alternatives at the selected recipe output using absolute capacity and power", () => {
  const copy = structuredClone(catalog);
  copy.recipes["Coated Plate"].durationSeconds = 3;
  copy.recipes["Coated Plate"].ingredients = [{ itemId: "Copper Ore", amount: 1 }];
  expect(compareRecipes(copy, "Iron Plate", "Coated Plate")).toMatchObject({
    outputPerMinute: 20,
    machines: 0.5,
    baselinePowerMegawatts: 4,
    powerMegawatts: 2,
    addedInputIds: ["Copper Ore"],
    removedInputIds: ["Iron Ore"],
  });
  expect(compareRecipes(copy, "Coated Plate", "Iron Plate")).toMatchObject({
    outputPerMinute: 40,
    machines: 2,
    baselinePowerMegawatts: 4,
    powerMegawatts: 8,
  });
  copy.machines.Constructor.power = { kind: "variable" };
  expect(compareRecipes(copy, "Iron Plate", "Coated Plate")).toMatchObject({
    powerMegawatts: null,
    baselinePowerMegawatts: null,
  });
  expect(compareRecipes(copy, "missing", "Coated Plate")).toBeUndefined();
  copy.recipes["Coated Plate"].products[0].itemId = "Copper Ore";
  expect(compareRecipes(copy, "Iron Plate", "Coated Plate")).toBeUndefined();
});

it("reports fluid inputs and byproducts at equal output, omitting irrelevant extras", () => {
  expect(compareRecipes(catalog, "Iron Plate", "Coated Plate")).toMatchObject({
    fluidInputIds: [],
    byproducts: [],
    addedInputIds: [],
    removedInputIds: [],
  });
  const copy = structuredClone(catalog);
  for (const [id, form] of [
    ["Water", "liquid"],
    ["Nitrogen", "gas"],
  ] as const) {
    copy.items[id] = { ...copy.items["Iron Ore"], id, name: id, form, unit: "m3" };
  }
  copy.recipes["Coated Plate"].ingredients = [
    { itemId: "Water", amount: 3 },
    { itemId: "Nitrogen", amount: 1 },
  ];
  copy.recipes["Coated Plate"].durationSeconds = 3;
  copy.recipes["Coated Plate"].products.push({ itemId: "Water", amount: 0.5 });
  expect(compareRecipes(copy, "Iron Plate", "Coated Plate")).toMatchObject({
    fluidInputIds: ["Water", "Nitrogen"],
    byproducts: [{ itemId: "Water", amountPerMinute: 5 }],
    addedInputIds: ["Water", "Nitrogen"],
    removedInputIds: ["Iron Ore"],
  });
  expect(compareRecipes(copy, "Coated Plate", "Iron Plate")).toMatchObject({
    fluidInputIds: [],
    byproducts: [],
    addedInputIds: ["Iron Ore"],
    removedInputIds: ["Water", "Nitrogen"],
  });
});
