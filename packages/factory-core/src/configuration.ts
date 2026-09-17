import type { GameCatalog } from "@satisfactory-belt/game-data";

import type { TransportRoute } from "./facilities";
import type { FactoryNode, ManufacturingNode } from "./index";
import { createConnectionIndex } from "./links";
import type { FactoryDocument } from "./links";
import { resolveSemanticPorts } from "./semantic-ports";

/** A candidate must preserve every existing link, including downstream mixed-material paths. */
export function canReplaceNode(
  document: FactoryDocument,
  candidate: FactoryNode,
  catalog: GameCatalog,
): boolean {
  return createConfigurationValidator(document, catalog)(candidate);
}

/** Reuse unchanged port metadata while a recipe/filter menu evaluates many candidates. */
export function createConfigurationValidator(document: FactoryDocument, catalog: GameCatalog) {
  const basePorts = document.nodes.flatMap((node) => resolveSemanticPorts(node, catalog));
  const ids = new Set(document.nodes.map((node) => node.id));
  return (candidate: FactoryNode): boolean => {
    try {
      if (!ids.has(candidate.id)) return false;
      const candidatePorts = resolveSemanticPorts(candidate, catalog);
      const ports = [
        ...basePorts.filter((port) => port.nodeId !== candidate.id),
        ...candidatePorts,
      ];
      const index = createConnectionIndex(ports, document.links);
      for (const link of document.links)
        if (!index.compatibility(link.output, link.input, true).compatible) return false;
      if (candidate.kind === "facility")
        validateFacilityReferences({
          ...document,
          nodes: document.nodes.map((node) => (node.id === candidate.id ? candidate : node)),
        });
      return true;
    } catch {
      return false;
    }
  };
}

export function validateFacilityReferences(document: FactoryDocument) {
  const nodes = new Map(document.nodes.map((n) => [n.id, n]));
  for (const node of document.nodes) {
    if (node.kind !== "facility") continue;
    const c = node.configuration;
    if (c.type === "truck-station" || c.type === "train-station") {
      if (
        c.routeId &&
        !document.routes?.some(
          (r) => r.id === c.routeId && r.kind === (c.type === "truck-station" ? "road" : "rail"),
        )
      )
        throw new Error("Incompatible transport route.");
    }
    if (c.type === "freight-platform" && c.stationId) {
      const station = nodes.get(c.stationId);
      if (station?.kind !== "facility" || station.configuration.type !== "train-station")
        throw new Error("Missing train station.");
      if (
        document.nodes.some(
          (other) =>
            other.id !== node.id &&
            other.kind === "facility" &&
            other.configuration.type === "freight-platform" &&
            other.configuration.stationId === c.stationId &&
            other.configuration.position === c.position,
        )
      )
        throw new Error("Platform position already occupied.");
    }
    if (c.type === "drone-port" && c.destinationId) {
      const destination = nodes.get(c.destinationId);
      if (
        destination?.kind !== "facility" ||
        destination.configuration.type !== "drone-port" ||
        destination.id === node.id
      )
        throw new Error("Invalid drone destination.");
      if (
        c.outgoingItemId &&
        destination.configuration.incomingItemId &&
        c.outgoingItemId !== destination.configuration.incomingItemId
      )
        throw new Error("Destination accepts a different cargo.");
      if (
        c.incomingItemId &&
        destination.configuration.outgoingItemId &&
        c.incomingItemId !== destination.configuration.outgoingItemId
      )
        throw new Error("Destination supplies a different cargo.");
    }
  }
}

export function clearRemovedReferences(nodes: readonly FactoryNode[]): readonly FactoryNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes.map((node) => {
    if (node.kind !== "facility") return node;
    const c = node.configuration;
    if (c.type === "freight-platform" && c.stationId && !ids.has(c.stationId))
      return { ...node, configuration: { ...c, stationId: null } };
    if (c.type === "drone-port" && c.destinationId && !ids.has(c.destinationId))
      return { ...node, configuration: { ...c, destinationId: null } };
    return node;
  });
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

export function validateTransportRoute(
  document: FactoryDocument,
  route: TransportRoute,
  catalog: GameCatalog,
) {
  if (
    !route.id ||
    !route.name.trim() ||
    !["road", "rail"].includes(route.kind) ||
    !Number.isSafeInteger(route.vehicleCount) ||
    route.vehicleCount < 1 ||
    route.vehicleCount > 10000 ||
    !Number.isFinite(route.roundTripSeconds) ||
    route.roundTripSeconds < 1 ||
    !Number.isFinite(route.fuelPerTrip) ||
    route.fuelPerTrip < 0
  )
    throw new Error("Invalid route settings.");
  if (
    route.fuelId &&
    (!catalog.items[route.fuelId] ||
      catalog.items[route.fuelId]!.form !== "solid" ||
      !catalog.items[route.fuelId]!.energyMegajoules)
  )
    throw new Error("Invalid vehicle fuel.");
  if (new Set(route.stops.map((stop) => stop.id)).size !== route.stops.length)
    throw new Error("Duplicate route stop.");
  for (const setting of route.stops) {
    const stop = document.nodes.find((node) => node.id === setting.nodeId);
    if (
      !setting.id ||
      !Number.isFinite(setting.waitSeconds) ||
      setting.waitSeconds < 0 ||
      setting.waitSeconds > 86400 ||
      [...setting.loadItemIds, ...setting.unloadItemIds].some((id) => !catalog.items[id])
    )
      throw new Error("Invalid stop settings.");
    if (
      stop?.kind !== "facility" ||
      stop.configuration.type !== (route.kind === "road" ? "truck-station" : "train-station")
    )
      throw new Error("Invalid route stop.");
  }
  validateFacilityReferences({
    ...document,
    routes: [...(document.routes ?? []).filter((existing) => existing.id !== route.id), route],
  });
}
