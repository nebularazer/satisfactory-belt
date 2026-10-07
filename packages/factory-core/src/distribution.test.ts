import { expect, it } from "vitest";

import { buildDistribution, DISTRIBUTION_BELTS } from "./distribution";
import type { DistributionEndpoint, DistributionResult } from "./distribution";
import {
  collapseDistributionMergers,
  DistributionGraph,
  validateDistribution,
} from "./distribution-graph";

const endpoints = (prefix: string, rates: number[]): DistributionEndpoint[] =>
  rates.map((rate, index) => ({ id: `${prefix}${index}`, rate }));

function verifyFlow(
  graph: DistributionResult,
  sources: DistributionEndpoint[],
  destinations: DistributionEndpoint[],
  tier: number,
) {
  expect(graph.error).toBeUndefined();
  expect(validateDistribution(graph, sources, destinations, tier)).toBe(true);
  const supply = new Map(sources.map((entry) => [entry.id, entry.rate]));
  const demand = new Map(destinations.map((entry) => [entry.id, entry.rate]));
  const ids = new Set(graph.nodes.map((node) => node.id));
  expect(ids.size).toBe(graph.nodes.length);
  for (const edge of graph.edges) {
    expect(ids.has(edge.from) && ids.has(edge.to)).toBe(true);
    expect(edge.rate).toBeGreaterThan(0);
    expect(edge.tier).toBeGreaterThanOrEqual(1);
    expect(edge.tier).toBeLessThanOrEqual(tier);
    expect(edge.rate).toBeLessThanOrEqual(DISTRIBUTION_BELTS[edge.tier - 1] + 1e-5);
  }
  for (const node of graph.nodes) {
    const incoming = graph.edges.filter((edge) => edge.to === node.id);
    const outgoing = graph.edges.filter((edge) => edge.from === node.id);
    const totalIn = incoming.reduce((sum, edge) => sum + edge.rate, 0);
    const totalOut = outgoing.reduce((sum, edge) => sum + edge.rate, 0);
    expect(totalIn + (supply.get(node.id) ?? 0)).toBeCloseTo(
      totalOut + (demand.get(node.id) ?? 0),
      6,
    );
    if (node.kind === "splitter") {
      expect(incoming).toHaveLength(1);
      expect(outgoing.length).toBeGreaterThanOrEqual(2);
      expect(outgoing.length).toBeLessThanOrEqual(3);
      for (const edge of outgoing) expect(edge.rate).toBeCloseTo(totalOut / outgoing.length, 6);
    }
    if (node.kind === "merger") {
      expect(outgoing).toHaveLength(1);
      expect(incoming.length).toBeGreaterThanOrEqual(2);
      expect(incoming.length).toBeLessThanOrEqual(3);
    }
  }
}

it("connects equal-rate pairs directly", () => {
  const sources = endpoints("s", [30, 15.5, 30]);
  const destinations = endpoints("d", [15.5, 30, 30]);
  const before = structuredClone({ sources, destinations });
  const graph = buildDistribution(sources, destinations, 1);
  verifyFlow(graph, sources, destinations, 1);
  expect(graph.nodes).toHaveLength(6);
  expect(graph.edges).toHaveLength(3);
  expect(graph.edges.every((edge) => edge.from.startsWith("s") && edge.to.startsWith("d"))).toBe(
    true,
  );
  expect({ sources, destinations }).toEqual(before);
});

it("keeps three suppliers independent when splitting to six consumers", () => {
  const sources = endpoints("s", [30, 30, 30]);
  const destinations = endpoints("d", [15, 15, 15, 15, 15, 15]);
  const graph = buildDistribution(sources, destinations, 1);
  verifyFlow(graph, sources, destinations, 1);
  expect(graph.nodes.filter((node) => node.kind === "splitter")).toHaveLength(3);
  expect(graph.nodes.filter((node) => node.kind === "merger")).toHaveLength(0);
});

it("includes recirculation in belt capacity for a five-way equal split", () => {
  const sources = endpoints("s", [60]);
  const destinations = endpoints("d", [12, 12, 12, 12, 12]);
  const tooSmall = buildDistribution(sources, destinations, 1);
  expect(tooSmall.errorCode).toBe("construction-limit");
  expect(tooSmall.error).toContain("higher belt tier");
  expect(tooSmall.edges).toEqual([]);
  const graph = buildDistribution(sources, destinations, 2);
  verifyFlow(graph, sources, destinations, 2);
  expect(graph.edges.filter((edge) => edge.feedback).map((edge) => edge.rate)).toEqual([12]);
  expect(Math.max(...graph.edges.map((edge) => edge.rate))).toBe(72);
});

it("keeps endpoint IDs distinct from internal junction and return IDs", () => {
  const sources = [{ id: "distribution-0", rate: 60 }];
  const destinations = [{ id: "return", rate: 12 }, ...endpoints("junction-", [12, 12, 12, 12])];
  verifyFlow(buildDistribution(sources, destinations, 2), sources, destinations, 2);
});

