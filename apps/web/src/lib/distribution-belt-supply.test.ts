import { expect, it } from "vitest";

import { distributionBeltSupply, type DistributionSnapshot } from "./distribution-prototype";

const endpoint = (id: string, rate: number) => ({
  id,
  rate,
  title: id,
  groupKey: "recipe",
  type: "Machine",
  icon: "ore",
  sink: false,
});
const snapshot: DistributionSnapshot = {
  itemId: "ore",
  sources: [endpoint("miner", 90)],
  destinations: [endpoint("smelter1", 30), endpoint("smelter2", 60)],
};

it("substitutes matching incoming belts without changing the captured plan", () => {
  const before = structuredClone(snapshot);
  const result = distributionBeltSupply(snapshot, [60, 30], 1, "ore");
  expect(result.error).toBeUndefined();
  expect(result.sources.map((entry) => entry.rate)).toEqual([60, 30]);
  expect(result.destinations).toBe(snapshot.destinations);
  expect(snapshot).toEqual(before);
});

it("rejects both shortages and excess supply", () => {
  expect(distributionBeltSupply(snapshot, [60], 2, "ore").error).toContain("30/min more");
  expect(distributionBeltSupply(snapshot, [120], 2, "ore").error).toContain("30/min excess");
});

it("rejects an oversized belt even when the total matches", () => {
  expect(distributionBeltSupply(snapshot, [90], 1, "ore").error).toContain("Mk.1");
  expect(distributionBeltSupply(snapshot, [90], 2, "ore").error).toBeUndefined();
});

it("rejects missing, zero, negative and non-finite belt rates", () => {
  for (const rates of [[], [90, 0], [100, -10], [NaN], [Infinity]])
    expect(distributionBeltSupply(snapshot, rates, 6, "ore").error).toContain("positive rate");
});
