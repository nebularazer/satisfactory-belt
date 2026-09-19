/* oxlint-disable oxc/no-map-spread -- Fixtures retain original immutable plans. */
import type { GameCatalog } from "@satisfactory-belt/game-data";
import { expect, it } from "vitest";

import { prepareFlowPlan, validateExternalFlows } from "./flow-plan";
import { resolveFactoryNode } from "./index";
import type { FactoryNode, ManufacturingNode } from "./index";
import type { FactoryDocument, MaterialLink, ExternalFlow } from "./links";
import { createMachineMembers } from "./machine-settings";
import { resolveProduction } from "./production";
import { resolveSemanticPorts } from "./semantic-ports";

function fixture() {
  const catalog: GameCatalog = {
    schemaVersion: 1,
    source: { locale: "en", docsSha256: "" },
    items: {},
    machines: {},
    recipes: {},
    extractors: {},
    fixedProducers: {},
    logistics: {},
    sinks: {},
    buildings: {},
  };
  for (const id of [
    "ore",
    "plate",
    "oil",
    "water",
    "residue",
    "resin",
    "fuel",
    "plastic",
    "rubber",
    "Desc_WAT1_C",
  ]) {
    const liquid = ["oil", "water", "residue", "fuel"].includes(id);
    catalog.items[id] = {
      id,
      name: id,
      description: "",
      iconId: id,
      form: liquid ? "liquid" : "solid",
      unit: liquid ? "m3" : "item",
      sinkable: !liquid,
    };
  }
  catalog.machines.machine = {
    id: "machine",
    name: "Machine",
    description: "",
    descriptorId: "machine",
    iconId: "machine",
    manufacturingSpeed: 1,
    power: { kind: "fixed", megawatts: 4 },
    powerConsumptionExponent: 1.3,
    canOverclock: true,
    sloopSlots: 2,
    productionBoost: { base: 1, perSloop: 0.5, powerExponent: 2 },
  };
  for (const kind of ["splitter", "merger", "smart-splitter"] as const)
    catalog.logistics[kind] = {
      id: kind,
      kind,
      name: kind,
      description: "",
      descriptorId: kind,
      iconId: kind,
    };
  catalog.sinks.sink = {
    id: "sink",
    name: "Sink",
    description: "",
    descriptorId: "sink",
    iconId: "sink",
    powerMegawatts: 30,
  };
  catalog.buildings!.storage = {
    id: "storage",
    name: "Storage",
    kind: "storage",
    description: "",
    descriptorId: "storage",
    iconId: "storage",
    powerMegawatts: 0,
    canOverclock: false,
    powerConsumptionExponent: 1,
    transport: "belt",
    capacity: 24,
    fuels: [],
    resourceIds: [],
    baseRate: 0,
    loadFollowing: false,
  };
  function machine(
    id: string,
    inputs: Record<string, number>,
    outputs: Record<string, number>,
    count = 1,
    clockPercent = 100,
  ): ManufacturingNode {
    catalog.recipes[id] = {
      id,
      name: id,
      durationSeconds: 60,
      ingredients: Object.entries(inputs).map(([itemId, amount]) => ({ itemId, amount })),
      products: Object.entries(outputs).map(([itemId, amount]) => ({ itemId, amount })),
      machineIds: ["machine"],
      alternate: false,
      events: [],
      variablePower: { constantMegawatts: 0, factorMegawatts: 0 },
    };
    return {
      id,
      kind: "manufacturing",
      recipeId: id,
      machineId: "machine",
      machines: createMachineMembers(count, { clockPercent }),
      x: 0,
      y: 0,
    };
  }
  return { catalog, machine };
}
const ref = (nodeId: string, portKey: string) => ({ nodeId, portKey });
function link(from: string, to: string, item: string, id = `${from}-${to}`): MaterialLink {
  return { id, output: ref(from, `output:${item}`), input: ref(to, `input:${item}`) };
}
function external(
  nodeId: string,
  direction: "input" | "output",
  itemId: string,
  perMinute: number,
): ExternalFlow {
  return { port: ref(nodeId, `${direction}:${itemId}`), itemId, perMinute };
}

