import { describe, expect, it } from "vitest";
import {
  analyzeDetailedPlan,
  DEFAULT_LOGISTICS_TIERS,
} from "@satisfactory-belt/planning";
import { modularFrameFactory } from "@/canvas/modular-frame-fixture";
import { convertDetailed, defaultConversionSettings } from "./convert";
import { generateProduction } from "@/auto-build/generate-production";

describe("Detailed conversion settings", () => {
  it.each(["conveyor-mk1", "conveyor-mk6"])(
    "feeds Modular Frame rod inputs directly from whole balancer shares on %s",
    (conveyorTierId) => {
      const { document } = generateProduction({
        outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: 10 }],
        allowedAlternateIds: [],
        pinnedRecipes: { Desc_IronScrew_C: "Recipe_Alternate_Screw_C" },
      });
      const result = convertDetailed(
        document,
        { ...defaultConversionSettings, conveyorTierId },
        () => {},
      );
      const consumers = result.nodes.filter(
        (node) =>
          node.configuration.kind === "process" &&
          node.configuration.processId === "Recipe_ModularFrame_C",
      );
      expect(consumers).toHaveLength(5);
      const analysis = analyzeDetailedPlan(result);
      for (const consumer of consumers) {
        const feed = result.connections.find(
          (edge) =>
            edge.to.nodeId === consumer.configuration.id &&
            edge.to.portId === "input:Desc_IronRod_C",
        )!;
        expect(
          analysis.connectionFlows.find((flow) => flow.connectionId === feed.id)
            ?.ratePerMinute,
        ).toBeCloseTo(12, 7);
        expect(
          result.nodes.find(
            (node) => node.configuration.id === feed.from.nodeId,
          )?.configuration.buildableId,
        ).toBe("Build_ConveyorAttachmentSplitter_C");
      }
      expect(
        Object.values(analysis.machineEfficiency).every(
          (efficiency) => Math.abs(efficiency - 1) < 1e-7,
        ),
      ).toBe(true);
      expect(
        analysis.diagnostics.filter(
          (diagnostic) => diagnostic.code === "detailed.connection.overload",
        ),
      ).toEqual([]);
    },
  );

  it("limits generated links while exposing all tiers for later editing", () => {
    const stages: string[] = [];
    const result = convertDetailed(
      modularFrameFactory(false),
      { conveyorTierId: "conveyor-mk4", pipelineTierId: "pipeline-mk1" },
      (stage) => stages.push(stage),
    );
    expect(stages).toEqual([
      "Expanding machines",
      "Building balancers",
      "Checking belts and pipes",
    ]);
    expect(result.tiers).toEqual(DEFAULT_LOGISTICS_TIERS);
    expect(
      result.connections.every((connection) =>
        DEFAULT_LOGISTICS_TIERS.some(
          (tier) =>
            tier.id === connection.tierId &&
            tier.capacityPerMinute <=
              (connection.kind === "conveyor" ? 480 : 300),
        ),
      ),
    ).toBe(true);
  });

  it("automatically separates conveyor supply and rejects invalid settings", () => {
    const result = convertDetailed(
      modularFrameFactory(false),
      { ...defaultConversionSettings, conveyorTierId: "conveyor-mk1" },
      () => {},
    );
    expect(
      result.connections
        .filter((connection) => connection.kind === "conveyor")
        .every((connection) => connection.tierId === "conveyor-mk1"),
    ).toBe(true);
    const analysis = analyzeDetailedPlan(result);
    expect(
      Object.values(analysis.machineEfficiency).every(
        (efficiency) => efficiency > 1 - 1e-7,
      ),
    ).toBe(true);
    expect(
      analysis.conveyorProfiles.every(
        (profile) => profile.totalRatePerMinute <= 60 + 1e-7,
      ),
    ).toBe(true);
    for (const node of result.nodes.filter(
      (node) =>
        node.configuration.buildableId === "Build_ConveyorAttachmentSplitter_C",
    )) {
      const outputs = result.connections.filter(
        (edge) => edge.from.nodeId === node.configuration.id,
      );
      const rates = outputs.map(
        (edge) =>
          analysis.connectionFlows.find((flow) => flow.connectionId === edge.id)
            ?.ratePerMinute,
      );
      for (const rate of rates) expect(rate).toBeCloseTo(rates[0]!, 7);
    }
    expect(() =>
      convertDetailed(
        modularFrameFactory(false),
        { ...defaultConversionSettings, pipelineTierId: "conveyor-mk6" },
        () => {},
      ),
    ).toThrow("valid conveyor and pipeline tier");
  });
});

it("enforces pipeline capacity after expanding fluid machines", async () => {
  const { createNode } = await import("@satisfactory-belt/production");
  const { testCanvasNode } = await import("@/canvas/test-fixtures");
  const refinery = createNode({
    id: "refinery",
    kind: "process",
    buildableId: "Build_OilRefinery_C",
    processId: "Recipe_AluminaSolution_C",
  });
  const pump = createNode({
    id: "water",
    kind: "process",
    buildableId: "Build_WaterPump_C",
    processId: "extraction:Desc_Water_C",
  });
  if (refinery.kind !== "process" || pump.kind !== "process")
    throw new Error("Expected processes");
  const document = {
    ...modularFrameFactory(false),
    nodes: [
      {
        ...testCanvasNode("water"),
        configuration: createNode({
          ...pump.configuration,
          instances: [1, 2].map((index) => ({
            ...pump.configuration.instances[0]!,
            id: `pump:${index}`,
            clockSpeedPercent: 187.5,
          })),
        }).configuration,
      },
      {
        ...testCanvasNode("refinery"),
        configuration: createNode({
          ...refinery.configuration,
          instances: [
            { ...refinery.configuration.instances[0]!, clockSpeedPercent: 250 },
          ],
        }).configuration,
      },
    ],
    materialLinks: [
      {
        id: "water-pipe",
        from: { nodeId: "water", portId: "output:Desc_Water_C" },
        to: { nodeId: "refinery", portId: "input:Desc_Water_C" },
      },
    ],
  };
  expect(() =>
    convertDetailed(
      document,
      { ...defaultConversionSettings, pipelineTierId: "pipeline-mk1" },
      () => {},
    ),
  ).toThrow("450/min, above its 300/min limit");
  expect(
    convertDetailed(
      document,
      defaultConversionSettings,
      () => {},
    ).connections.every((connection) => connection.tierId === "pipeline-mk2"),
  ).toBe(true);
});
