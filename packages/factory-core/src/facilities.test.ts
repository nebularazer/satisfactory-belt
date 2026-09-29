import type { Building, GameCatalog } from "@satisfactory-belt/game-data";
import { PROJECT_PHASES } from "@satisfactory-belt/game-data";
import { expect, it } from "vitest";

import {
  canReplaceNode,
  createConfigurationValidator,
  createConnectionIndex,
  createFactoryNode,
  createMachineMembers,
  resolveFactoryNode,
  resolveProduction,
  resolveSemanticPorts,
  setMachineSetting,
  commonSetting,
  resizeMachineGroup,
  setMatrixSupply,
  machineCapabilities,
} from "./index";
import type { FacilityNode, FactoryNode, FactoryDocument, MaterialLink } from "./index";

function fixture() {
  const catalog: GameCatalog = {
    schemaVersion: 1,
    source: { locale: "en", docsSha256: "" },
    items: {},
    recipes: {},
    machines: {},
    extractors: {},
    logistics: {},
    sinks: {},
    fixedProducers: {},
    buildings: {},
  };
  for (const id of [
    "coal",
    "rod",
    "waste",
    "water",
    "oil",
    "gas",
    "Desc_AlienPowerFuel_C",
    ...PROJECT_PHASES.flatMap((phase) => phase.map((p) => p.itemId)),
  ])
    catalog.items[id] = {
      id,
      name: id,
      description: "",
      iconId: id,
      form: ["water", "oil", "gas"].includes(id) ? "liquid" : "solid",
      unit: ["water", "oil", "gas"].includes(id) ? "m3" : "item",
      sinkable: !["water", "oil", "gas"].includes(id),
      energyMegajoules: id === "coal" ? 300 : id === "rod" ? 750000 : 0,
      sinkPoints: 10,
    };
  function add(id: string, kind: Building["kind"], options: Partial<Building> = {}) {
    catalog.buildings![id] = {
      id,
      kind,
      name: id,
      description: "",
      iconId: id,
      descriptorId: id,
      powerMegawatts: 0,
      canOverclock: false,
      powerConsumptionExponent: Math.log2(2.5),
      transport: "belt",
      capacity: 0,
      fuels: [],
      resourceIds: [],
      baseRate: 0,
      loadFollowing: false,
      ...options,
    };
  }
  add("coalGenerator", "generator", {
    powerMegawatts: 75,
    canOverclock: true,
    fuels: [{ itemId: "coal", supplementalItemId: "water", supplementalPerMinute: 45 }],
  });
  add("nuclear", "generator", {
    powerMegawatts: 2500,
    canOverclock: true,
    fuels: [
      {
        itemId: "rod",
        supplementalItemId: "water",
        supplementalPerMinute: 240,
        byproduct: { itemId: "waste", amount: 50 },
      },
    ],
  });
  add("well", "well", {
    powerMegawatts: 150,
    canOverclock: true,
    resourceIds: ["gas", "oil"],
    baseRate: 60,
  });
  add("geothermal", "geothermal", { baseRate: 200 });
  add("augmenter", "augmenter", { powerMegawatts: 500 });
  add("storage", "storage", { capacity: 24 });
  add("buffer", "storage", { transport: "pipe", capacity: 400 });
  add("elevator", "space-elevator");
  add("truck", "truck-station", { powerMegawatts: 20 });
  catalog.extractors.miner = {
    id: "miner",
    name: "Miner",
    description: "",
    iconId: "miner",
    descriptorId: "miner",
    resourceIds: ["coal", "rod"],
    powerMegawatts: 5,
    powerConsumptionExponent: Math.log2(2.5),
    canOverclock: true,
    hasPurity: true,
    baseRate: 60,
  };
  catalog.extractors.pump = {
    ...catalog.extractors.miner,
    id: "pump",
    resourceIds: ["water", "oil"],
    baseRate: 120,
  };
  catalog.sinks.sink = {
    id: "sink",
    name: "Sink",
    description: "",
    iconId: "sink",
    descriptorId: "sink",
    powerMegawatts: 30,
  };
  catalog.logistics.merger = {
    id: "merger",
    name: "Merger",
    description: "",
    iconId: "merger",
    descriptorId: "merger",
    kind: "merger",
  };
  const facility = (id: string): FacilityNode => {
    const node = createFactoryNode(catalog, { kind: "facility", buildingId: id }, id, {
      x: 0,
      y: 0,
    });
    if (node.kind !== "facility") throw new Error();
    return node;
  };
  const extractor = (id: string, resourceId: string): FactoryNode =>
    createFactoryNode(
      catalog,
      {
        kind: "extractor",
        extractorId: ["water", "oil"].includes(resourceId) ? "pump" : "miner",
        resourceId,
      },
      id,
      { x: 0, y: 0 },
    );
  return { catalog, facility, extractor };
}
const link = (
  id: string,
  source: string,
  output: string,
  target: string,
  input: string,
): MaterialLink => ({
  id,
  output: { nodeId: source, portKey: output },
  input: { nodeId: target, portKey: input },
});

