import type { GameCatalog } from "@satisfactory-belt/game-data";
import { expect, it } from "vitest";

import {
  DEFAULT_SPLITTER_PROGRAM,
  filterAllows,
  splitterFilters,
  validateSplitterProgram,
} from "./splitters";
import type { SplitterProgram, SplitterRule } from "./splitters";
const catalog: GameCatalog = {
  schemaVersion: 1,
  source: { locale: "en", docsSha256: "a".repeat(64) },
  recipes: {},
  machines: {},
  extractors: {},
  fixedProducers: {},
  logistics: {},
  sinks: {},
  items: Object.fromEntries(
    Array.from({ length: 65 }, (_, i) => [
      `item${i}`,
      {
        id: `item${i}`,
        name: `Item ${i}`,
        description: "",
        form: "solid",
        sinkable: true,
        unit: "item",
        iconId: "icon",
      },
    ]),
  ),
};
const program: SplitterProgram = {
  "output:0": [{ kind: "item", itemId: "item0" }],
  "output:1": [{ kind: "any-undefined" }],
  "output:2": [{ kind: "overflow" }],
};
const rules = (count: number): readonly SplitterRule[] =>
  Array.from({ length: count }, (_, i) => ({ kind: "item", itemId: `item${i}` }));

it("defaults to an open center output and closed side outputs", () => {
  const filters = splitterFilters();
  expect(filterAllows(filters.get("output:0"), "item0")).toBe(false);
  expect(filterAllows(filters.get("output:1"), "item0")).toBe(true);
  expect(filterAllows(filters.get("output:2"), "item0")).toBe(false);
});
it("filters named items, undefined materials and all possible overflow materials", () => {
  const filters = splitterFilters(program);
  expect(filterAllows(filters.get("output:0"), "item0")).toBe(true);
  expect(filterAllows(filters.get("output:0"), "item1")).toBe(false);
  expect(filterAllows(filters.get("output:1"), "item0")).toBe(false);
  expect(filterAllows(filters.get("output:1"), "item1")).toBe(true);
  expect(filterAllows(filters.get("output:2"), "item0")).toBe(true);
  expect(filterAllows(filters.get("output:2"), "item1")).toBe(true);
});
it("allows multiple rules on programmable outputs but only one on smart outputs", () => {
  const multiple = {
    ...program,
    "output:0": [
      { kind: "item", itemId: "item0" },
      { kind: "item", itemId: "item1" },
    ] as readonly SplitterRule[],
  };
  expect(() => validateSplitterProgram("programmable-splitter", multiple, catalog)).not.toThrow();
  expect(() => validateSplitterProgram("smart-splitter", multiple, catalog)).toThrow("one rule");
  const filters = splitterFilters(multiple);
  expect(filterAllows(filters.get("output:0"), "item1")).toBe(true);
  expect(filterAllows(filters.get("output:1"), "item1")).toBe(false);
});
it("enforces the programmable limit, valid solid item references, output slots and duplicate rules", () => {
  expect(() =>
    validateSplitterProgram(
      "programmable-splitter",
      { ...program, "output:0": rules(62) },
      catalog,
    ),
  ).not.toThrow();
  expect(() =>
    validateSplitterProgram(
      "programmable-splitter",
      { ...program, "output:0": rules(63) },
      catalog,
    ),
  ).toThrow("64");
  expect(() =>
    validateSplitterProgram(
      "smart-splitter",
      { ...program, "output:0": [{ kind: "item", itemId: "missing" }] },
      catalog,
    ),
  ).toThrow("solid material");
  expect(() =>
    validateSplitterProgram(
      "programmable-splitter",
      { ...program, "output:0": [{ kind: "any" }, { kind: "any" }] },
      catalog,
    ),
  ).toThrow("Duplicate");
  expect(() => validateSplitterProgram("splitter", DEFAULT_SPLITTER_PROGRAM, catalog)).toThrow(
    "Only smart",
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise malformed persisted program data.
  expect(() => validateSplitterProgram("smart-splitter", {} as SplitterProgram, catalog)).toThrow(
    "three output",
  );
});
