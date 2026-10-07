import { expect, it } from "vitest";

import { buildDistribution } from "./distribution";
import type { DistributionEndpoint } from "./distribution";
import { distributionCost, validateDistribution } from "./distribution-graph";
import { groupedDistribution } from "./distribution-grouped";

function machines(groups: number[][]): DistributionEndpoint[] {
  return groups.flatMap((rates, group) =>
    rates.map((rate, member) => ({
      id: `machine-${group}-${member}`,
      groupId: `group-${group}`,
      rate,
    })),
  );
}

it("preserves the five-group construction when expanding the 17 smelters", () => {
  const sources = [{ id: "miner", rate: 474 }];
  const destinations = machines([
    Array<number>(8).fill(30),
    Array<number>(3).fill(80 / 3),
    Array<number>(3).fill(80 / 3),
    [24, 24],
    [26],
  ]);
  const before = structuredClone({ sources, destinations });
  const graph = buildDistribution(sources, destinations, 4);
  expect(validateDistribution(graph, sources, destinations, 4)).toBe(true);
  expect(graph.nodes.filter((node) => node.kind === "splitter")).toHaveLength(17);
  expect(graph.nodes.filter((node) => node.kind === "merger")).toHaveLength(3);
  expect(graph.edges).toHaveLength(42);
  expect(graph.nodes.filter((node) => node.kind === "destination").map((node) => node.id)).toEqual(
    destinations.map((endpoint) => endpoint.id),
  );
  expect({ sources, destinations }).toEqual(before);
  expect(buildDistribution(sources, destinations, 4)).toEqual(graph);
});

it("joins supplier groups, unequal machine rates and local feedback without ID collisions", () => {
  const sources = [
    { id: "distribution-0", groupId: "shared", rate: 30 },
    { id: "distribution-group-0", groupId: "shared", rate: 60 },
  ];
  const destinations = machines([Array<number>(5).fill(12), [10, 20]]);
  // Exercise composition independently of whether the flat candidate costs less.
  const graph = groupedDistribution(sources, destinations, 2, buildDistribution)!;
  expect(validateDistribution(graph, sources, destinations, 2)).toBe(true);
  expect(graph.edges.some((edge) => edge.feedback)).toBe(true);
  expect(graph.edges.find((edge) => edge.from === sources[0].id)!.rate).toBe(30);
  expect(graph.edges.find((edge) => edge.from === sources[1].id)!.rate).toBe(60);
  expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(graph.edges.length);
});

it("completes a grouped construction when the flat search exhausts its budget", () => {
  const sources = [{ id: "miner", rate: 720 }];
  const destinations = machines(
    [29, 31, 37].map((count) => Array<number>(count).fill(240 / count)),
  );
  const flat = buildDistribution(
    sources,
    destinations.map(({ id, rate }) => ({ id, rate })),
    5,
  );
  expect(flat.errorCode).toBe("construction-limit");
  const graph = buildDistribution(sources, destinations, 5);
  expect(validateDistribution(graph, sources, destinations, 5)).toBe(true);
  expect(graph.nodes.filter((node) => node.kind === "destination")).toHaveLength(97);
  expect(distributionCost(graph)[0]).toBeLessThanOrEqual(63);
});

it("keeps direct rate matches when grouping would add unnecessary junctions", () => {
  const sources = [
    { id: "source-a", groupId: "suppliers", rate: 30 },
    { id: "source-b", groupId: "suppliers", rate: 30 },
  ];
  const destinations = machines([[30, 30]]);
  const graph = buildDistribution(sources, destinations, 1);
  expect(validateDistribution(graph, sources, destinations, 1)).toBe(true);
  expect(graph.edges).toHaveLength(2);
  expect(distributionCost(graph)[0]).toBe(0);
});

it("keeps oversized groups independent while composing other groups within belt capacity", () => {
  const sources = [
    { id: "source-a", groupId: "suppliers", rate: 60 },
    { id: "source-b", groupId: "suppliers", rate: 60 },
  ];
  const destinations = machines([
    [20, 20, 20],
    [20, 20, 20],
  ]);
  const graph = groupedDistribution(sources, destinations, 1, buildDistribution)!;
  expect(validateDistribution(graph, sources, destinations, 1)).toBe(true);
  expect(graph.edges.every((edge) => edge.rate <= 60)).toBe(true);
  expect(distributionCost(buildDistribution(sources, destinations, 1))[0]).toBeLessThanOrEqual(
    distributionCost(graph)[0],
  );
});

it("falls back to flat direct connections when a local group ratio is unsupported", () => {
  const rates = [Math.PI, Math.E, Math.SQRT2, 1];
  const sources = rates.map((rate, index) => ({ id: `source-${index}`, rate }));
  const destinations = machines([rates]);
  expect(groupedDistribution(sources, destinations, 1, buildDistribution)).toBeUndefined();
  const graph = buildDistribution(sources, destinations, 1);
  expect(validateDistribution(graph, sources, destinations, 1)).toBe(true);
  expect(graph.edges).toHaveLength(4);
  expect(distributionCost(graph)[0]).toBe(0);
});
