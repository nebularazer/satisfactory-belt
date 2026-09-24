import { SNAP_SIZE } from "@satisfactory-belt/canvas-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";
import { describe, expect, it } from "vitest";

import {
  withRecipe,
  formatPower,
  nodeBounds,
  portRows,
  resolveMachineNode,
  resolveFactoryNode,
} from "./index";
import type { LogisticsNode, ManufacturingNode } from "./index";
import { createConnectionIndex } from "./links";
import {
  commonSetting,
  createMachineMembers,
  resizeMachineGroup,
  setMachineSetting,
} from "./machine-settings";
/* oxlint-disable oxc/no-map-spread -- Tests construct immutable settings and retain original snapshots. */
import { resolveProduction } from "./production";
import { resolveSemanticPorts } from "./semantic-ports";

it.each(["splitter", "merger"] as const)(
  "projects %s slots on a compact snapping square without assigning material",
  (kind) => {
    const { catalog } = fixture();
    catalog.logistics.part = {
      id: "part",
      kind,
      name: kind,
      description: "",
      descriptorId: "Desc_Part",
      iconId: "part-icon",
    };
    const node = { id: "logistic", kind: "logistics", partId: "part", x: 16, y: -32 } as const;
    expect(nodeBounds(node)).toEqual({ id: node.id, x: 16, y: -32, width: 128, height: 128 });
    const display = resolveFactoryNode(node, catalog);
    expect(display).toMatchObject({ layout: "logistics", size: 128, machineIconId: "part-icon" });
    expect(display.ports).toHaveLength(4);
    expect(new Set(display.ports.map((port) => port.key)).size).toBe(4);
    for (const direction of ["input", "output"] as const) {
      const ports = display.ports.filter((port) => port.direction === direction);
      const multiple = (kind === "splitter") === (direction === "output");
      expect(ports.map((port) => port.y)).toEqual(multiple ? [32, 64, 96] : [64]);
      for (const port of ports) {
        expect(port).toMatchObject({
          transport: "belt",
          itemId: null,
          iconId: null,
          x: direction === "input" ? 0 : 128,
        });
        expect((node.x + port.x) % SNAP_SIZE).toBe(0);
        expect((node.y + port.y) % SNAP_SIZE).toBe(0);
      }
    }
    expect(() => resolveFactoryNode({ ...node, partId: "missing" }, catalog)).toThrow(
      "Missing logistics",
    );
    expect(() => resolveFactoryNode({ ...node, x: NaN }, catalog)).toThrow("Invalid position");
  },
);

function fixture() {
  const node: ManufacturingNode = {
    kind: "manufacturing",
    id: "node",
    x: 16,
    y: -32,
    recipeId: "Recipe",
    machineId: "Assembler",
    machines: createMachineMembers(3),
  };
  const catalog: GameCatalog = {
    schemaVersion: 1,
    extractors: {},
    logistics: {},
    sinks: {},
    source: { locale: "en", docsSha256: "a".repeat(64) },
    items: Object.fromEntries(
      ["Iron", "Screw", "Plate", "Water", "Desc_WAT1_C"].map((id) => [
        id,
        {
          id,
          name: id,
          description: "",
          form: "solid",
          sinkable: false,
          unit: "item",
          iconId: `${id}-icon`,
        },
      ]),
    ),
    machines: {
      Assembler: {
        id: "Assembler",
        name: "Assembler",
        description: "",
        descriptorId: "Desc_Assembler",
        iconId: "assembler-icon",
        manufacturingSpeed: 1,
        power: { kind: "fixed", megawatts: 15 },
        powerConsumptionExponent: 1.321929,
        canOverclock: true,
        sloopSlots: 2,
        productionBoost: { base: 1, perSloop: 0.5, powerExponent: 2 },
      },
    },
    recipes: {
      Recipe: {
        id: "Recipe",
        name: "Reinforced Iron Plate",
        durationSeconds: 12,
        ingredients: [
          { itemId: "Iron", amount: 6 },
          { itemId: "Screw", amount: 12 },
        ],
        products: [
          { itemId: "Plate", amount: 1 },
          { itemId: "Water", amount: 2 },
        ],
        machineIds: ["Assembler"],
        alternate: false,
        events: [],
        variablePower: { constantMegawatts: 0, factorMegawatts: 1 },
      },
    },
    fixedProducers: {
      Tree: {
        id: "Tree",
        name: "Gift Tree",
        descriptorId: "Desc_Tree",
        description: "",
        iconId: "tree-icon",
        durationSeconds: 4,
        products: [{ itemId: "Plate", amount: 1 }],
        powerMegawatts: 0,
        canOverclock: false,
        events: [],
      },
    },
  };
  return { node, catalog };
}

