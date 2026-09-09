import { describe, expect, it } from "vitest";
import { createNode } from "@satisfactory-belt/production";

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
    "shares workload evenly without extra machines or overclocking",
    (generate) => {
      const { plan } = generate({
        outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 90 }],
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
      expect(clocks).toEqual([90, 90, 90, 90, 90]);
      const plates = plan.nodes
        .filter(
          ({ configuration }) =>
            configuration.kind === "process" &&
            configuration.processId === "Recipe_IronPlate_C",
        )
        .map(({ configuration }) => createNode(configuration));
      expect(
        plates.reduce(
          (sum, node) => sum + node.profile.power.consumed.maximumMw,
          0,
        ),
      ).toBeCloseTo(17.3997, 4);
      expect(
        plates.reduce(
          (sum, node) =>
            sum +
            (node.profile.materials.kind === "calculated"
              ? node.profile.materials.outputs[0]!.ratePerMinute
              : 0),
          0,
        ),
      ).toBeCloseTo(90, 7);
      for (const { configuration } of plan.nodes) {
        if (configuration.kind !== "process") continue;
        for (const instance of configuration.instances)
          if ("clockSpeedPercent" in instance) {
            expect(instance.clockSpeedPercent).toBeLessThanOrEqual(100);
            expect(instance.clockSpeedPercent).toBeGreaterThanOrEqual(1);
          }
      }
    },
  );

  it.each([20, 50, 60.000000001])(
    "preserves output and machine count for %s plates/min",
    (ratePerMinute) => {
      const { plan } = generateBasicPlan({
        outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute }],
      });
      const configuration = plan.nodes.find(
        ({ configuration }) =>
          configuration.kind === "process" &&
          configuration.processId === "Recipe_IronPlate_C",
      )!.configuration;
      if (configuration.kind !== "process")
        throw new Error("Expected a process");
      expect(configuration.instances).toHaveLength(
        ratePerMinute === 20 ? 1 : 3,
      );
      const materials = createNode(configuration).profile.materials;
      if (materials.kind !== "calculated")
        throw new Error("Expected calculated output");
      expect(materials.outputs[0]!.ratePerMinute).toBeCloseTo(ratePerMinute, 7);
      const clocks = configuration.instances.map((instance) =>
        "clockSpeedPercent" in instance
          ? instance.clockSpeedPercent
          : undefined,
      );
      expect(new Set(clocks).size).toBe(1);
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
    expect(analyzeDetailedPlan(generated.plan).diagnostics).toEqual([]);
    expect(
      generated.plan.connections.every(
        (connection) => connection.tierId === "conveyor-mk1",
      ),
    ).toBe(true);
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