it("shares output across consumers, combines supplies, and does not duplicate available production", () => {
  const { catalog, machine } = fixture();
  const source = machine("source", {}, { ore: 120 });
  const a = machine("a", { ore: 60 }, { plate: 30 });
  const b = machine("b", { ore: 60 }, { plate: 30 });
  const document: FactoryDocument = {
    nodes: [source, a, b],
    links: [link("source", "a", "ore"), link("source", "b", "ore")],
    externalFlows: [external("a", "output", "plate", 30), external("b", "output", "plate", 30)],
  };
  const plan = prepareFlowPlan(document, catalog);
  const result = plan.analyze();
  expect(result.status).toBe("feasible");
  expect(plan.analyze()).toBe(result);
  expect(result.links.get("source-a")).toEqual([{ itemId: "ore", perMinute: 60 }]);
  expect(result.links.get("source-b")).toEqual([{ itemId: "ore", perMinute: 60 }]);
  const shortage = prepareFlowPlan(
    { ...document, nodes: [source, a, { ...b, machines: createMachineMembers(2) }] },
    catalog,
  ).analyze();
  expect(shortage.status).toBe("infeasible");
  expect(shortage.balances.find((row) => row.itemId === "ore")?.missing).toBe(60);
  expect(shortage.links.get("source-a")).toEqual([{ itemId: "ore", perMinute: 60 }]);
  expect(shortage.links.get("source-b")).toEqual([{ itemId: "ore", perMinute: 60 }]);
  const source2 = machine("source2", {}, { ore: 60 });
  const combined = prepareFlowPlan(
    {
      ...document,
      nodes: [source, source2, a, { ...b, machines: createMachineMembers(2) }],
      links: [...document.links, link("source2", "b", "ore")],
      externalFlows: [external("a", "output", "plate", 30), external("b", "output", "plate", 60)],
    },
    catalog,
  ).analyze();
  expect(combined.status).toBe("feasible");
});

it("reassigns an earlier allocation when a later consumer has only one supplier", () => {
  const { catalog, machine } = fixture();
  const nodes = [
    machine("a", {}, { ore: 60 }),
    machine("b", {}, { ore: 60 }),
    machine("x", { ore: 60 }, { plate: 1 }),
    machine("y", { ore: 60 }, { plate: 1 }),
  ];
  const result = prepareFlowPlan(
    {
      nodes,
      links: [link("a", "x", "ore"), link("a", "y", "ore"), link("b", "x", "ore")],
      externalFlows: [external("x", "output", "plate", 1), external("y", "output", "plate", 1)],
    },
    catalog,
  ).analyze();
  expect(result.status).toBe("feasible");
  expect(result.links.get("a-y")?.[0]?.perMinute).toBe(60);
  expect(result.links.get("b-x")?.[0]?.perMinute).toBe(60);
});

it("accounts for every coproduct and treats external inputs/exports as explicit configured rates", () => {
  const { catalog, machine } = fixture();
  const node = machine("refinery", { oil: 30 }, { residue: 40, resin: 20 });
  const document = {
    nodes: [node],
    links: [],
    externalFlows: [
      external(node.id, "input", "oil", 30),
      external(node.id, "output", "residue", 40),
    ],
  };
  expect(prepareFlowPlan(document, catalog).analyze().issues).toContainEqual(
    expect.objectContaining({ code: "unallocated-output", itemId: "resin", perMinute: 20 }),
  );
  expect(
    prepareFlowPlan(
      {
        ...document,
        externalFlows: [...document.externalFlows, external(node.id, "output", "resin", 20)],
      },
      catalog,
    ).analyze().status,
  ).toBe("feasible");
  expect(
    prepareFlowPlan({ ...document, externalFlows: [] }, catalog).analyze().issues,
  ).toContainEqual(
    expect.objectContaining({ code: "missing-input", itemId: "oil", perMinute: 30 }),
  );
});

it("sums differing member settings instead of multiplying by an average configuration", () => {
  const { catalog, machine } = fixture();
  const node = {
    ...machine("group", { ore: 60 }, { plate: 30 }, 2),
    machines: [
      { id: "a", clockPercent: 50, sloopsUsed: 0 },
      { id: "b", clockPercent: 200, sloopsUsed: 2 },
    ],
  };
  expect(resolveProduction(node, catalog)).toMatchObject({
    inputs: [{ itemId: "ore", perMinute: 150 }],
    outputs: [{ itemId: "plate", perMinute: 135 }],
  });
  const result = prepareFlowPlan(
    {
      nodes: [node],
      links: [],
      externalFlows: [
        external(node.id, "input", "ore", 150),
        external(node.id, "output", "plate", 135),
      ],
    },
    catalog,
  ).analyze();
  expect(result.status).toBe("feasible");
});