it("derives generator fuel, supplemental water, waste and linear generation from member clocks", () => {
  const { catalog, facility } = fixture();
  const coal = {
    ...facility("coalGenerator"),
    machines: createMachineMembers(1, { clockPercent: 200 }),
  };
  expect(resolveProduction(coal, catalog).inputs).toEqual([
    { itemId: "coal", perMinute: 30 },
    { itemId: "water", perMinute: 90 },
  ]);
  expect(resolveFactoryNode(coal, catalog)).toMatchObject({
    power: { kind: "known", megawatts: 150 },
  });
  const nuclear = {
    ...facility("nuclear"),
    machines: createMachineMembers(1, { clockPercent: 250 }),
  };
  expect(resolveProduction(nuclear, catalog)).toMatchObject({
    inputs: [
      { itemId: "rod", perMinute: 0.5 },
      { itemId: "water", perMinute: 600 },
    ],
    outputs: [{ itemId: "waste", perMinute: 25 }],
  });
});

it("applies one pressurizer clock to satellite purities and counts pressurizer power once", () => {
  const { catalog, facility } = fixture();
  const node: FacilityNode = {
    ...facility("well"),
    machines: createMachineMembers(1, {
      clockPercent: 200,
      impureSatellites: 1,
      normalSatellites: 1,
      pureSatellites: 1,
    }),
    configuration: {
      type: "well",
      resourceId: "gas",
    },
  };
  expect(resolveProduction(node, catalog).outputs).toEqual([{ itemId: "gas", perMinute: 420 }]);
  expect(resolveFactoryNode(node, catalog)).toMatchObject({
    power: { kind: "known", megawatts: 375 },
  });
  expect(
    resolveProduction({ ...node, machines: createMachineMembers(2) }, catalog).outputs,
  ).toEqual([{ itemId: "gas", perMinute: 0 }]);
});

it("rejects individual extractor purity edits and inherits group purity", () => {
  const { catalog, extractor } = fixture();
  const original = extractor("mine", "coal");
  if (original.kind !== "extractor") throw new Error();
  const group = { ...original, machines: createMachineMembers(2) };
  expect(() => setMachineSetting(group, catalog, "1", "purity", 0.5)).toThrow("entire group");
  const uniform = setMachineSetting(group, catalog, "all", "purity", 2);
  expect(commonSetting(uniform.machines, "purity")).toBe(2);
  const resized = resizeMachineGroup(uniform, 3, () => "3");
  expect(resized.machines.map((m) => m.purity)).toEqual([2, 2, 2]);
  expect(resolveProduction(resized, catalog).outputs[0].perMinute).toBe(360);
  expect(() => setMachineSetting(group, catalog, "all", "purity", 1.5)).toThrow();
});