describe("machine card geometry", () => {
  it.each([
    [0, []],
    [1, [96]],
    [2, [96, 128]],
    [3, [96, 128, 160]],
    [4, [96, 128, 160, 192]],
  ] as const)("top-aligns %i ports on the snap lattice", (count, rows) => {
    expect(portRows(count)).toEqual(rows);
    const { node, catalog } = fixture();
    const recipe = catalog.recipes.Recipe;
    recipe.ingredients = Array.from({ length: count }, (_, i) => ({
      itemId: Object.keys(catalog.items)[i],
      amount: 1,
    }));
    const display = resolveMachineNode(node, catalog);
    expect(nodeBounds(node)).toMatchObject({ width: 256, height: 256 });
    expect(
      display.ports.filter((port) => port.direction === "input").map((port) => port.y),
    ).toEqual(rows);
    expect(display.ports.find((port) => port.direction === "output")?.y).toBe(96);
    for (const port of display.ports) {
      expect((node.x + port.x) % SNAP_SIZE).toBe(0);
      expect((node.y + port.y) % SNAP_SIZE).toBe(0);
    }
  });
  it.each([-1, 1.5, 5])("rejects unsupported port counts instead of clipping %s", (count) => {
    expect(() => portRows(count)).toThrow();
  });
});

it("resolves the machine header and stable aggregated ports including byproducts", () => {
  const { node, catalog } = fixture();
  const display = resolveMachineNode(node, catalog);
  expect(display).toMatchObject({
    title: "Reinforced Iron Plate",
    subtitle: "3× Assembler",
    machineIconId: "assembler-icon",
    powerLabel: "45 MW",
    clockLabel: "100%",
    sloops: { used: 0, slots: 2 },
  });
  expect(display.ports.map((port) => port.key)).toEqual([
    "input:Iron",
    "input:Screw",
    "output:Plate",
    "output:Water",
  ]);
  expect(display.ports[0]).toMatchObject({ name: "Iron", iconId: "Iron-icon", x: 0 });
  expect(display.ports[3]).toMatchObject({ name: "Water", x: 256 });
});

it.each([
  [0, 45],
  [1, 101.25],
  [2, 180],
])("shows %i/2 Sloops per machine and total group power", (sloopsUsed, megawatts) => {
  const { node, catalog } = fixture();
  const display = resolveMachineNode(
    { ...node, machines: node.machines.map((member) => ({ ...member, sloopsUsed })) },
    catalog,
  );
  expect(display.sloops).toMatchObject({ used: sloopsUsed, slots: 2 });
  expect(display.power).toEqual({ kind: "known", megawatts });
});

it("applies the extracted clock exponent and keeps variable power distinct from zero", () => {
  const { node, catalog } = fixture();
  const display = resolveMachineNode(
    { ...node, machines: node.machines.map((member) => ({ ...member, clockPercent: 200 })) },
    catalog,
  );
  expect(display.power.kind === "known" && display.power.megawatts).toBeCloseTo(112.5, 3);
  expect(display.clockLabel).toBe("200%");
  catalog.machines.Assembler.power = { kind: "variable" };
  expect(resolveMachineNode(node, catalog).power).toEqual({
    kind: "range",
    minMegawatts: 0,
    maxMegawatts: 3,
    averageMegawatts: 1.5,
  });
  expect(formatPower({ kind: "unknown" })).toBe("— MW");
  expect(formatPower({ kind: "known", megawatts: 100000 })).toBe("1.0e+5 MW");
});

