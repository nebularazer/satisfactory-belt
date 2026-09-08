import { describe, expect, it } from "vitest";
import { createNode } from "@satisfactory-belt/production";
import {
  analyzeDetailedPlan,
  assertDetailedNodeConfiguration,
  balanceDetailedConveyors,
  createDetailedPlan,
  DEFAULT_LOGISTICS_TIERS,
} from "./index";
import type { DetailedNode, DetailedPlan } from "./types";

function process(
  id: string,
  processId: string,
  buildableId: string,
  rate: number,
): DetailedNode {
  const node = createNode({ id, processId, buildableId, kind: "process" });
  if (node.kind !== "process" || node.profile.materials.kind !== "calculated")
    throw new Error("Expected process");
  const baseRate = (node.profile.materials.inputs[0] ??
    node.profile.materials.outputs[0])!.ratePerMinute;
  const configuration = createNode({
    ...node.configuration,
    instances: [
      {
        ...node.configuration.instances[0]!,
        clockSpeedPercent: (100 * rate) / baseRate,
      },
    ],
  }).configuration;
  assertDetailedNodeConfiguration(configuration);
  return { configuration };
}

function factory(rates: number[]): DetailedPlan {
  const nodes = [
    process(
      "miner",
      "extraction:Desc_OreIron_C",
      "Build_MinerMk3_C",
      rates.reduce((a, b) => a + b, 0),
    ),
    ...rates.map((rate, index) =>
      process(
        `smelter:${index}`,
        "Recipe_IngotIron_C",
        "Build_SmelterMk1_C",
        rate,
      ),
    ),
  ];
  const addTree = (indices: number[]): string => {
    const id = `splitter:${nodes.length}`;
    const configuration = createNode({
      id,
      buildableId: "Build_ConveyorAttachmentSplitter_C",
      itemId: "Desc_OreIron_C",
      kind: "router",
    }).configuration;
    assertDetailedNodeConfiguration(configuration);
    nodes.push({ configuration });
    const groups = Array.from(
      { length: Math.min(3, indices.length) },
      (_, index) => indices.filter((_, i) => i % 3 === index),
    );
    groups.forEach((group, index) => {
      const child = group.length > 1 ? addTree(group) : `smelter:${group[0]}`;
      connections.push({
        id: `edge:${connections.length}`,
        from: { nodeId: id, portId: `output:${index + 1}` },
        to: {
          nodeId: child,
          portId: group.length > 1 ? "input:1" : "input:Desc_OreIron_C",
        },
        kind: "conveyor",
        tierId: "conveyor-mk6",
      });
    });
    return id;
  };
  const connections: DetailedPlan["connections"][number][] = [];
  const root = addTree(rates.map((_, index) => index));
  connections.push({
    id: "supply",
    from: { nodeId: "miner", portId: "output:Desc_OreIron_C" },
    to: { nodeId: root, portId: "input:1" },
    kind: "conveyor",
    tierId: "conveyor-mk6",
  });
  return createDetailedPlan({ nodes, connections });
}

// Independently propagate physical equal splits and merger sums, without using
// consumer demand to assign any branch rate. Return loops converge geometrically.
function physicalRates(plan: DetailedPlan) {
  let rates = new Map<string, number>();
  for (let iteration = 0; iteration < 200; iteration++) {
    const next = new Map<string, number>();
    for (const { configuration } of plan.nodes) {
      const node = createNode(configuration);
      const outgoing = plan.connections.filter(
        (edge) => edge.from.nodeId === configuration.id,
      );
      const supply =
        node.kind === "process" && node.profile.materials.kind === "calculated"
          ? (node.profile.materials.outputs.find(
              (output) => output.itemId === "Desc_OreIron_C",
            )?.ratePerMinute ?? 0)
          : plan.connections
              .filter((edge) => edge.to.nodeId === configuration.id)
              .reduce((sum, edge) => sum + (rates.get(edge.id) ?? 0), 0);
      for (const edge of outgoing) next.set(edge.id, supply / outgoing.length);
    }
    rates = next;
  }
  return rates;
}

describe("Detailed conveyor balancers", () => {
  it.each([
    [15, 15, 15, 15],
    [15, 15, 15, 15, 15],
    [15, 15, 15, 15, 15, 15, 15],
    [11.25, 11.25, 11.25, 11.25, 11.25, 11.25, 11.25, 11.25],
    [22.5, 67.5, 30],
    [10, 20, 30],
  ])("delivers the exact rates using physical equal splits: %j", (...rates) => {
    const original = factory(rates);
    const balanced = balanceDetailedConveyors(original);
    expect(balanceDetailedConveyors(original)).toEqual(balanced);
    const actual = physicalRates(balanced);
    const analysis = analyzeDetailedPlan(balanced);
    for (const connection of balanced.connections) {
      const expected = actual.get(connection.id)!;
      expect(
        analysis.connectionFlows.find(
          (flow) => flow.connectionId === connection.id,
        )?.ratePerMinute,
      ).toBeCloseTo(expected, 7);
      expect(expected).toBeLessThanOrEqual(
        balanced.tiers.find((tier) => tier.id === connection.tierId)!
          .capacityPerMinute + 1e-7,
      );
      if (connection.to.nodeId.startsWith("smelter:"))
        expect(expected).toBeCloseTo(
          rates[Number(connection.to.nodeId.split(":")[1])]!,
          7,
        );
    }
    expect(
      Object.values(analysis.machineEfficiency).every(
        (value) => Math.abs(value - 1) < 1e-7,
      ),
    ).toBe(true);
    expect(analysis.diagnostics).toEqual([]);
    expect(
      balanced.nodes.filter((node) => node.configuration.kind === "process"),
    ).toEqual(
      original.nodes.filter((node) => node.configuration.kind === "process"),
    );
  });

  it("requires enough belt capacity for the returning shares", () => {
    const original = factory([12, 12, 12, 12, 12]);
    const plan = createDetailedPlan({
      ...original,
      tiers: DEFAULT_LOGISTICS_TIERS.filter(
        (tier) => tier.id === "conveyor-mk1",
      ),
      connections: original.connections.map((edge) => ({
        ...edge,
        tierId: "conveyor-mk1",
      })),
    });
    expect(() => balanceDetailedConveyors(plan)).toThrow("72 items/min");
  });
});
