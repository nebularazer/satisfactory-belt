import { parseFactoryJson, serializeFactoryJson } from "@satisfactory-belt/factory-saves";
import { expect, it } from "vitest";

import { minerFlowFixture } from "../test/flow-fixture";

it("round-trips a named factory with positions, machine settings, routing, external flows and transport settings", () => {
  const { assets, document } = minerFlowFixture();
  const complete = {
    ...document,
    links: document.links.map((link) =>
      Object.assign({}, link, {
        tier: 2,
        guides: [{ axis: "x" as const, position: 123 }],
      }),
    ),
    externalFlows: [
      { port: { nodeId: "smelter", portKey: "input:copper" }, itemId: "copper", perMinute: 30 },
    ],
    routes: [
      {
        id: "route",
        name: "Road route",
        kind: "road" as const,
        vehicleCount: 1,
        roundTripSeconds: 120,
        fuelPerTrip: 0,
        stops: [],
      },
    ],
    depotResearch: { speedLevel: 2, capacityLevel: 3 },
  };
  const text = serializeFactoryJson({ name: " Iron factory ", document: complete });
  expect(parseFactoryJson(text, assets.catalog)).toEqual({
    name: "Iron factory",
    document: complete,
  });
  expect(text).toContain('"version": 1');
  expect(text).not.toContain('"updatedAt"');
});

it("round-trips a saved empty factory", () => {
  const { assets } = minerFlowFixture();
  const empty = { name: "Empty", document: { nodes: [], links: [] } };
  expect(parseFactoryJson(serializeFactoryJson(empty), assets.catalog)).toEqual(empty);
});

it.each([
  ["{broken", "not valid JSON"],
  [JSON.stringify({ name: "Factory", document: {} }), "not a Satisfactory Belt"],
  [
    JSON.stringify({ format: "satisfactory-belt-factory", version: 99 }),
    "version is not supported",
  ],
  [JSON.stringify({ format: "satisfactory-belt-factory", version: 1, name: " " }), "needs a name"],
])("rejects malformed and unsupported files", (text, message) => {
  expect(() => parseFactoryJson(text, minerFlowFixture().assets.catalog)).toThrow(message);
});

it.each([
  [
    "missing nodes",
    (doc: ReturnType<typeof minerFlowFixture>["document"]) => ({ ...doc, nodes: null }),
  ],
  [
    "duplicate nodes",
    (doc: ReturnType<typeof minerFlowFixture>["document"]) => ({
      ...doc,
      nodes: [...doc.nodes, doc.nodes[0]],
    }),
  ],
  [
    "unknown machines",
    (doc: ReturnType<typeof minerFlowFixture>["document"]) => ({
      ...doc,
      nodes: [{ ...doc.nodes[1], machineId: "missing" }],
    }),
  ],
  [
    "dangling links",
    (doc: ReturnType<typeof minerFlowFixture>["document"]) => ({
      ...doc,
      links: [{ ...doc.links[0], input: { nodeId: "missing", portKey: "input:copper" } }],
    }),
  ],
  [
    "routing",
    (doc: ReturnType<typeof minerFlowFixture>["document"]) => ({
      ...doc,
      links: [{ ...doc.links[0], guides: [{ axis: "z", position: 5 }] }],
    }),
  ],
  [
    "machine settings",
    (doc: ReturnType<typeof minerFlowFixture>["document"]) => ({
      ...doc,
      nodes: [{ ...doc.nodes[0], machines: [{ id: "one", clockPercent: 500, sloopsUsed: 0 }] }],
    }),
  ],
  [
    "flow settings",
    (doc: ReturnType<typeof minerFlowFixture>["document"]) => ({
      ...doc,
      nodes: [{ ...doc.nodes[0], flow: "broken" }],
    }),
  ],
  [
    "external references",
    (doc: ReturnType<typeof minerFlowFixture>["document"]) => ({
      ...doc,
      externalFlows: [
        { port: { nodeId: "missing", portKey: "input:copper" }, itemId: "copper", perMinute: 30 },
      ],
    }),
  ],
  [
    "routes",
    (doc: ReturnType<typeof minerFlowFixture>["document"]) => ({
      ...doc,
      routes: [
        {
          id: "route",
          name: "Road",
          kind: "road",
          vehicleCount: 0,
          roundTripSeconds: 120,
          fuelPerTrip: 0,
          stops: [],
        },
      ],
    }),
  ],
  [
    "research",
    (doc: ReturnType<typeof minerFlowFixture>["document"]) => ({
      ...doc,
      depotResearch: { speedLevel: -1, capacityLevel: 0 },
    }),
  ],
])("rejects invalid %s before editor reconciliation", (_name, change) => {
  const { assets, document } = minerFlowFixture();
  const text = JSON.stringify({
    format: "satisfactory-belt-factory",
    version: 1,
    name: "Imported",
    document: change(document),
  });
  expect(() => parseFactoryJson(text, assets.catalog)).toThrow("factory document is invalid");
});