it("supplies consumers before collecting surplus in storage, and forwards explicit disposal", () => {
  const { catalog, machine } = fixture();
  const source = machine("source", {}, { ore: 120 });
  const splitter: FactoryNode = {
    id: "splitter",
    kind: "logistics",
    partId: "splitter",
    x: 0,
    y: 0,
  };
  const storage: FactoryNode = {
    id: "storage",
    kind: "facility",
    buildingId: "storage",
    configuration: { type: "storage" },
    machines: createMachineMembers(1),
    x: 0,
    y: 0,
  };
  const sink: FactoryNode = {
    id: "sink",
    kind: "sink",
    sinkId: "sink",
    machines: createMachineMembers(1),
    x: 0,
    y: 0,
  };
  const a = machine("a", { ore: 60 }, { plate: 30 });
  const links: MaterialLink[] = [
    { id: "first", output: ref("source", "output:ore"), input: ref("splitter", "input:0") },
    { id: "consume", output: ref("splitter", "output:0"), input: ref("a", "input:ore") },
    { id: "store", output: ref("splitter", "output:1"), input: ref("storage", "input:0") },
  ];
  const document: FactoryDocument = {
    nodes: [source, splitter, storage, a],
    links,
    externalFlows: [external("a", "output", "plate", 30)],
  };
  const collected = prepareFlowPlan(document, catalog).analyze();
  expect(collected.status).toBe("feasible");
  expect(collected.balances.find((row) => row.itemId === "ore")?.stored).toBe(60);
  expect(collected.incoming.get("a")).toEqual([{ itemId: "ore", perMinute: 60 }]);
  expect(collected.incoming.get("storage")).toEqual([{ itemId: "ore", perMinute: 60 }]);
  const result = prepareFlowPlan(
    {
      ...document,
      nodes: [...document.nodes, sink],
      links: [
        ...links,
        { id: "dispose", output: ref("storage", "output:0"), input: ref("sink", "input:0") },
      ],
    },
    catalog,
  ).analyze();
  expect(result.status).toBe("feasible");
  expect(result.incoming.get("sink")).toEqual([{ itemId: "ore", perMinute: 60 }]);
  expect(result.balances.find((row) => row.itemId === "ore")?.disposed).toBe(60);
});

it("keeps unknown extraction rates unknown and invalid declarations out of analysis", () => {
  const { catalog } = fixture();
  catalog.extractors.miner = {
    id: "miner",
    name: "Miner",
    description: "",
    descriptorId: "miner",
    iconId: "miner",
    resourceIds: ["ore"],
    canOverclock: true,
    powerMegawatts: 5,
    powerConsumptionExponent: 1,
  };
  const node: FactoryNode = {
    id: "miner",
    kind: "extractor",
    extractorId: "miner",
    resourceId: "ore",
    machines: createMachineMembers(1),
    x: 0,
    y: 0,
  };
  expect(prepareFlowPlan({ nodes: [node], links: [] }, catalog).analyze().status).toBe(
    "unverified",
  );
  const plan = prepareFlowPlan({ nodes: [node], links: [] }, catalog);
  expect(() =>
    validateExternalFlows(
      [external("miner", "output", "water", 10)],
      plan.ports("miner"),
      plan.materials,
    ),
  ).toThrow();
  expect(
    prepareFlowPlan(
      { nodes: [node], links: [], externalFlows: [external("missing", "output", "ore", 10)] },
      catalog,
    ).analyze().status,
  ).toBe("invalid");
});

it("uses domain ports without any icon assets, matching their display projection", () => {
  const { catalog, machine } = fixture();
  const node = machine("a", { ore: 60 }, { plate: 30 });
  const semantic = resolveSemanticPorts(node, catalog);
  const display = resolveFactoryNode(node, catalog);
  expect(
    semantic.map(({ portKey, direction, transport, itemId }) => ({
      key: portKey,
      direction,
      transport,
      itemId,
    })),
  ).toEqual(
    display.ports.map(({ key, direction, transport, itemId }) => ({
      key,
      direction,
      transport,
      itemId,
    })),
  );
  delete catalog.items.Desc_WAT1_C;
  expect(() => resolveProduction(node, catalog)).not.toThrow();
  expect(() => prepareFlowPlan({ nodes: [node], links: [] }, catalog).analyze()).not.toThrow();
});

