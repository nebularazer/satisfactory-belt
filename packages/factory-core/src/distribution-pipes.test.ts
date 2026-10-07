import { expect, it } from "vitest";

import { buildDistribution } from "./distribution";
import { validateDistribution } from "./distribution-graph";

const endpoints = (prefix: string, rates: number[]) =>
  rates.map((rate, index) => ({ id: `${prefix}${index}`, rate }));

it.each([
  { extractors: 3, generators: 8 },
  { extractors: 6, generators: 16 },
])(
  "feeds $generators coal generators from $extractors extractors along one Mk.1 manifold",
  ({ extractors, generators }) => {
    const sources = endpoints("water", Array<number>(extractors).fill(120));
    const destinations = endpoints("coal", Array<number>(generators).fill(45));
    const before = structuredClone({ sources, destinations });
    const graph = buildDistribution(sources, destinations, 1, "pipe");
    expect(graph.error).toBeUndefined();
    expect(validateDistribution(graph, sources, destinations, 1, "pipe")).toBe(true);
    const stations = graph.pipeManifold!.stations;
    expect(stations.map((station) => station.destinationId)).toEqual(
      destinations.map((entry) => entry.id),
    );
    const taps = new Map(stations.map((station, index) => [station.junctionId!, index]));
    const feeds = sources.map((source) =>
      taps.get(graph.edges.find((edge) => edge.from === source.id)!.to),
    );
    expect(feeds[0]).toBe(0);
    expect(feeds[1]).toBe(generators - 1);
    expect(feeds.slice(2).every((index) => index! > 0 && index! < generators - 1)).toBe(true);
    const header = graph.edges.filter((edge) => taps.has(edge.from) && taps.has(edge.to));
    expect(header).toHaveLength(generators - 1);
    expect(header.some((edge) => taps.get(edge.from)! > taps.get(edge.to)!)).toBe(true);
    for (const edge of header) expect(Math.abs(taps.get(edge.from)! - taps.get(edge.to)!)).toBe(1);
    for (const destination of destinations)
      expect(graph.edges.filter((edge) => edge.to === destination.id)).toMatchObject([
        { rate: 45 },
      ]);
    expect(graph.edges.every((edge) => edge.tier === 1 && edge.rate <= 300 && !edge.feedback)).toBe(
      true,
    );
    expect({ sources, destinations }).toEqual(before);
  },
);

it("moves a feed earlier when uneven demand would overload the preferred manifold segment", () => {
  const sources = endpoints("s", [300, 300, 300]);
  const destinations = endpoints("d", [210, 210, 210, 210, 15, 15, 15, 15]);
  const graph = buildDistribution(sources, destinations, 1, "pipe");
  expect(validateDistribution(graph, sources, destinations, 1, "pipe")).toBe(true);
  const feed = graph.edges.find((edge) => edge.from === "s2")!;
  expect(graph.pipeManifold!.stations.findIndex((station) => station.junctionId === feed.to)).toBe(
    2,
  );
  expect(graph.edges.every((edge) => edge.rate <= 300)).toBe(true);
});

it("keeps a continuous physical header when a segment has zero planned net flow", () => {
  const sources = endpoints("s", [100, 100]);
  const destinations = endpoints("d", [50, 50, 50, 50]);
  const graph = buildDistribution(sources, destinations, 1, "pipe");
  expect(validateDistribution(graph, sources, destinations, 1, "pipe")).toBe(true);
  const zero = graph.edges.find((edge) => edge.rate === 0)!;
  expect(zero).toBeDefined();
  expect(graph.nodes.find((node) => node.id === zero.from)!.kind).toBe("junction");
  expect(graph.nodes.find((node) => node.id === zero.to)!.kind).toBe("junction");
  zero.rate = -1;
  expect(validateDistribution(graph, sources, destinations, 1, "pipe")).toBe(false);
});

it("retains direct rate matches and falls back when supplies exceed the header's sockets", () => {
  const direct = buildDistribution(
    endpoints("s", [30, 60, 90, 120]),
    endpoints("d", [120, 90, 60, 30]),
    1,
    "pipe",
  );
  expect(direct.pipeManifold).toBeUndefined();
  expect(direct.nodes.filter((node) => node.kind === "junction")).toHaveLength(0);
  expect(direct.edges).toHaveLength(4);
  const sources = endpoints("s", Array<number>(7).fill(120));
  const destinations = endpoints("d", Array<number>(4).fill(210));
  const graph = buildDistribution(sources, destinations, 1, "pipe");
  expect(graph.pipeManifold).toBeUndefined();
  expect(validateDistribution(graph, sources, destinations, 1, "pipe")).toBe(true);
});