it("hides unsupported footer settings without moving a fixed producer's output", () => {
  const { catalog } = fixture();
  const display = resolveMachineNode(
    {
      kind: "fixed-producer",
      id: "tree",
      producerId: "Tree",
      x: 0,
      y: 0,
      machines: createMachineMembers(1),
    },
    catalog,
  );
  expect(display).toMatchObject({
    title: "Gift Tree",
    powerLabel: "0 MW",
    clockLabel: null,
    sloops: null,
  });
  expect(display.ports).toHaveLength(1);
  expect(display.ports[0]).toMatchObject({ x: 256, y: 96 });
  catalog.machines.Assembler.sloopSlots = 0;
  expect(resolveMachineNode(fixture().node, catalog).sloops).toBeNull();
});

it.each(
  [
    [],
    [{ id: "a", clockPercent: -1, sloopsUsed: 0 }],
    [{ id: "a", clockPercent: 251, sloopsUsed: 0 }],
    [{ id: "a", clockPercent: 100, sloopsUsed: -1 }],
    [{ id: "a", clockPercent: 100, sloopsUsed: 3 }],
    [{ id: "a", clockPercent: 100, sloopsUsed: 0.5 }],
  ].map((machines) => ({ machines })),
)("rejects invalid machine configurations %j", ({ machines }) => {
  const { node, catalog } = fixture();
  expect(() => resolveMachineNode({ ...node, machines }, catalog)).toThrow();
});

it("rejects incompatible recipes and unsupported clock changes", () => {
  const { node, catalog } = fixture();
  catalog.machines.Assembler.canOverclock = false;
  expect(() =>
    resolveMachineNode(
      { ...node, machines: node.machines.map((member) => ({ ...member, clockPercent: 125 })) },
      catalog,
    ),
  ).toThrow("clock");
  catalog.recipes.Recipe.machineIds = ["Other"];
  expect(() => resolveMachineNode(node, catalog)).toThrow("incompatible");
});

it.each(["liquid", "gas"] as const)("uses pipe ports for %s alongside solid belt ports", (form) => {
  const { node, catalog } = fixture();
  catalog.items.Water.form = form;
  catalog.items.Water.unit = "m3";
  catalog.recipes.Recipe.ingredients.push({ itemId: "Water", amount: 1 });
  const display = resolveMachineNode(node, catalog);
  expect(
    display.ports.filter((port) => port.itemId === "Water").map((port) => port.transport),
  ).toEqual(["pipe", "pipe"]);
  expect(
    display.ports
      .filter((port) => port.itemId !== "Water")
      .every((port) => port.transport === "belt"),
  ).toBe(true);
  catalog.items.Water.name = "Packaged Water";
  catalog.items.Water.form = "solid";
  catalog.items.Water.unit = "item";
  expect(resolveMachineNode(node, catalog).ports.every((port) => port.transport === "belt")).toBe(
    true,
  );
});

it("resolves extraction as a single resource output with machine power, clock and no Sloops", () => {
  const { catalog } = fixture();
  catalog.items.Water.form = "liquid";
  catalog.extractors.Water = {
    id: "Water",
    descriptorId: "Desc_WaterPump",
    name: "Water Extractor",
    description: "",
    iconId: "water-pump-icon",
    resourceIds: ["Water"],
    powerMegawatts: 20,
    powerConsumptionExponent: 1.321929,
    canOverclock: true,
  };
  const node = {
    kind: "extractor",
    id: "pump",
    extractorId: "Water",
    resourceId: "Water",
    x: 16,
    y: 32,
    machines: createMachineMembers(2),
  } as const;
  const display = resolveMachineNode(node, catalog);
  expect(display).toMatchObject({
    title: "Water",
    subtitle: "2× Water Extractor",
    machineIconId: "water-pump-icon",
    powerLabel: "40 MW",
    clockLabel: "100%",
    sloops: null,
  });
  expect(display.ports).toHaveLength(1);
  expect(display.ports[0]).toMatchObject({
    key: "output:Water",
    transport: "pipe",
    x: 256,
    y: 96,
  });
  expect(
    resolveMachineNode(
      { ...node, machines: node.machines.map((member) => ({ ...member, clockPercent: 200 })) },
      catalog,
    ).powerLabel,
  ).toBe("100 MW");
  expect(() => resolveMachineNode({ ...node, resourceId: "Iron" }, catalog)).toThrow(
    "incompatible",
  );
  expect(() =>
    resolveMachineNode(
      { ...node, machines: node.machines.map((member) => ({ ...member, clockPercent: 251 })) },
      catalog,
    ),
  ).toThrow("Invalid clock");
  expect(() => resolveMachineNode({ ...node, extractorId: "Missing" }, catalog)).toThrow(
    "Missing extractor",
  );
});

