import { describe, expect, it } from "vitest";

import {
  analyzeBasicPlan,
  analyzeDetailedPlan,
  generateBasicPlan,
  generateDetailedPlan,
} from "./index";

const request = {
  outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
} as const;

describe("Plan generation", () => {
  it("generates an independent deterministic Basic Plan", () => {
    const first = generateBasicPlan(request);
    const second = generateBasicPlan(request);
    expect(first).toEqual(second);
    expect(first.plan.kind).toBe("basic");
    expect(first.plan.materialLinks.length).toBeGreaterThan(0);
    expect(() => analyzeBasicPlan(first.plan)).not.toThrow();
  });

  it("generates individual Detailed Buildables with physical connections", () => {
    const generated = generateDetailedPlan(request);
    expect(generated.plan.kind).toBe("detailed");
    expect(
      generated.plan.nodes
        .filter(({ configuration }) => configuration.kind === "process")
        .every(
          ({ configuration }) =>
            configuration.kind !== "process" ||
            configuration.instances.length === 1,
        ),
    ).toBe(true);
    expect(
      generated.plan.connections.every(({ kind }) => kind === "conveyor"),
    ).toBe(true);
    expect(() => analyzeDetailedPlan(generated.plan)).not.toThrow();
  });
});
