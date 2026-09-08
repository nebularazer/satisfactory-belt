import { describe, expect, it } from "vitest";
import { analyzeDetailedPlan } from "@satisfactory-belt/planning";
import { modularFrameFactory } from "@/canvas/modular-frame-fixture";
import { convertDetailed, defaultConversionSettings } from "./convert";

describe("Detailed conversion settings", () => {
  it("persists only available tiers and reports real conversion stages", () => {
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
    expect(result.tiers.map((tier) => tier.id)).toEqual([
      "conveyor-mk1",
      "conveyor-mk2",
      "conveyor-mk3",
      "conveyor-mk4",
      "pipeline-mk1",
    ]);
    expect(
      result.connections.every((connection) =>
        result.tiers.some((tier) => tier.id === connection.tierId),
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
