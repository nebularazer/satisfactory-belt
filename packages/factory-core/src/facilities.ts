import type { Building, GameCatalog } from "@satisfactory-belt/game-data";
import { PROJECT_PHASES } from "@satisfactory-belt/game-data";

import { NODE_SIZE, portRows, formatPower } from "./index";
import type { MachineMember, MachineDisplay, PortDisplay, PowerDisplay } from "./index";
import type { Production } from "./production";

export type Purity = 0.5 | 1 | 2;
export type FacilityConfiguration =
  | Readonly<{ type: "generator"; fuelId: string }>
  | Readonly<{ type: "geothermal" | "augmenter" | "storage" | "depot" }>
  | Readonly<{
      type: "well";
      resourceId: string;
      satellites: readonly { id: string; purity: Purity }[];
    }>
  | Readonly<{
      type: "truck-station";
      name: string;
      mode: "load" | "unload";
      materialId: string | null;
      routeId: string | null;
    }>
  | Readonly<{ type: "train-station"; name: string; routeId: string | null }>
  | Readonly<{
      type: "freight-platform";
      stationId: string | null;
      position: number;
      mode: "load" | "unload";
      materialId: string | null;
    }>
  | Readonly<{
      type: "drone-port";
      name: string;
      destinationId: string | null;
      hasDrone: boolean;
      fuelId: string;
      outgoingItemId: string | null;
      incomingItemId: string | null;
      roundTripSeconds: number;
    }>
  | Readonly<{
      type: "space-elevator";
      phase: number;
      delivered: Readonly<Record<string, number>>;
    }>;
export type FacilityNode = Readonly<{
  kind: "facility";
  id: string;
  x: number;
  y: number;
  buildingId: string;
  configuration: FacilityConfiguration;
  machines: readonly MachineMember[];
}>;
export type TransportStop = Readonly<{
  id: string;
  nodeId: string;
  loadItemIds: readonly string[];
  unloadItemIds: readonly string[];
  waitSeconds: number;
}>;
export type TransportRoute = Readonly<{
  id: string;
  name: string;
  kind: "road" | "rail";
  vehicleCount: number;
  roundTripSeconds: number;
  fuelId: string | null;
  fuelPerTrip: number;
  stops: readonly TransportStop[];
}>;
export type DepotResearch = Readonly<{ speedLevel: number; capacityLevel: number }>;
export const DEFAULT_DEPOT_RESEARCH: DepotResearch = { speedLevel: 0, capacityLevel: 0 };
export const DEPOT_SPEEDS = [15, 30, 60, 120, 240] as const;

