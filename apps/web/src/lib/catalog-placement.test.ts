import type { SearchEntry } from "@satisfactory-belt/game-data/search";
import { expect, it } from "vitest";

import { catalogConfiguration, eligibleCatalogEntries } from "./catalog-placement";

const entry = (
  kind: SearchEntry["kind"],
  entityId: string,
  extra: Partial<SearchEntry> = {},
): SearchEntry => ({
  kind,
  entityId,
  id: `${kind}:${entityId}`,
  name: entityId,
  iconId: "icon",
  subtitle: "",
  alternate: false,
  events: [],
  machineIds: [],
  normalizedName: entityId,
  terms: entityId,
  words: [entityId],
  ...extra,
});
it("preserves a supported machine scope and uses the displayed default for other alternatives", () => {
  const recipe = entry("recipe", "recipe", { machineIds: ["a", "b"] });
  expect(catalogConfiguration(recipe, { kind: "machine", id: "b" })).toMatchObject({
    machineId: "b",
  });
  expect(catalogConfiguration(recipe, { kind: "machine", id: "c" })).toMatchObject({
    machineId: "a",
  });
  expect(catalogConfiguration(entry("resource", "ore", { extractorId: "miner" }))).toEqual({
    kind: "extractor",
    resourceId: "ore",
    extractorId: "miner",
  });
  expect(() => catalogConfiguration(entry("machine", "a"))).toThrow("Choose a recipe");
});
it("includes only eligible choices and their parents without removing alternatives from the full index", () => {
  const recipe = entry("recipe", "recipe", { machineIds: ["a", "b"] });
  const alternative = entry("recipe", "alternative", { machineIds: ["c"], alternate: true });
  const resource = entry("resource", "ore", { extractorId: "miner" });
  const index = [
    recipe,
    alternative,
    resource,
    entry("machine", "a"),
    entry("machine", "b"),
    entry("machine", "c"),
    entry("extractor", "miner"),
    entry("extractor", "other"),
  ];
  const eligible = eligibleCatalogEntries(
    index,
    (config) =>
      config.kind === "extractor" || (config.kind === "manufacturing" && config.machineId === "b"),
  );
  expect(eligible).toEqual(new Set([recipe.id, resource.id, "machine:b", "extractor:miner"]));
  expect(index).toContain(alternative);
  expect(eligibleCatalogEntries(index, () => false)).toEqual(new Set());
});