it("calculates geothermal range and matrix consumption without introducing grid simulation", () => {
  const { catalog, facility } = fixture();
  const geo = { ...facility("geothermal"), machines: createMachineMembers(1, { purity: 2 }) };
  expect(resolveFactoryNode(geo, catalog)).toMatchObject({
    power: { kind: "range", minMegawatts: 200, maxMegawatts: 600, averageMegawatts: 400 },
  });
  const augmenter = setMatrixSupply(
    { ...facility("augmenter"), machines: createMachineMembers(2) },
    catalog,
    "1",
    true,
  );
  expect(resolveProduction(augmenter, catalog).inputs).toEqual([
    { itemId: "Desc_AlienPowerFuel_C", perMinute: 5 },
  ]);
  expect(resolveFactoryNode(augmenter, catalog)).toMatchObject({ power: { megawatts: 1000 } });
});

it("rejects a resource change that removes an existing port without mutating links", () => {
  const { catalog, facility, extractor } = fixture();
  const source = extractor("mine", "coal"),
    target = facility("coalGenerator");
  const document: FactoryDocument = {
    nodes: [source, target],
    links: [link("l", "mine", "output:coal", target.id, "input:coal")],
  };
  if (source.kind !== "extractor") throw new Error();
  expect(canReplaceNode(document, { ...source, resourceId: "rod" }, catalog)).toBe(false);
  expect(
    canReplaceNode(
      document,
      { ...source, machines: createMachineMembers(1, { purity: 2 }) },
      catalog,
    ),
  ).toBe(true);
  expect(document.links).toHaveLength(1);
});

it("disables phase changes that would remove connected Project Assembly inputs", () => {
  const { catalog, facility } = fixture();
  const part = PROJECT_PHASES[0][0].itemId;
  catalog.fixedProducers.source = {
    id: "source",
    name: "Source",
    description: "",
    iconId: "source",
    descriptorId: "source",
    durationSeconds: 60,
    products: [{ itemId: part, amount: 1 }],
    powerMegawatts: 0,
    canOverclock: false,
    events: [],
  };
  const source = createFactoryNode(
      catalog,
      { kind: "fixed-producer", producerId: "source" },
      "source",
      { x: 0, y: 0 },
    ),
    elevator = facility("elevator");
  const document = {
    nodes: [source, elevator],
    links: [link("l", source.id, `output:${part}`, elevator.id, `input:${part}`)],
  };
  expect(
    canReplaceNode(
      document,
      { ...elevator, configuration: { type: "space-elevator", phase: 2 } },
      catalog,
    ),
  ).toBe(true);
  expect(
    canReplaceNode(
      document,
      { ...elevator, configuration: { type: "space-elevator", phase: 3 } },
      catalog,
    ),
  ).toBe(false);
});

it("passes a buffer's fluid through and rejects a second fluid before it can mix", () => {
  const { catalog, facility, extractor } = fixture();
  const water = extractor("water", "water"),
    oil = extractor("oil", "oil"),
    buffer = facility("buffer");
  const nodes = [water, oil, buffer];
  const index = createConnectionIndex(
    nodes.flatMap((n) => resolveSemanticPorts(n, catalog)),
    [link("water", "water", "output:water", "buffer", "input:0")],
  );
  expect(index.materials({ nodeId: "buffer", portKey: "output:0" })).toEqual(new Set(["water"]));
  expect(
    index.compatibility(
      { nodeId: "oil", portKey: "output:oil" },
      { nodeId: "buffer", portKey: "input:0" },
    ),
  ).toMatchObject({ compatible: false, reason: "mixed-material" });
});