it("distinguishes unsupported size, capacity and bounded-construction failures", () => {
  expect(buildDistribution(endpoints("s", [90]), endpoints("d", [45, 45]), 1).errorCode).toBe(
    "capacity",
  );
  expect(
    buildDistribution(endpoints("s", [100]), endpoints("d", Array<number>(100).fill(1)), 2)
      .errorCode,
  ).toBe("endpoint-limit");
  const rates = [Math.PI, Math.E, Math.SQRT2, 1];
  const result = buildDistribution(
    endpoints("s", [rates.reduce((sum, rate) => sum + rate, 0)]),
    endpoints("d", rates),
    1,
  );
  expect(result.errorCode).toBe("construction-limit");
  expect(result.error).toContain("construction limits");
  expect(result.nodes).toEqual([]);
});

it("rejects invalid endpoint rates and incorrect return markings independently", () => {
  const sources = endpoints("s", [60]);
  const destinations = endpoints("d", Array<number>(5).fill(12));
  const graph = buildDistribution(sources, destinations, 2);
  expect(validateDistribution(graph, [{ id: "s0", rate: NaN }], destinations, 2)).toBe(false);
  const unmarked = structuredClone(graph);
  for (const edge of unmarked.edges) edge.feedback = false;
  expect(validateDistribution(unmarked, sources, destinations, 2)).toBe(false);
});

it("conserves fractional and uneven flows across shared consumers", () => {
  for (const [sourceRates, destinationRates] of [
    [[90], [15, 30, 45]],
    [
      [30, 30],
      [45, 15],
    ],
    [
      [7.5, 7.5],
      [5, 10],
    ],
    [[30, 30], [60]],
    [
      [30, 30, 30],
      [30, 15, 15, 30],
    ],
  ]) {
    const sources = endpoints("s", sourceRates);
    const destinations = endpoints("d", destinationRates);
    verifyFlow(buildDistribution(sources, destinations, 3), sources, destinations, 3);
  }
});

it("rejects mismatched demand and ports above the selected belt capacity", () => {
  expect(buildDistribution(endpoints("s", [30]), endpoints("d", [60]), 1).error).toContain(
    "do not match",
  );
  expect(buildDistribution(endpoints("s", [90]), endpoints("d", [45, 45]), 1).error).toContain(
    "exceeds Mk.1",
  );
});

it.each([
  { supply: [576], demand: [280, 200, 96], tier: 5, junctions: 8 },
  { supply: [356], demand: [201, 107, 48], tier: 4, junctions: 13 },
  { supply: [120], demand: [60, 40, 20], tier: 2, junctions: 3 },
  { supply: [60, 60], demand: [40, 40, 40], tier: 2, junctions: 2 },
])(
  "constructs a compact balanced network for $supply → $demand",
  ({ supply, demand, tier, junctions }) => {
    const sources = endpoints("s", supply);
    const destinations = endpoints("d", demand);
    const graph = buildDistribution(sources, destinations, tier);
    verifyFlow(graph, sources, destinations, tier);
    expect(graph.nodes.length - sources.length - destinations.length).toBeLessThanOrEqual(
      junctions,
    );
  },
);

it("uses local feedback without exceeding a full input belt", () => {
  const sources = endpoints("s", [480]);
  const destinations = endpoints("d", [240, 48, 48, 48, 48, 48]);
  const graph = buildDistribution(sources, destinations, 4);
  verifyFlow(graph, sources, destinations, 4);
  expect(graph.edges.some((edge) => edge.feedback)).toBe(true);
  expect(Math.max(...graph.edges.map((edge) => edge.rate))).toBe(480);
});

it("completes the 474/min, 17-smelter construction before optimizing its branches", () => {
  const sources = endpoints("s", [474]);
  // Eight at 100%, two groups of three sharing 80/min each, two sharing
  // 48/min, and one consuming 26/min. The input nearly fills a Mk.4 belt.
  const destinations = endpoints("d", [
    ...Array<number>(8).fill(30),
    ...Array<number>(6).fill(80 / 3),
    24,
    24,
    26,
  ]);
  const graph = buildDistribution(sources, destinations, 4);
  verifyFlow(graph, sources, destinations, 4);
  expect(graph.nodes.filter((node) => node.kind === "destination")).toHaveLength(17);
  expect(graph.edges.some((edge) => edge.feedback)).toBe(true);
});

it("feeds both surplus streams directly into the 474/min input merger", () => {
  const sources = endpoints("s", [474]);
  const destinations = endpoints("d", [240, 80, 80, 48, 26]);
  const graph = buildDistribution(sources, destinations, 4);
  verifyFlow(graph, sources, destinations, 4);
  expect(validateDistribution(graph, sources, destinations, 4)).toBe(true);
  expect(graph.nodes.filter((node) => node.kind === "splitter")).toHaveLength(7);
  expect(graph.nodes.filter((node) => node.kind === "merger")).toHaveLength(3);
  const inputMerger = graph.edges.find((edge) => edge.from === "s0")!.to;
  expect(
    graph.edges
      .filter((edge) => edge.to === inputMerger && edge.feedback)
      .map((edge) => edge.rate)
      .toSorted((a, b) => a - b),
  ).toEqual([2, 4]);
});

