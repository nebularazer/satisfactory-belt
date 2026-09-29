import { expect, it } from "vitest";

import { buildDistributionPrototype, PREVIEW_BELTS } from "./distribution-prototype";
import type { DistributionEndpoint, DistributionPreview } from "./distribution-prototype";

const endpoints = (prefix: string, rates: number[]): DistributionEndpoint[] =>
  rates.map((rate, index) => ({ id: `${prefix}${index}`, rate }));

function verifyFlow(
  graph: DistributionPreview,
  sources: DistributionEndpoint[],
  destinations: DistributionEndpoint[],
  tier: number,
  balanced: boolean,
) {
  expect(graph.error).toBeUndefined();
  const supply = new Map(sources.map((entry) => [entry.id, entry.rate]));
  const demand = new Map(destinations.map((entry) => [entry.id, entry.rate]));
  const ids = new Set(graph.nodes.map((node) => node.id));
  expect(ids.size).toBe(graph.nodes.length);
  for (const edge of graph.edges) {
    expect(ids.has(edge.from) && ids.has(edge.to)).toBe(true);
    expect(edge.rate).toBeGreaterThan(0);
    expect(edge.tier).toBeGreaterThanOrEqual(1);
    expect(edge.tier).toBeLessThanOrEqual(tier);
    expect(edge.rate).toBeLessThanOrEqual(PREVIEW_BELTS[edge.tier - 1] + 1e-5);
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
      if (balanced)
        for (const edge of outgoing) expect(edge.rate).toBeCloseTo(totalOut / outgoing.length, 6);
    }
    if (node.kind === "merger") {
      expect(outgoing).toHaveLength(1);
      expect(incoming.length).toBeGreaterThanOrEqual(2);
      expect(incoming.length).toBeLessThanOrEqual(3);
    }
  }
}

it.each(["balanced", "manifold"] as const)(
  "connects equal-rate pairs directly in %s mode",
  (mode) => {
    const sources = endpoints("s", [30, 15.5, 30]);
    const destinations = endpoints("d", [15.5, 30, 30]);
    const before = structuredClone({ sources, destinations });
    const graph = buildDistributionPrototype(sources, destinations, 1, mode);
    verifyFlow(graph, sources, destinations, 1, mode === "balanced");
    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges.every((edge) => edge.from.startsWith("s") && edge.to.startsWith("d"))).toBe(
      true,
    );
    expect({ sources, destinations }).toEqual(before);
  },
);

it.each(["balanced", "manifold"] as const)(
  "keeps three suppliers independent when splitting to six consumers in %s mode",
  (mode) => {
    const sources = endpoints("s", [30, 30, 30]);
    const destinations = endpoints("d", [15, 15, 15, 15, 15, 15]);
    const graph = buildDistributionPrototype(sources, destinations, 1, mode);
    verifyFlow(graph, sources, destinations, 1, mode === "balanced");
    expect(graph.nodes.filter((node) => node.kind === "splitter")).toHaveLength(3);
    expect(graph.nodes.filter((node) => node.kind === "merger")).toHaveLength(0);
  },
);

it("includes recirculation in belt capacity for a five-way equal split", () => {
  const sources = endpoints("s", [60]);
  const destinations = endpoints("d", [12, 12, 12, 12, 12]);
  const tooSmall = buildDistributionPrototype(sources, destinations, 1, "balanced");
  expect(tooSmall.error).toContain("72/min");
  expect(tooSmall.edges).toEqual([]);
  const graph = buildDistributionPrototype(sources, destinations, 2, "balanced");
  verifyFlow(graph, sources, destinations, 2, true);
  expect(graph.edges.filter((edge) => edge.feedback).map((edge) => edge.rate)).toEqual([12]);
  expect(Math.max(...graph.edges.map((edge) => edge.rate))).toBe(72);
});

it.each(["balanced", "manifold"] as const)(
  "conserves fractional and uneven flows across shared consumers in %s mode",
  (mode) => {
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
      verifyFlow(
        buildDistributionPrototype(sources, destinations, 3, mode),
        sources,
        destinations,
        3,
        mode === "balanced",
      );
    }
  },
);

it("rejects mismatched demand and ports above the selected belt capacity", () => {
  expect(
    buildDistributionPrototype(endpoints("s", [30]), endpoints("d", [60]), 1, "balanced").error,
  ).toContain("do not match");
  expect(
    buildDistributionPrototype(endpoints("s", [90]), endpoints("d", [45, 45]), 1, "balanced").error,
  ).toContain("exceeds Mk.1");
});
