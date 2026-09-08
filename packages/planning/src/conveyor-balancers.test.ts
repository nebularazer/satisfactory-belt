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

function factory(
  rates: number[],
  supplies = [rates.reduce((a, b) => a + b, 0)],
): DetailedPlan {
  const nodes = [
    ...supplies.map((rate, index) =>
      process(
        `miner:${index}`,
        "extraction:Desc_OreIron_C",
        "Build_MinerMk3_C",
        rate,
      ),
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
  let sources = supplies.map((_, index) => ({
    nodeId: `miner:${index}`,
    portId: "output:Desc_OreIron_C",
  }));
  while (sources.length > 1) {
    const next: typeof sources = [];
    for (let index = 0; index < sources.length; index += 3) {
      const group = sources.slice(index, index + 3);
      if (group.length === 1) {
        next.push(group[0]!);
        continue;
      }
      const id = `merger:${nodes.length}`;
      const configuration = createNode({
        id,
        buildableId: "Build_ConveyorAttachmentMerger_C",
        kind: "router",
        itemId: "Desc_OreIron_C",
      }).configuration;
      assertDetailedNodeConfiguration(configuration);
      nodes.push({ configuration });
      group.forEach((from, port) =>
        connections.push({
          id: `edge:${connections.length}`,
          from,
          to: { nodeId: id, portId: `input:${port + 1}` },
          kind: "conveyor",
          tierId: "conveyor-mk6",
        }),
      );
      next.push({ nodeId: id, portId: "output:1" });
    }
    sources = next;
  }
  connections.push({
    id: "supply",
    from: sources[0]!,
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

  it.each([
    { rates: Array.from({ length: 5 }, () => 12) },
    { rates: Array.from({ length: 7 }, () => 12) },
    { rates: Array.from({ length: 11 }, () => 12) },
    { rates: [6, 12, 42] },
    { rates: [18, 42] },
  ])(
    "feeds $rates from a full belt without duplicating destination shares",
    ({ rates }) => {
      const total = rates.reduce((sum, rate) => sum + rate, 0);
      const original = factory(rates);
      const plan = createDetailedPlan({
        ...original,
        tiers: [
          {
            id: "test-conveyor",
            medium: "conveyor",
            capacityPerMinute: total,
          },
        ],
        connections: original.connections.map((edge) => ({
          ...edge,
          tierId: "test-conveyor",
        })),
      });
      const balanced = balanceDetailedConveyors(plan);
      const actual = physicalRates(balanced);
      expect(Math.max(...actual.values())).toBeCloseTo(total);
      for (const edge of balanced.connections) {
        if (edge.to.nodeId.startsWith("smelter:")) {
          expect(actual.get(edge.id)).toBeCloseTo(
            rates[Number(edge.to.nodeId.split(":")[1])]!,
            7,
          );
          if (rates.every((rate) => rate === rates[0]))
            expect(
              balanced.nodes.find(
                (node) => node.configuration.id === edge.from.nodeId,
              )?.configuration.buildableId,
            ).toBe("Build_ConveyorAttachmentSplitter_C");
        }
      }
      expect(analyzeDetailedPlan(balanced).diagnostics).toEqual([]);
      expect(balanceDetailedConveyors(plan)).toEqual(balanced);
      if (rates.length === 5)
        expect(
          balanced.nodes.filter((node) => node.configuration.kind === "router"),
        ).toHaveLength(8);
    },
  );
  it.each([
    {
      rates: Array.from({ length: 16 }, () => 30),
      supplies: Array.from({ length: 8 }, () => 60),
    },
    { rates: [40, 40, 40], supplies: [60, 60] },
    { rates: [22.5, 67.5, 30], supplies: [60, 60], tier: "conveyor-mk2" },
  ])(
    "separates aggregate supply into capacity-limited feeds: $rates",
    ({ rates, supplies, tier = "conveyor-mk1" }) => {
      const original = factory(rates, supplies);
      const plan = createDetailedPlan({
        ...original,
        tiers: DEFAULT_LOGISTICS_TIERS.filter(
          (candidate) => candidate.id === tier,
        ),
        connections: original.connections.map((edge) => ({
          ...edge,
          tierId: tier,
        })),
      });
      const balanced = balanceDetailedConveyors(plan);
      const analysis = analyzeDetailedPlan(balanced);
      const actual = physicalRates(balanced);
      for (const edge of balanced.connections) {
        expect(actual.get(edge.id)).toBeLessThanOrEqual(
          balanced.tiers[0]!.capacityPerMinute + 1e-7,
        );
        if (edge.to.nodeId.startsWith("smelter:"))
          expect(actual.get(edge.id)).toBeCloseTo(
            rates[Number(edge.to.nodeId.split(":")[1])]!,
            7,
          );
        expect(
          analysis.connectionFlows.find((flow) => flow.connectionId === edge.id)
            ?.ratePerMinute,
        ).toBeCloseTo(actual.get(edge.id)!, 7);
      }
      expect(analysis.diagnostics).toEqual([]);
      expect(
        balanced.nodes.filter((node) => node.configuration.kind === "process"),
      ).toEqual(
        original.nodes.filter((node) => node.configuration.kind === "process"),
      );
      expect(balanceDetailedConveyors(plan)).toEqual(balanced);
    },
  );

  it("routes surplus production without requiring unused balancer branches", () => {
    const original = factory([40, 60], [60, 120]);
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
    const balanced = balanceDetailedConveyors(plan);
    const analysis = analyzeDetailedPlan(balanced);
    for (const flow of analysis.connectionFlows)
      expect(flow.ratePerMinute).toBeLessThanOrEqual(60 + 1e-7);
    for (const id of ["smelter:0", "smelter:1"])
      expect(analysis.machineEfficiency[id]).toBeCloseTo(1);
    for (const node of balanced.nodes) {
      if (
        node.configuration.buildableId !== "Build_ConveyorAttachmentSplitter_C"
      )
        continue;
      const outputs = balanced.connections.filter(
        (edge) => edge.from.nodeId === node.configuration.id,
      );
      const rates = outputs.map(
        (edge) =>
          analysis.connectionFlows.find(
            (flow) => flow.connectionId === edge.id,
          )!.ratePerMinute,
      );
      for (const rate of rates) expect(rate).toBeCloseTo(rates[0]!);
    }
  });

  it("reports a real single-port bottleneck instead of creating extra machine ports", () => {
    const original = factory([30, 30, 30]);
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
    expect(() => balanceDetailedConveyors(plan)).toThrow(
      "output ports can supply only 60 of the required 90",
    );
    expect(analyzeDetailedPlan(plan).diagnostics).toContainEqual(
      expect.objectContaining({ code: "detailed.connection.overload" }),
    );
  });
});
