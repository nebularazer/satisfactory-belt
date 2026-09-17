import type { GameCatalog } from "@satisfactory-belt/game-data";

import type { TransportRoute } from "./facilities";
import type { FactoryNode, ManufacturingNode } from "./index";
import { createConnectionIndex } from "./links";
import type { FactoryDocument } from "./links";
import { resolveSemanticPorts } from "./semantic-ports";
import { settingsKey } from "./settings";
import { stationKind } from "./transport";

/** A candidate must preserve every existing link, including downstream mixed-material paths. */
export function canReplaceNode(
  document: FactoryDocument,
  candidate: FactoryNode,
  catalog: GameCatalog,
): boolean {
  return createConfigurationValidator(document, catalog)(candidate);
}

/** Cache candidates per document; only their connected component can change material compatibility. */
export function createConfigurationValidator(document: FactoryDocument, catalog: GameCatalog) {
  const basePorts = document.nodes.flatMap((node) => resolveSemanticPorts(node, catalog));
  const ids = new Set(document.nodes.map((node) => node.id));
  const adjacent = new Map<string, Set<string>>();
  for (const id of ids) adjacent.set(id, new Set());
  for (const link of document.links) {
    for (const [a, b] of [
      [link.input.nodeId, link.output.nodeId],
      [link.output.nodeId, link.input.nodeId],
    ] as const) {
      const neighbors = adjacent.get(a) ?? new Set<string>();
      neighbors.add(b);
      adjacent.set(a, neighbors);
    }
  }
  type Component = {
    ports: typeof basePorts;
    links: FactoryDocument["links"][number][];
    valid: boolean;
  };
  const components = new Map<string, Component>();
  for (const id of adjacent.keys()) {
    if (components.has(id)) continue;
    const component: Component = { ports: [], links: [], valid: true };
    const pending = [id];
    components.set(id, component);
    for (let i = 0; i < pending.length; i++) {
      for (const neighbor of adjacent.get(pending[i]!) ?? []) {
        if (components.has(neighbor)) continue;
        components.set(neighbor, component);
        pending.push(neighbor);
      }
    }
  }
  for (const port of basePorts) components.get(port.nodeId)!.ports.push(port);
  for (const link of document.links) components.get(link.output.nodeId)!.links.push(link);
  let invalidComponents = 0;
  for (const component of new Set(components.values())) {
    const index = createConnectionIndex(component.ports, component.links);
    component.valid = component.links.every(
      (link) => index.compatibility(link.output, link.input, true).compatible,
    );
    if (!component.valid) invalidComponents++;
  }
  const results = new Map<string, boolean>();
  return (candidate: FactoryNode): boolean => {
    const key = settingsKey(candidate);
    const cached = results.get(key);
    if (cached !== undefined) return cached;
    let valid = false;
    try {
      const component = components.get(candidate.id);
      if (ids.has(candidate.id) && component && invalidComponents === (component.valid ? 0 : 1)) {
        const ports = [
          ...component.ports.filter((port) => port.nodeId !== candidate.id),
          ...resolveSemanticPorts(candidate, catalog),
        ];
        const index = createConnectionIndex(ports, component.links);
        valid = component.links.every(
          (link) => index.compatibility(link.output, link.input, true).compatible,
        );
        if (valid && candidate.kind === "facility")
          validateFacilityReferences({
            ...document,
            nodes: document.nodes.map((node) => (node.id === candidate.id ? candidate : node)),
          });
      }
    } catch {
      valid = false;
    }
    results.set(key, valid);
    return valid;
  };
}

export function validateFacilityReferences(document: FactoryDocument) {
  for (const node of document.nodes) {
    if (node.kind !== "facility") continue;
    const c = node.configuration;
    if (c.type === "truck-station" || c.type === "train-station" || c.type === "drone-port") {
      if (
        c.routeId &&
        !document.routes?.some((r) => r.id === c.routeId && r.kind === stationKind(node))
      )
        throw new Error("Incompatible transport route.");
    }
    if (c.type === "train-station" && c.routeId) {
      const route = document.routes?.find((entry) => entry.id === c.routeId);
      if (c.platforms.length !== (route?.freightCarCount ?? 1))
        throw new Error("Platform positions must match the train's freight cars.");
    }
  }
}

/** Keep the current producer when supported; alternatives may select another producer. */
export function withRecipe(
  node: ManufacturingNode,
  recipeId: string,
  catalog: GameCatalog,
): ManufacturingNode {
  if (recipeId === node.recipeId) return node;
  const recipe = catalog.recipes[recipeId];
  if (!recipe) throw new Error("Missing recipe.");
  const machineId = recipe.machineIds.includes(node.machineId)
    ? node.machineId
    : recipe.machineIds[0]!;
  const machine = catalog.machines[machineId]!;
  return {
    ...node,
    recipeId,
    machineId,
    machines: node.machines.map((member) => ({
      ...member,
      sloopsUsed: Math.min(member.sloopsUsed, machine.sloopSlots),
      clockPercent: machine.canOverclock ? member.clockPercent : 100,
    })),
  };
}

export function validateTransportRoute(document: FactoryDocument, route: TransportRoute) {
  if (
    !route.id ||
    !route.name.trim() ||
    !["road", "rail", "drone"].includes(route.kind) ||
    !Number.isSafeInteger(route.vehicleCount) ||
    route.vehicleCount < 1 ||
    route.vehicleCount > (route.kind === "drone" ? 2 : 10000) ||
    !Number.isFinite(route.roundTripSeconds) ||
    route.roundTripSeconds < 1 ||
    !Number.isFinite(route.fuelPerTrip) ||
    route.fuelPerTrip < 0
  )
    throw new Error("Invalid route settings.");
  if (route.kind === "rail") {
    const count = route.freightCarCount ?? 1;
    const stations = new Set(route.stops.map((stop) => stop.nodeId));
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > 100 ||
      document.nodes.some(
        (node) =>
          node.kind === "facility" &&
          node.configuration.type === "train-station" &&
          stations.has(node.id) &&
          node.configuration.platforms.slice(count).some(Boolean),
      )
    )
      throw new Error("Train must include every assigned freight car.");
  }
  if (new Set(route.stops.map((stop) => stop.id)).size !== route.stops.length)
    throw new Error("Duplicate route stop.");
  for (const setting of route.stops) {
    const stop = document.nodes.find((node) => node.id === setting.nodeId);
    if (
      !setting.id ||
      !Number.isFinite(setting.waitSeconds) ||
      setting.waitSeconds < 0 ||
      setting.waitSeconds > 86400
    )
      throw new Error("Invalid stop settings.");
    if (stop?.kind !== "facility" || stationKind(stop) !== route.kind)
      throw new Error("Invalid route stop.");
  }
}