it.each([3, 4])("collapses consecutive mergers only when %s source belts fit", (count) => {
  const sources = endpoints("s", Array<number>(count).fill(10));
  const destinations = endpoints("d", [count * 10]);
  const original = new DistributionGraph(sources, destinations);
  const streams = sources.map((source) => ({ from: source.id, rate: source.rate }));
  const first = original.merge(streams.slice(0, 2));
  original.connect(original.merge([first, ...streams.slice(2)]), "d0");
  const before = structuredClone({ nodes: original.nodes, edges: original.edges });
  const graph = collapseDistributionMergers(original);
  verifyFlow(graph, sources, destinations, 1);
  expect(graph.nodes.filter((node) => node.kind === "merger")).toHaveLength(count === 3 ? 1 : 2);
  expect({ nodes: original.nodes, edges: original.edges }).toEqual(before);
});

it("retains a complete construction when many distinct demands exhaust improvement search", () => {
  const sources = endpoints("s", [474]);
  const destinations = endpoints(
    "d",
    [31, 34, 27, 31, 26, 17, 30, 26, 32, 28, 36, 26, 29, 33, 16, 28, 24],
  );
  const graph = buildDistribution(sources, destinations, 4);
  verifyFlow(graph, sources, destinations, 4);
});

it("retains a capacity-safe alternative when pooling suppliers would need a higher tier", () => {
  const sources = endpoints("s", [60, 60]);
  const destinations = endpoints("d", [40, 40, 40]);
  verifyFlow(buildDistribution(sources, destinations, 1), sources, destinations, 1);
});

it.each([1 / 3, 0.125, 0.001])(
  "scales compact ratio patterns to fractional rates (%s)",
  (scale) => {
    const sources = endpoints("s", [576 * scale]);
    const destinations = endpoints("d", [280 * scale, 200 * scale, 96 * scale]);
    const graph = buildDistribution(sources, destinations, 5);
    verifyFlow(graph, sources, destinations, 5);
    expect(graph.nodes.length - 4).toBeLessThanOrEqual(8);
  },
);

it("keeps nested feedback targets separate and produces deterministic previews", () => {
  const sources = endpoints("s", [356, 356]);
  const destinations = endpoints("d", [201, 107, 48, 201, 107, 48]);
  const before = structuredClone({ sources, destinations });
  const graph = buildDistribution(sources, destinations, 4);
  verifyFlow(graph, sources, destinations, 4);
  expect(buildDistribution(sources, destinations, 4)).toEqual(graph);
  expect({ sources, destinations }).toEqual(before);
});

it("supports the endpoint limit without requiring one pooled trunk", () => {
  const sources = endpoints("s", Array<number>(20).fill(60));
  const destinations = endpoints("d", Array<number>(80).fill(15));
  const graph = buildDistribution(sources, destinations, 1);
  verifyFlow(graph, sources, destinations, 1);
  expect(graph.nodes.length - 100).toBeLessThanOrEqual(60);
});

it.each([NaN, Infinity, -Infinity, 0, -1])(
  "rejects invalid rates (%s) before searching",
  (rate) => {
    expect(
      buildDistribution(endpoints("s", [rate]), endpoints("d", [rate]), 1).error,
    ).toBeDefined();
  },
);

it("independently rejects incorrect rates, ports, capacity and disconnected circulation", () => {
  const sources = endpoints("s", [60]);
  const destinations = endpoints("d", [30, 30]);
  const original = buildDistribution(sources, destinations, 1);
  expect(validateDistribution(original, sources, destinations, 1)).toBe(true);
  const wrongSplit = structuredClone(original);
  wrongSplit.edges.find((edge) => edge.to === "d0")!.rate = 20;
  wrongSplit.edges.find((edge) => edge.to === "d1")!.rate = 40;
  expect(validateDistribution(wrongSplit, sources, endpoints("d", [20, 40]), 1)).toBe(false);
  const wrongPort = structuredClone(original);
  for (const edge of wrongPort.edges) edge.to = "missing";
  expect(validateDistribution(wrongPort, sources, destinations, 1)).toBe(false);
  const overCapacity = structuredClone(original);
  overCapacity.edges.forEach((edge) => (edge.rate *= 3));
  expect(
    validateDistribution(overCapacity, endpoints("s", [180]), endpoints("d", [90, 90]), 1),
  ).toBe(false);
  const circulation = structuredClone(original);
  circulation.nodes.push(
    { id: "loop-split", kind: "splitter" },
    { id: "loop-merge", kind: "merger" },
  );
  circulation.edges.push(
    { id: "loop-0", from: "loop-merge", to: "loop-split", rate: 20, tier: 1 },
    { id: "loop-1", from: "loop-split", to: "loop-merge", rate: 10, tier: 1 },
    { id: "loop-2", from: "loop-split", to: "loop-merge", rate: 10, tier: 1 },
  );
  expect(validateDistribution(circulation, sources, destinations, 1)).toBe(false);
});