it("does not propagate truck fuel into its outgoing cargo", () => {
  const { catalog, facility, extractor } = fixture();
  const source = extractor("mine", "coal"),
    truck: FacilityNode = {
      ...facility("truck"),
      configuration: {
        type: "truck-station",
        fuelId: null,
        mode: "unload",
        materialId: null,
        routeId: null,
      },
    };
  const index = createConnectionIndex(
    [source, truck].flatMap((n) => resolveSemanticPorts(n, catalog)),
    [link("fuel", "mine", "output:coal", "truck", "input:fuel")],
  );
  expect(index.materials({ nodeId: "truck", portKey: "output:cargo" }).size).toBe(0);
});

it("groups wells with independent satellite counts, mixed edits and inherited All settings", () => {
  const { catalog, facility } = fixture();
  const original = { ...facility("well"), machines: createMachineMembers(2) };
  expect(commonSetting(original.machines, "pureSatellites")).toBe(0);
  const mixed = setMachineSetting(original, catalog, "1", "pureSatellites", 2);
  expect(commonSetting(mixed.machines, "pureSatellites")).toBeNull();
  expect(resolveProduction(mixed, catalog).outputs[0].perMinute).toBe(240);
  const uniform = setMachineSetting(mixed, catalog, "all", "pureSatellites", 3);
  const expanded = resizeMachineGroup(uniform, 3, () => "3");
  expect(expanded.machines.map((member) => member.pureSatellites)).toEqual([3, 3, 3]);
  expect(resolveProduction(expanded, catalog).outputs[0].perMinute).toBe(1080);
  expect(() => setMachineSetting(expanded, catalog, "all", "normalSatellites", 8)).toThrow(
    "satellites",
  );
});

it("exposes two industrial storage ports per side and refuses a downgrade that loses a connection", () => {
  const { catalog, facility } = fixture();
  const id = "Build_StorageContainerMk2_C";
  catalog.buildings![id] = { ...catalog.buildings!.storage, id, capacity: 48 };
  const node = facility(id);
  const display = resolveFactoryNode(node, catalog);
  expect(display.ports.map((port) => port.key)).toEqual([
    "input:0",
    "output:0",
    "input:1",
    "output:1",
  ]);
  expect(display).toMatchObject({ footer: { kind: "storage", label: "48 slots" } });
  expect(resolveFactoryNode(facility("buffer"), catalog)).toMatchObject({
    footer: { kind: "fluid", label: "400 m³" },
  });
  const target = facility("storage");
  const doc = {
    nodes: [node, target],
    links: [
      {
        id: "second",
        output: { nodeId: node.id, portKey: "output:1" },
        input: { nodeId: target.id, portKey: "input:0" },
      },
    ],
  };
  expect(canReplaceNode(doc, { ...node, buildingId: "storage" }, catalog)).toBe(false);
});

it("keeps buffers, stations and the elevator individual while wells remain groupable", () => {
  const { catalog, facility } = fixture();
  for (const id of ["storage", "buffer", "truck", "elevator"]) {
    const node = facility(id);
    expect(machineCapabilities(node, catalog).groupable).toBe(false);
    expect(() =>
      resolveFactoryNode({ ...node, machines: createMachineMembers(2) }, catalog),
    ).toThrow("cannot be grouped");
  }
  expect(machineCapabilities(facility("well"), catalog).groupable).toBe(true);
});

it("shows the selected station fuel and rejects a mixed fuel stream", () => {
  const { catalog, facility, extractor } = fixture();
  const truck = facility("truck");
  if (truck.configuration.type !== "truck-station") throw new Error();
  const selected = { ...truck, configuration: { ...truck.configuration, fuelId: "coal" } };
  expect(
    resolveFactoryNode(selected, catalog).ports.find((port) => port.key === "input:fuel"),
  ).toMatchObject({ purpose: "fuel", itemId: "coal", iconId: "coal", transport: "belt" });
  const coal = extractor("coal", "coal"),
    rod = extractor("rod", "rod");
  const merger = createFactoryNode(catalog, { kind: "logistics", partId: "merger" }, "merger", {
    x: 0,
    y: 0,
  });
  const index = createConnectionIndex(
    [selected, coal, rod, merger].flatMap((node) => resolveSemanticPorts(node, catalog)),
    [
      link("coal", coal.id, "output:coal", merger.id, "input:0"),
      link("rod", rod.id, "output:rod", merger.id, "input:1"),
    ],
  );
  expect(
    index.compatibility(
      { nodeId: merger.id, portKey: "output:0" },
      { nodeId: selected.id, portKey: "input:fuel" },
    ).compatible,
  ).toBe(false);
});