it("projects a grouped Sink as one terminal belt input with aggregate power", () => {
  const { catalog } = fixture();
  catalog.sinks.sink = {
    id: "sink",
    descriptorId: "desc",
    iconId: "sink-icon",
    name: "AWESOME Sink",
    description: "",
    powerMegawatts: 30,
  };
  const node = {
    id: "sink-node",
    kind: "sink",
    sinkId: "sink",
    machines: createMachineMembers(2),
    x: 0,
    y: 0,
  } as const;
  const display = resolveFactoryNode(node, catalog);
  expect(display).toMatchObject({
    layout: "machine",
    powerLabel: "60 MW",
    clockLabel: null,
    sloops: null,
    machineIconId: "sink-icon",
  });
  expect(display.ports).toHaveLength(1);
  expect(display.ports[0]).toMatchObject({
    key: "input:0",
    direction: "input",
    itemId: null,
    transport: "belt",
  });
  expect(() => resolveFactoryNode({ ...node, sinkId: "missing" }, catalog)).toThrow(
    "Missing AWESOME Sink",
  );
});

it.each(["smart-splitter", "programmable-splitter"] as const)(
  "projects %s with one input and three stable outputs",
  (kind) => {
    const { catalog } = fixture();
    catalog.logistics.part = {
      id: "part",
      descriptorId: "desc",
      iconId: "icon",
      name: kind,
      description: "",
      kind,
    };
    const display = resolveFactoryNode(
      { kind: "logistics", id: "node", partId: "part", x: 0, y: 0 },
      catalog,
    );
    expect(display.ports.map((port) => port.key)).toEqual([
      "input:0",
      "output:0",
      "output:1",
      "output:2",
    ]);
    expect(display.ports.filter((port) => port.disabled).map((port) => port.key)).toEqual([
      "output:0",
      "output:2",
    ]);
  },
);

it("shows configured splitter items without inventing incoming material flow", () => {
  const { catalog } = fixture();
  catalog.logistics.part = {
    id: "part",
    descriptorId: "desc",
    iconId: "icon",
    name: "Programmable Splitter",
    description: "",
    kind: "programmable-splitter",
  };
  const node: LogisticsNode = {
    kind: "logistics",
    id: "splitter",
    partId: "part",
    x: 0,
    y: 0,
    program: {
      "output:0": [
        { kind: "item", itemId: "Iron" },
        { kind: "item", itemId: "Screw" },
        { kind: "none" },
      ],
      "output:1": [{ kind: "any-undefined" }, { kind: "overflow" }],
      "output:2": [],
    },
  };
  const display = resolveFactoryNode(node, catalog);
  expect(display.ports.find((port) => port.key === "output:0")).toMatchObject({
    configuredItemIconIds: ["Iron-icon", "Screw-icon"],
    itemId: null,
    disabled: false,
  });
  expect(display.ports.find((port) => port.key === "output:1")).toMatchObject({
    configuredItemIconIds: [],
    disabled: false,
  });
  expect(display.ports.find((port) => port.key === "output:2")).toMatchObject({
    configuredItemIconIds: [],
    disabled: true,
  });
  const index = createConnectionIndex(resolveSemanticPorts(node, catalog), []);
  expect(index.materials({ nodeId: node.id, portKey: "output:0" })).toEqual(new Set());
});