export function defaultFacilityConfiguration(building: Building): FacilityConfiguration {
  switch (building.kind) {
    case "generator":
      return { type: "generator", fuelId: building.fuels[0]!.itemId };
    case "well":
      return {
        type: "well",
        resourceId: building.resourceIds[0]!,
        satellites: [{ id: "1", purity: 1 }],
      };
    case "truck-station":
      return {
        type: "truck-station",
        name: building.name,
        mode: "load",
        materialId: null,
        routeId: null,
      };
    case "train-station":
      return { type: "train-station", name: building.name, routeId: null };
    case "freight-platform":
      return {
        type: "freight-platform",
        stationId: null,
        position: 1,
        mode: "load",
        materialId: null,
      };
    case "drone-port":
      return {
        type: "drone-port",
        name: building.name,
        destinationId: null,
        hasDrone: true,
        fuelId: building.fuels[0]!.itemId,
        outgoingItemId: null,
        incomingItemId: null,
        roundTripSeconds: 120,
      };
    case "space-elevator":
      return { type: "space-elevator", phase: 1, delivered: {} };
    default:
      return { type: building.kind };
  }
}
export function facilityCanGroup(building: Building) {
  return ["generator", "geothermal", "augmenter", "storage", "depot"].includes(building.kind);
}
export function validateFacility(node: FacilityNode, catalog: GameCatalog) {
  const b = catalog.buildings?.[node.buildingId],
    c = node.configuration;
  if (!b || b.kind !== c.type) throw new Error("Invalid building configuration.");
  if (!facilityCanGroup(b) && node.machines.length !== 1)
    throw new Error("This building has its own identity and cannot be grouped.");
  const transport = b.transport;
  function material(id: string | null) {
    if (
      id !== null &&
      (!catalog.items[id] || (catalog.items[id].form === "solid") !== (transport === "belt"))
    )
      throw new Error("Incompatible material.");
  }
  if (c.type === "generator" || c.type === "drone-port")
    if (!b.fuels.some((f) => f.itemId === c.fuelId)) throw new Error("Invalid fuel.");
  if (c.type === "well") {
    if (
      !b.resourceIds.includes(c.resourceId) ||
      !c.satellites.length ||
      c.satellites.length > 10 ||
      new Set(c.satellites.map((s) => s.id)).size !== c.satellites.length ||
      c.satellites.some((s) => !s.id || ![0.5, 1, 2].includes(s.purity))
    )
      throw new Error("Invalid well satellites or resource.");
  }
  if (c.type === "truck-station" || c.type === "freight-platform") {
    material(c.materialId);
    if (!["load", "unload"].includes(c.mode)) throw new Error("Invalid transfer mode.");
  }
  if (
    c.type === "freight-platform" &&
    (!Number.isSafeInteger(c.position) || c.position < 1 || c.position > 100)
  )
    throw new Error("Invalid platform position.");
  if (c.type === "drone-port") {
    material(c.outgoingItemId);
    material(c.incomingItemId);
    if (!Number.isFinite(c.roundTripSeconds) || c.roundTripSeconds < 1)
      throw new Error("Invalid round-trip time.");
  }
  if (c.type === "space-elevator") {
    const phase = PROJECT_PHASES[c.phase - 1];
    if (!Number.isInteger(c.phase) || !phase) throw new Error("Invalid project phase.");
    for (const [id, amount] of Object.entries(c.delivered))
      if (
        !phase.some((p) => p.itemId === id && amount >= 0 && amount <= p.amount) ||
        !Number.isSafeInteger(amount)
      )
        throw new Error("Invalid delivery progress.");
  }
}

export function facilityProduction(node: FacilityNode, catalog: GameCatalog): Production {
  const b = catalog.buildings![node.buildingId]!,
    c = node.configuration;
  const clock = node.machines.reduce((sum, m) => sum + m.clockPercent / 100, 0);
  if (c.type === "generator") {
    const fuel = b.fuels.find((f) => f.itemId === c.fuelId)!;
    const effective = node.machines.reduce(
      (sum, m) =>
        sum + (m.clockPercent / 100) * (b.loadFollowing ? (m.loadPercent ?? 100) / 100 : 1),
      0,
    );
    const fuelRate =
      ((b.powerMegawatts * 60) / catalog.items[c.fuelId]!.energyMegajoules!) * effective;
    return {
      inputs: [
        { itemId: c.fuelId, perMinute: fuelRate },
        ...(fuel.supplementalItemId
          ? [{ itemId: fuel.supplementalItemId, perMinute: fuel.supplementalPerMinute * effective }]
          : []),
      ],
      outputs: fuel.byproduct
        ? [{ itemId: fuel.byproduct.itemId, perMinute: fuelRate * fuel.byproduct.amount }]
        : [],
      unavailableReason: null,
    };
  }
  if (c.type === "well")
    return {
      inputs: [],
      outputs: [
        {
          itemId: c.resourceId,
          perMinute: b.baseRate * clock * c.satellites.reduce((sum, s) => sum + s.purity, 0),
        },
      ],
      unavailableReason: null,
    };
  if (c.type === "augmenter")
    return {
      inputs: [
        {
          itemId: "Desc_AlienPowerFuel_C",
          perMinute: node.machines.filter((m) => m.suppliedMatrices).length * 5,
        },
      ],
      outputs: [],
      unavailableReason: null,
    };
  if (c.type === "geothermal" || c.type === "train-station")
    return { inputs: [], outputs: [], unavailableReason: null };
  if (c.type === "space-elevator")
    return {
      inputs: PROJECT_PHASES[c.phase - 1]!.map((p) => ({ itemId: p.itemId, perMinute: null })),
      outputs: [],
      unavailableReason: "Project deliveries are finite quantities, not continuous rates.",
    };
  return { inputs: [], outputs: [], unavailableReason: "Rates depend on connected material flow." };
}