it("keeps fluid inventories separate per freight car and shares each platform's two inputs", () => {
  const { catalog, facility, extractor } = fixture();
  catalog.buildings!.station = {
    ...catalog.buildings!.truck,
    id: "station",
    kind: "train-station",
  };
  catalog.buildings!.platform = {
    ...catalog.buildings!.buffer,
    id: "platform",
    kind: "freight-platform",
  };
  const station = facility("station");
  if (station.configuration.type !== "train-station") throw new Error();
  const configured = {
    ...station,
    configuration: {
      ...station.configuration,
      platforms: [1, 2].map(() => ({
        buildingId: "platform",
        mode: "load" as const,
        materialId: null,
      })),
    },
  };
  const water = extractor("water", "water"),
    oil = extractor("oil", "oil");
  const index = createConnectionIndex(
    [configured, water, oil].flatMap((node) => resolveSemanticPorts(node, catalog)),
    [link("water", water.id, "output:water", station.id, "car:1:input:0")],
  );
  expect(
    index.compatibility(
      { nodeId: oil.id, portKey: "output:oil" },
      { nodeId: station.id, portKey: "car:1:input:1" },
    ).compatible,
  ).toBe(false);
  expect(
    index.compatibility(
      { nodeId: oil.id, portKey: "output:oil" },
      { nodeId: station.id, portKey: "car:2:input:0" },
    ).compatible,
  ).toBe(true);
});

it("keeps the augmenter fixed at 100% with matrix supply as its only operating control", () => {
  const { catalog, facility } = fixture();
  const node = facility("augmenter");
  expect(machineCapabilities(node, catalog)).toMatchObject({ clock: false, matrices: true });
  expect(() => setMachineSetting(node, catalog, "all", "clockPercent", 250)).toThrow(
    "Invalid clock",
  );
  expect(resolveFactoryNode(node, catalog).clockLabel).toBeNull();
});

it("validates the affected network while still rejecting invalid links in unrelated networks", () => {
  const { catalog, facility, extractor } = fixture();
  const source = extractor("source", "coal");
  const generator = facility("coalGenerator");
  const independent = facility("storage");
  const document: FactoryDocument = {
    nodes: [source, generator, independent],
    links: [
      {
        id: "feed",
        output: { nodeId: source.id, portKey: "output:coal" },
        input: { nodeId: generator.id, portKey: "input:coal" },
      },
    ],
  };
  const validate = createConfigurationValidator(document, catalog);
  expect(validate(structuredClone(independent))).toBe(true);
  if (source.kind !== "extractor") throw new Error();
  const invalid = { ...source, resourceId: "rod" };
  expect(validate(invalid)).toBe(false);
  expect(validate(structuredClone(invalid))).toBe(false);
  expect(validate(structuredClone(source))).toBe(true);
  const invalidDocument = { ...document, nodes: [invalid, generator, independent] };
  const validateBroken = createConfigurationValidator(invalidDocument, catalog);
  expect(validateBroken(independent)).toBe(false);
  expect(validateBroken(source)).toBe(true);
  const dangling = {
    ...document,
    links: [
      ...document.links,
      {
        id: "dangling",
        output: { nodeId: "missing", portKey: "output:0" },
        input: { nodeId: independent.id, portKey: "input:0" },
      },
    ],
  };
  expect(createConfigurationValidator(dangling, catalog)(source)).toBe(false);
});