it("edits one member, represents mixed settings, and overwrites only the chosen All setting", () => {
  const { node, catalog } = fixture();
  const first = node.machines[0].id;
  const clocked = setMachineSetting(node, catalog, first, "clockPercent", 200);
  const amplified = setMachineSetting(clocked, catalog, node.machines[1].id, "sloopsUsed", 1);
  expect(commonSetting(amplified.machines, "clockPercent")).toBeNull();
  expect(commonSetting(amplified.machines, "sloopsUsed")).toBeNull();
  expect(resolveFactoryNode(amplified, catalog)).toMatchObject({
    clockLabel: "Mixed",
    sloops: { used: null },
  });
  const uniformClock = setMachineSetting(amplified, catalog, "all", "clockPercent", 150);
  expect(commonSetting(uniformClock.machines, "clockPercent")).toBe(150);
  expect(uniformClock.machines.map((member) => member.sloopsUsed)).toEqual([0, 1, 0]);
  expect(uniformClock.machines.map((member) => member.id)).toEqual(
    node.machines.map((member) => member.id),
  );
  expect(
    node.machines.every((member) => member.clockPercent === 100 && member.sloopsUsed === 0),
  ).toBe(true);
  expect(setMachineSetting(uniformClock, catalog, "all", "clockPercent", 150)).toBe(uniformClock);
  expect(() => setMachineSetting(node, catalog, "missing", "clockPercent", 100)).toThrow(
    "no longer",
  );
  expect(() => setMachineSetting(node, catalog, "all", "sloopsUsed", 0.5)).toThrow("Sloop");
});

it("retains surviving members when resizing and inherits common settings for new members", () => {
  const { node } = fixture();
  const shrunk = resizeMachineGroup(node, 2, () => "unused");
  const grown = resizeMachineGroup(shrunk, 3, () => "new-member");
  expect(grown.machines.slice(0, 2)).toEqual(node.machines.slice(0, 2));
  expect(grown.machines[0]).toBe(node.machines[0]);
  expect(grown.machines[2]).toEqual({ id: "new-member", clockPercent: 100, sloopsUsed: 0 });
  expect(resizeMachineGroup(node, 3, () => "unused")).toBe(node);
  expect(() => resizeMachineGroup(node, 0, () => "unused")).toThrow();
  expect(() => resizeMachineGroup(node, 1.5, () => "unused")).toThrow();
});

it("sums per-member input/output rates without amplifying inputs and calculates individual power", () => {
  const { node, catalog } = fixture();
  const mixed = {
    ...node,
    machines: [
      { id: "first", clockPercent: 200, sloopsUsed: 2 },
      { id: "second", clockPercent: 50, sloopsUsed: 0 },
    ],
  };
  const all = resolveProduction(mixed, catalog);
  expect(all.inputs).toEqual([
    { itemId: "Iron", perMinute: 75 },
    { itemId: "Screw", perMinute: 150 },
  ]);
  expect(all.outputs).toEqual([
    { itemId: "Plate", perMinute: 22.5 },
    { itemId: "Water", perMinute: 45 },
  ]);
  expect(resolveProduction(mixed, catalog, "first").outputs[0].perMinute).toBe(20);
  expect(resolveProduction(mixed, catalog, "second").outputs[0].perMinute).toBe(2.5);
  const power = resolveMachineNode(mixed, catalog).power;
  expect(power.kind === "known" && power.megawatts).toBeCloseTo(
    15 * 2 ** 1.321929 * 4 + 15 * 0.5 ** 1.321929,
  );
  catalog.machines.Assembler.manufacturingSpeed = 2;
  expect(resolveProduction(mixed, catalog).inputs[0].perMinute).toBe(150);
});

