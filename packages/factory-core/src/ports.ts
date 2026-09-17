import { portId } from "@satisfactory-belt/canvas-core";
import type { PortCompatibility, PortReference } from "@satisfactory-belt/canvas-core";

import type { MaterialFilter } from "./splitters";
export type { PortReference } from "@satisfactory-belt/canvas-core";
export type PortTransport =
  | "belt"
  | "pipe"
  | "road-route"
  | "rail-route"
  | "drone-route"
  | "platform";
export const isMaterialTransport = (transport: PortTransport) =>
  transport === "belt" || transport === "pipe";

export type SemanticPort = PortReference &
  Readonly<{
    direction: "input" | "output";
    transport: PortTransport;
    /** Null is an unassigned logistics port: any solid item over a belt. */
    itemId: string | null;
    /** Sink acceptance and output filtering are derived from node configuration. */
    accepts?: ReadonlySet<string>;
    forwardsMaterials?: boolean;
    /** Fluid buffers accept a single fluid inferred from their connected network. */
    allowsUnknownFluid?: boolean;
    filter?: MaterialFilter;
  }>;
export function getPortCompatibility(
  a: SemanticPort | undefined,
  b: SemanticPort | undefined,
): PortCompatibility {
  if (!a || !b) return { compatible: false, reason: "missing-port" };
  if (a.nodeId === b.nodeId) return { compatible: false, reason: "same-node" };
  if (a.direction === b.direction) return { compatible: false, reason: "same-direction" };
  if (a.transport !== b.transport) return { compatible: false, reason: "different-transport" };
  const relationship = !isMaterialTransport(a.transport);
  const wildcard =
    relationship ||
    ((a.transport === "belt" || a.allowsUnknownFluid || b.allowsUnknownFluid) &&
      (a.itemId === null || b.itemId === null));
  if (!wildcard && (a.itemId === null || b.itemId === null || a.itemId !== b.itemId))
    return { compatible: false, reason: "different-material" };
  return {
    compatible: true,
    output: a.direction === "output" ? a : b,
    input: a.direction === "input" ? a : b,
  };
}
const key = (port: SemanticPort, direction = port.direction) =>
  JSON.stringify([port.itemId, port.transport, direction]);
export function createPortIndex(ports: readonly SemanticPort[]) {
  const byId = new Map(ports.map((port) => [portId(port), port]));
  const groups = new Map<string, SemanticPort[]>();
  const belts: Record<SemanticPort["direction"], SemanticPort[]> = { input: [], output: [] };
  for (const port of ports) {
    if (port.transport === "belt") belts[port.direction].push(port);
    const group = key(port);
    const entries = groups.get(group) ?? [];
    entries.push(port);
    groups.set(group, entries);
  }
  return {
    compatibility: (a: PortReference, b: PortReference) =>
      getPortCompatibility(byId.get(portId(a)), byId.get(portId(b))),
    targets: (ref: PortReference): readonly PortReference[] => {
      const port = byId.get(portId(ref));
      if (!port) return [];
      const opposite = port.direction === "input" ? "output" : "input";
      if (port.transport !== "belt")
        return ports.filter((candidate) => getPortCompatibility(port, candidate).compatible);
      const candidates =
        port.transport === "belt" && port.itemId === null
          ? belts[opposite]
          : [
              ...(groups.get(key(port, opposite)) ?? []),
              ...(port.transport === "belt"
                ? (groups.get(key({ ...port, itemId: null }, opposite)) ?? [])
                : []),
            ];
      return candidates.filter((candidate) => getPortCompatibility(port, candidate).compatible);
    },
  };
}