export function resolveFacility(node: FacilityNode, catalog: GameCatalog): MachineDisplay {
  validateFacility(node, catalog);
  const b = catalog.buildings![node.buildingId]!,
    c = node.configuration;
  const production = facilityProduction(node, catalog);
  const ports: PortDisplay[] = [];
  function port(
    direction: "input" | "output",
    key: string,
    itemId: string | null,
    transport = b.transport,
    name?: string,
  ) {
    const item = itemId ? catalog.items[itemId] : null;
    ports.push({
      key,
      direction,
      itemId,
      transport: item ? (item.form === "solid" ? "belt" : "pipe") : transport,
      name: name ?? item?.name ?? "Materials",
      iconId: item?.iconId ?? null,
      x: direction === "input" ? 0 : NODE_SIZE,
      y: 0,
    });
  }
  for (const direction of ["input", "output"] as const)
    for (const rate of direction === "input" ? production.inputs : production.outputs)
      port(direction, `${direction}:${rate.itemId}`, rate.itemId);
  if (c.type === "storage") {
    port("input", "input:0", null);
    port("output", "output:0", null);
  }
  if (c.type === "depot") port("input", "input:0", null);
  if (c.type === "truck-station" || c.type === "freight-platform") {
    if (!b.id.includes("Empty"))
      port(
        c.mode === "load" ? "input" : "output",
        c.mode === "load" ? "input:cargo" : "output:cargo",
        c.materialId,
      );
    if (c.type === "truck-station") port("input", "input:fuel", null, "belt", "Vehicle fuel");
  }
  if (c.type === "drone-port") {
    port("input", "input:cargo", c.outgoingItemId);
    port("output", "output:cargo", c.incomingItemId);
    port("input", "input:fuel", c.fuelId);
  }
  for (const direction of ["input", "output"] as const) {
    const side = ports.filter((p) => p.direction === direction);
    const rows = portRows(side.length);
    side.forEach((p, i) => {
      ports[ports.indexOf(p)] = { ...p, y: rows[i]! };
    });
  }
  let power: PowerDisplay = {
    kind: "known",
    megawatts: node.machines.reduce(
      (sum, m) =>
        sum +
        b.powerMegawatts *
          (b.kind === "well"
            ? (m.clockPercent / 100) ** b.powerConsumptionExponent
            : b.kind === "generator"
              ? (m.clockPercent / 100) * (b.loadFollowing ? (m.loadPercent ?? 100) / 100 : 1)
              : 1),
      0,
    ),
  };
  if (c.type === "geothermal") {
    const avg = node.machines.reduce((sum, m) => sum + b.baseRate * (m.purity ?? 1), 0);
    power = {
      kind: "range",
      minMegawatts: avg / 2,
      maxMegawatts: avg * 1.5,
      averageMegawatts: avg,
    };
  }
  const generated = ["generator", "geothermal", "augmenter"].includes(c.type);
  return {
    layout: "machine",
    size: NODE_SIZE,
    title:
      "name" in c
        ? c.name
        : c.type === "well"
          ? catalog.items[c.resourceId]!.name
          : c.type === "generator"
            ? catalog.items[c.fuelId]!.name
            : b.name,
    subtitle: `${node.machines.length}× ${b.name}`,
    machineIconId: b.iconId,
    ports,
    power,
    powerLabel: `${formatPower(power)}${generated ? " generated" : ""}`,
    clockLabel: b.canOverclock
      ? node.machines.every((member) => member.clockPercent === node.machines[0]!.clockPercent)
        ? `${node.machines[0]!.clockPercent}%`
        : "Mixed"
      : null,
    sloops: null,
  };
}

export function parsePurity(value: number): Purity {
  if (value !== 0.5 && value !== 1 && value !== 2) throw new Error("Invalid purity.");
  return value;
}