it("keeps consumed and produced copies of a material separate and sums duplicate entries", () => {
  const { node, catalog } = fixture();
  catalog.recipes.Recipe.ingredients = [
    { itemId: "Water", amount: 1 },
    { itemId: "Water", amount: 2 },
  ];
  const rates = resolveProduction(node, catalog);
  expect(rates.inputs).toEqual([{ itemId: "Water", perMinute: 45 }]);
  expect(rates.outputs.find((entry) => entry.itemId === "Water")!.perMinute).toBe(30);
});

it("calculates fixed production and keeps unsupported extraction rates unknown", () => {
  const { catalog } = fixture();
  expect(
    resolveProduction(
      {
        kind: "fixed-producer",
        id: "tree",
        producerId: "Tree",
        x: 0,
        y: 0,
        machines: createMachineMembers(2),
      },
      catalog,
    ),
  ).toMatchObject({
    inputs: [],
    outputs: [{ itemId: "Plate", perMinute: 30 }],
    unavailableReason: null,
  });
  catalog.extractors.Miner = {
    id: "Miner",
    descriptorId: "desc",
    name: "Miner",
    description: "",
    iconId: "miner",
    resourceIds: ["Iron"],
    powerMegawatts: 5,
    powerConsumptionExponent: 1.321929,
    canOverclock: true,
  };
  expect(
    resolveProduction(
      {
        kind: "extractor",
        id: "miner",
        extractorId: "Miner",
        resourceId: "Iron",
        x: 0,
        y: 0,
        machines: createMachineMembers(2),
      },
      catalog,
    ),
  ).toMatchObject({
    outputs: [{ itemId: "Iron", perMinute: null }],
    unavailableReason: expect.any(String),
  });
});

it("inherits All settings when growing and copies the last member for mixed settings", () => {
  const { node, catalog } = fixture();
  const clocked = setMachineSetting(node, catalog, "all", "clockPercent", 150);
  const amplified = setMachineSetting(clocked, catalog, "all", "sloopsUsed", 2);
  const grown = resizeMachineGroup(amplified, 4, () => "new");
  expect(grown.machines[3]).toEqual({ id: "new", clockPercent: 150, sloopsUsed: 2 });
  expect(commonSetting(grown.machines, "clockPercent")).toBe(150);
  expect(commonSetting(grown.machines, "sloopsUsed")).toBe(2);
  const mixed = setMachineSetting(amplified, catalog, amplified.machines[2].id, "sloopsUsed", 1);
  expect(resizeMachineGroup(mixed, 4, () => "new").machines[3]).toEqual({
    id: "new",
    clockPercent: 150,
    sloopsUsed: 1,
  });
});

it("scales variable recipe power ranges with each member's clock and amplification", () => {
  const { catalog, node } = fixture();
  catalog.machines.Assembler.power = { kind: "variable" };
  catalog.recipes.Recipe.variablePower = { constantMegawatts: 500, factorMegawatts: 1000 };
  const members = createMachineMembers(1, { clockPercent: 200, sloopsUsed: 2 });
  const display = resolveMachineNode({ ...node, machines: members }, catalog);
  if (display.power.kind !== "range") throw new Error("Expected a power range");
  expect(display.power.minMegawatts).toBeCloseTo(5000, 1);
  expect(display.power.maxMegawatts).toBeCloseTo(15000, 1);
  expect(display.power.averageMegawatts).toBeCloseTo(10000, 1);
});

it("switches producer for an alternative recipe while retaining members and supported settings", () => {
  const { catalog, node } = fixture();
  catalog.machines.Other = { ...catalog.machines.Assembler, id: "Other", sloopSlots: 1 };
  catalog.recipes.Alternative = {
    ...catalog.recipes.Recipe,
    id: "Alternative",
    machineIds: ["Other"],
  };
  const original = {
    ...node,
    machines: createMachineMembers(2, { clockPercent: 150, sloopsUsed: 2 }),
  };
  const changed = withRecipe(original, "Alternative", catalog);
  expect(changed).toMatchObject({ machineId: "Other", recipeId: "Alternative" });
  expect(changed.machines).toEqual(
    original.machines.map((member) => ({ ...member, sloopsUsed: 1 })),
  );
  expect(withRecipe(original, original.recipeId, catalog)).toBe(original);
});