it.each([
  { supply: [474], demand: [240, 80, 80, 48, 26], tier: 2, junctions: 4 },
  { supply: [300], demand: [Math.PI, Math.E, 300 - Math.PI - Math.E], tier: 1, junctions: 1 },
  { supply: [100, 200], demand: [120, 180], tier: 1, junctions: 1 },
  { supply: [600, 600], demand: [500, 500, 200], tier: 2, junctions: 2 },
  { supply: [150, 150, 150], demand: [450], tier: 2, junctions: 1 },
  { supply: [30, 60], demand: [60, 30], tier: 1, junctions: 0 },
  { supply: [594], demand: Array<number>(99).fill(6), tier: 2, junctions: 98 },
])(
  "routes $supply → $demand through capacity-safe pipe junctions",
  ({ supply, demand, tier, junctions }) => {
    const sources = endpoints("s", supply);
    const destinations = endpoints("d", demand);
    const before = structuredClone({ sources, destinations });
    const graph = buildDistribution(sources, destinations, tier, "pipe");
    expect(graph.error).toBeUndefined();
    expect(validateDistribution(graph, sources, destinations, tier, "pipe")).toBe(true);
    expect(graph.nodes.filter((node) => node.kind === "junction")).toHaveLength(junctions);
    expect(
      graph.nodes.every((node) => ["source", "destination", "junction"].includes(node.kind)),
    ).toBe(true);
    expect(graph.edges.every((edge) => !edge.feedback)).toBe(true);
    for (const node of graph.nodes.filter((entry) => entry.kind === "junction")) {
      const connections = graph.edges.filter(
        (edge) => edge.from === node.id || edge.to === node.id,
      ).length;
      expect(node.junctionType).toBe(connections === 3 ? "t" : "cross");
    }
    expect({ sources, destinations }).toEqual(before);
  },
);

it("accepts reversed T flow and an unused cross socket, but rejects a T with four connections", () => {
  const sources = endpoints("s", [120]);
  const destinations = endpoints("d", [100, 20]);
  const graph = buildDistribution(sources, destinations, 1, "pipe");
  expect(graph.nodes.find((node) => node.kind === "junction")!.junctionType).toBe("t");
  const reversed = {
    nodes: graph.nodes.map((node) => ({
      ...node,
      kind:
        node.kind === "source"
          ? ("destination" as const)
          : node.kind === "destination"
            ? ("source" as const)
            : node.kind,
    })),
    edges: graph.edges.map((edge) => ({ ...edge, from: edge.to, to: edge.from })),
  };
  expect(validateDistribution(reversed, destinations, sources, 1, "pipe")).toBe(true);
  graph.nodes.find((node) => node.kind === "junction")!.junctionType = "cross";
  expect(validateDistribution(graph, sources, destinations, 1, "pipe")).toBe(true);
  const crossSources = endpoints("s", [120]);
  const crossDestinations = endpoints("d", [37.5, 37.5, 45]);
  const cross = buildDistribution(crossSources, crossDestinations, 1, "pipe");
  cross.nodes.find((node) => node.kind === "junction")!.junctionType = "t";
  expect(validateDistribution(cross, crossSources, crossDestinations, 1, "pipe")).toBe(false);
});

it("expands 17 individual consumers without ratio construction or return loops", () => {
  const sources = endpoints("s", [474]);
  const destinations = endpoints("d", [
    ...Array<number>(8).fill(30),
    ...Array<number>(6).fill(80 / 3),
    24,
    24,
    26,
  ]);
  const graph = buildDistribution(
    sources,
    destinations.map((entry, index) => ({ ...entry, groupId: `${Math.floor(index / 3)}` })),
    2,
    "pipe",
  );
  expect(validateDistribution(graph, sources, destinations, 2, "pipe")).toBe(true);
  expect(graph.nodes.filter((node) => node.kind === "junction")).toHaveLength(16);
  expect(graph.edges).toHaveLength(33);
});

it("enforces pipe tiers and independently rejects invalid pipe junctions", () => {
  const sources = endpoints("s", [474]);
  const destinations = endpoints("d", [240, 80, 80, 48, 26]);
  expect(buildDistribution(sources, destinations, 1, "pipe").errorCode).toBe("capacity");
  expect(buildDistribution(sources, destinations, 3, "pipe").errorCode).toBe("invalid-input");
  expect(buildDistribution(endpoints("s", [601]), endpoints("d", [601]), 2, "pipe").errorCode).toBe(
    "capacity",
  );
  const original = buildDistribution(sources, destinations, 2, "pipe");
  const wrongKind = structuredClone(original);
  wrongKind.nodes.find((node) => node.kind === "junction")!.kind = "splitter";
  expect(validateDistribution(wrongKind, sources, destinations, 2, "pipe")).toBe(false);
  const feedback = structuredClone(original);
  feedback.edges[0].feedback = true;
  expect(validateDistribution(feedback, sources, destinations, 2, "pipe")).toBe(false);
  const overCapacity = structuredClone(original);
  overCapacity.edges[0].tier = 1;
  expect(validateDistribution(overCapacity, sources, destinations, 2, "pipe")).toBe(false);
  const tooManyPorts = {
    nodes: [
      ...sources.map(({ id }) => ({ id, kind: "source" as const })),
      ...destinations.map(({ id }) => ({ id, kind: "destination" as const })),
      { id: "j", kind: "junction" as const },
    ],
    edges: [
      { id: "supply", from: "s0", to: "j", rate: 474, tier: 2 },
      ...destinations.map(({ id, rate }) => ({ id, from: "j", to: id, rate, tier: 1 })),
    ],
  };
  expect(validateDistribution(tooManyPorts, sources, destinations, 2, "pipe")).toBe(false);
});