it("reconstructs the screenshot's recycling loop, with 600 plastic and 750 rubber exported", () => {
  const { catalog, machine } = fixture();
  const oil = machine("oil", { oil: 30 }, { residue: 40, resin: 20 }, 12, 125);
  const fuel = machine("fuel", { residue: 50, water: 100 }, { fuel: 100 }, 12);
  const plastic = machine("plastic", { rubber: 30, fuel: 30 }, { plastic: 60 }, 12, 500 / 3);
  const rubber = machine("rubber", { plastic: 30, fuel: 30 }, { rubber: 60 }, 12, 500 / 3);
  const residual = machine("residual", { resin: 40, water: 40 }, { rubber: 20 }, 8, 93.75);
  catalog.extractors.water = {
    id: "water",
    name: "Water Extractor",
    description: "",
    descriptorId: "water",
    iconId: "water",
    resourceIds: ["water"],
    baseRate: 120,
    hasPurity: false,
    canOverclock: true,
    powerMegawatts: 20,
    powerConsumptionExponent: 1.321929,
  };
  const water: FactoryNode = {
    id: "water",
    kind: "extractor",
    extractorId: "water",
    resourceId: "water",
    machines: [...createMachineMembers(12), { id: "13", clockPercent: 50, sloopsUsed: 0 }],
    x: 0,
    y: 0,
  };
  const document: FactoryDocument = {
    nodes: [oil, water, fuel, plastic, rubber, residual],
    links: [
      link("oil", "fuel", "residue"),
      link("oil", "residual", "resin"),
      link("water", "fuel", "water"),
      link("water", "residual", "water"),
      link("fuel", "plastic", "fuel"),
      link("fuel", "rubber", "fuel"),
      link("plastic", "rubber", "plastic"),
      link("rubber", "plastic", "rubber"),
    ],
    externalFlows: [
      external("oil", "input", "oil", 450),
      external("plastic", "output", "plastic", 600),
      external("rubber", "output", "rubber", 600),
      external("residual", "output", "rubber", 150),
    ],
  };
  const result = prepareFlowPlan(document, catalog).analyze();
  expect(result.issues).toEqual([]);
  expect(result.status).toBe("feasible");
  expect(result.balances.find((row) => row.itemId === "plastic")?.exported).toBe(600);
  expect(result.balances.find((row) => row.itemId === "rubber")?.exported).toBe(750);
  expect(result.balances.find((row) => row.itemId === "water")?.produced).toBe(1500);
  expect(result.links.get("plastic-rubber")?.[0]?.perMinute).toBeCloseTo(600);
  expect(result.links.get("rubber-plastic")?.[0]?.perMinute).toBeCloseTo(600);
  expect(
    prepareFlowPlan(
      { ...document, links: document.links.filter((entry) => entry.id !== "plastic-rubber") },
      catalog,
    ).analyze().status,
  ).toBe("infeasible");
  const dry = prepareFlowPlan(
    {
      ...document,
      nodes: document.nodes.map((node) =>
        node.id === "water" ? { ...water, machines: createMachineMembers(10) } : node,
      ),
    },
    catalog,
  ).analyze();
  expect(dry.balances.find((row) => row.itemId === "water")?.missing).toBeCloseTo(300);
});

