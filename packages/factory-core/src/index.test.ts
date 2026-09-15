import { SNAP_SIZE } from "@satisfactory-belt/canvas-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";
import { describe, expect, it } from "vitest";

import { formatPower, nodeBounds, portRows, resolveMachineNode } from "./index";
import type { ManufacturingNode } from "./index";

function fixture() {
  const node: ManufacturingNode = {
    kind: "manufacturing",
    id: "node",
    x: 16,
    y: -32,
    recipeId: "Recipe",
    machineId: "Assembler",
    machineCount: 3,
    clockPercent: 100,
    sloopsUsed: 0,
  };
  const catalog: GameCatalog = {
    schemaVersion: 1,
    extractors: {},
    source: { locale: "en", docsSha256: "a".repeat(64) },
    items: Object.fromEntries(
      ["Iron", "Screw", "Plate", "Water", "Desc_WAT1_C"].map((id) => [
        id,
        {
          id,
          name: id,
          description: "",
          form: "solid",
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
    [1, [144]],
    [2, [128, 160]],
    [3, [112, 144, 176]],
    [4, [96, 128, 160, 192]],
  ] as const)("centers %i ports on the snap lattice", (count, rows) => {
    expect(portRows(count)).toEqual(rows);
    const { node, catalog } = fixture();
    const recipe = catalog.recipes.Recipe;
    recipe.ingredients = Array.from({ length: count }, (_, i) => ({
      itemId: Object.keys(catalog.items)[i],
      amount: 1,
    }));
    const display = resolveMachineNode(node, catalog);
    expect(nodeBounds(node)).toMatchObject({ width: 256, height: 256 });
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
  const display = resolveMachineNode({ ...node, sloopsUsed }, catalog);
  expect(display.sloops).toMatchObject({ used: sloopsUsed, slots: 2 });
  expect(display.power).toEqual({ kind: "known", megawatts });
});

it("applies the extracted clock exponent and keeps variable power distinct from zero", () => {
  const { node, catalog } = fixture();
  const display = resolveMachineNode({ ...node, clockPercent: 200 }, catalog);
  expect(display.power.kind === "known" && display.power.megawatts).toBeCloseTo(112.5, 3);
  expect(display.clockLabel).toBe("200%");
  catalog.machines.Assembler.power = { kind: "variable" };
  expect(resolveMachineNode(node, catalog).powerLabel).toBe("Variable");
  expect(formatPower({ kind: "unknown" })).toBe("— MW");
  expect(formatPower({ kind: "known", megawatts: 100000 })).toBe("1.0e+5 MW");
});

it("hides unsupported footer settings without moving a fixed producer's output", () => {
  const { catalog } = fixture();
  const display = resolveMachineNode(
    { kind: "fixed-producer", id: "tree", producerId: "Tree", x: 0, y: 0, machineCount: 1 },
    catalog,
  );
  expect(display).toMatchObject({
    title: "Gift Tree",
    powerLabel: "0 MW",
    clockLabel: null,
    sloops: null,
  });
  expect(display.ports).toHaveLength(1);
  expect(display.ports[0]).toMatchObject({ x: 256, y: 144 });
  catalog.machines.Assembler.sloopSlots = 0;
  expect(resolveMachineNode(fixture().node, catalog).sloops).toBeNull();
});

it.each([
  { machineCount: 0 },
  { machineCount: 1.5 },
  { clockPercent: 0 },
  { clockPercent: 251 },
  { sloopsUsed: -1 },
  { sloopsUsed: 3 },
  { sloopsUsed: 0.5 },
])("rejects invalid machine configurations %j", (change) => {
  const { node, catalog } = fixture();
  expect(() => resolveMachineNode({ ...node, ...change }, catalog)).toThrow();
});

it("rejects incompatible recipes and unsupported clock changes", () => {
  const { node, catalog } = fixture();
  catalog.machines.Assembler.canOverclock = false;
  expect(() => resolveMachineNode({ ...node, clockPercent: 125 }, catalog)).toThrow("clock");
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
    machineCount: 2,
    clockPercent: 100,
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
    y: 144,
  });
  expect(resolveMachineNode({ ...node, clockPercent: 200 }, catalog).powerLabel).toBe("100 MW");
  expect(() => resolveMachineNode({ ...node, resourceId: "Iron" }, catalog)).toThrow(
    "incompatible",
  );
  expect(() => resolveMachineNode({ ...node, clockPercent: 251 }, catalog)).toThrow(
    "Invalid clock",
  );
  expect(() => resolveMachineNode({ ...node, extractorId: "Missing" }, catalog)).toThrow(
    "Missing extractor",
  );
});
