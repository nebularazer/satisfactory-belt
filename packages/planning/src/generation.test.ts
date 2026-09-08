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
  it.each([generateBasicPlan, generateDetailedPlan])(
    "adds machines instead of overclocking and underclocks the final instance",
    (generate) => {
      const { plan } = generate({
        outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 50 }],
      });
      const clocks = plan.nodes.flatMap(({ configuration }) =>
        configuration.kind === "process" &&
        configuration.processId === "Recipe_IronPlate_C"
          ? configuration.instances.map((instance) =>
              "clockSpeedPercent" in instance
                ? instance.clockSpeedPercent
                : undefined,
            )
          : [],
      );
      expect(clocks).toEqual([100, 100, 50]);
      for (const { configuration } of plan.nodes) {
        if (configuration.kind !== "process") continue;
        for (const instance of configuration.instances)
          if ("clockSpeedPercent" in instance)
            expect(instance.clockSpeedPercent).toBeLessThanOrEqual(100);
      }
    },
  );

  it("generates an independent deterministic Basic Plan", () => {
    const first = generateBasicPlan(request);
    const second = generateBasicPlan(request);
    expect(first).toEqual(second);
    expect(first.plan.kind).toBe("basic");
    expect(
      first.plan.nodes.some(
        (node) =>
          node.configuration.kind === "process" &&
          node.configuration.processId === "extraction:Desc_OreIron_C",
      ),
    ).toBe(true);
    expect(
      first.plan.nodes.some(
        (node) => node.configuration.buildableId === "Build_Converter_C",
      ),
    ).toBe(false);
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

  it("balances every split in a generated Modular Frame factory", () => {
    const { plan } = generateDetailedPlan({
      outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: 20 }],
    });
    const analysis = analyzeDetailedPlan(plan);
    const splitters = plan.nodes.filter(
      (node) =>
        node.configuration.buildableId === "Build_ConveyorAttachmentSplitter_C",
    );
    expect(splitters.length).toBeGreaterThan(0);
    for (const node of splitters) {
      const outputs = plan.connections.filter(
        (connection) => connection.from.nodeId === node.configuration.id,
      );
      const rates = outputs.map(
        (connection) =>
          analysis.connectionFlows.find(
            (flow) => flow.connectionId === connection.id,
          )?.ratePerMinute,
      );
      expect(rates.length).toBeGreaterThan(1);
      for (const rate of rates) expect(rate).toBeCloseTo(rates[0]!, 7);
    }
    expect(
      Object.values(analysis.machineEfficiency).every(
        (value) => value > 1 - 1e-7,
      ),
    ).toBe(true);
    expect(analysis.diagnostics).toEqual([]);
  });
});