it("handles long logistics chains without recursive traversal or a manufactured circulating supply", () => {
  const { catalog, machine } = fixture();
  const count = 2000;
  const chain: FactoryNode[] = Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    kind: "logistics",
    partId: "splitter",
    x: 0,
    y: 0,
  }));
  const links: MaterialLink[] = chain.slice(1).map((node, i) => ({
    id: `l${i}`,
    output: ref(`s${i}`, "output:0"),
    input: ref(node.id, "input:0"),
  }));
  const source = machine("source", {}, { ore: 1 });
  const document: FactoryDocument = {
    nodes: [source, ...chain],
    links: [
      { id: "start", output: ref("source", "output:ore"), input: ref("s0", "input:0") },
      ...links,
    ],
    externalFlows: [{ port: ref(`s${count - 1}`, "output:0"), itemId: "ore", perMinute: 1 }],
  };
  const result = prepareFlowPlan(document, catalog).analyze();
  expect(result.status).toBe("feasible");
  expect(result.links.get("start")?.[0]?.perMinute).toBe(1);
  const emptyCycle = prepareFlowPlan(
    {
      nodes: chain.slice(0, 2),
      links: [links[0], { id: "back", output: ref("s1", "output:0"), input: ref("s0", "input:0") }],
    },
    catalog,
  ).analyze();
  expect(emptyCycle.links.size).toBe(0);
});

it("allocates mixed material through filtering logistics without granting either material extra supply", () => {
  const { catalog, machine } = fixture();
  const a = machine("a", {}, { ore: 60 });
  const b = machine("b", {}, { plate: 30 });
  const merger: FactoryNode = { id: "merge", kind: "logistics", partId: "merger", x: 0, y: 0 };
  const filter: FactoryNode = {
    id: "filter",
    kind: "logistics",
    partId: "smart-splitter",
    x: 0,
    y: 0,
    program: {
      "output:0": [{ kind: "item", itemId: "ore" }],
      "output:1": [{ kind: "item", itemId: "plate" }],
      "output:2": [{ kind: "none" }],
    },
  };
  const document: FactoryDocument = {
    nodes: [a, b, merger, filter],
    links: [
      { id: "a", output: ref("a", "output:ore"), input: ref("merge", "input:0") },
      { id: "b", output: ref("b", "output:plate"), input: ref("merge", "input:1") },
      { id: "mixed", output: ref("merge", "output:0"), input: ref("filter", "input:0") },
    ],
    externalFlows: [
      { port: ref("filter", "output:0"), itemId: "ore", perMinute: 60 },
      { port: ref("filter", "output:1"), itemId: "plate", perMinute: 30 },
    ],
  };
  const analysis = prepareFlowPlan(document, catalog).analyze();
  expect(analysis.status).toBe("feasible");
  expect(analysis.links.get("mixed")).toEqual([
    { itemId: "ore", perMinute: 60 },
    { itemId: "plate", perMinute: 30 },
  ]);
  expect(
    prepareFlowPlan(
      {
        ...document,
        externalFlows: [{ port: ref("filter", "output:0"), itemId: "plate", perMinute: 30 }],
      },
      catalog,
    ).analyze().status,
  ).toBe("invalid");
});

it("matches independently enumerated min cuts for branching fractional supply networks", () => {
  // Four terminals make every cut enumerable, independent of the allocation algorithm.
  for (let mask = 0; mask < 16; mask++) {
    const { catalog, machine } = fixture();
    const nodes = [
      machine("a", {}, { ore: 0.7 }),
      machine("b", {}, { ore: 0.4 }),
      machine("x", { ore: 0.6 }, { plate: 1 }),
      machine("y", { ore: 0.5 }, { plate: 1 }),
    ];
    const candidates = [
      link("a", "x", "ore"),
      link("a", "y", "ore"),
      link("b", "x", "ore"),
      link("b", "y", "ore"),
    ];
    const links = candidates.filter((_, i) => mask & (1 << i));
    let minCut = Infinity;
    for (let side = 0; side < 16; side++) {
      const inside = (id: string) => Boolean(side & (1 << ["a", "b", "x", "y"].indexOf(id)));
      if (links.some((entry) => inside(entry.output.nodeId) && !inside(entry.input.nodeId)))
        continue;
      const cut =
        (inside("a") ? 0 : 0.7) +
        (inside("b") ? 0 : 0.4) +
        (inside("x") ? 0.6 : 0) +
        (inside("y") ? 0.5 : 0);
      minCut = Math.min(minCut, cut);
    }
    const analysis = prepareFlowPlan(
      {
        nodes,
        links,
        externalFlows: [external("x", "output", "plate", 1), external("y", "output", "plate", 1)],
      },
      catalog,
    ).analyze();
    expect(analysis.balances.find((entry) => entry.itemId === "ore")?.missing).toBeCloseTo(
      1.1 - minCut,
    );
  }
});
