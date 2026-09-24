import type { PortReference } from "@satisfactory-belt/canvas-core";
import { portId } from "@satisfactory-belt/canvas-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";

import { prepareFlowPlan } from "./flow-plan";
import type { FactoryNode } from "./index";
import type { FactoryDocument, MaterialLink } from "./links";
import { createMachineMembers, MAX_MACHINE_COUNT } from "./machine-settings";
import { resolveProduction } from "./production";

/** Size only the newly placed group, using the anchor's remaining configured rate. */
export function sizeFlowPlacement(
  document: FactoryDocument,
  catalog: GameCatalog,
  source: PortReference,
  node: FactoryNode,
  connection: Pick<MaterialLink, "input" | "output">,
): FactoryNode {
  if (node.kind !== "manufacturing" && node.kind !== "extractor") return node;
  const anchor = document.nodes.find((entry) => entry.id === source.nodeId);
  if (!anchor) return node;
  const plan = prepareFlowPlan(document, catalog);
  const port = plan.ports(source.nodeId).find((entry) => entry.portKey === source.portKey);
  if (!port?.itemId) return node;
  const production = resolveProduction(anchor, catalog);
  const configured = (port.direction === "input" ? production.inputs : production.outputs).find(
    (entry) => entry.itemId === port.itemId,
  )?.perMinute;
  const direction = connection.input.nodeId === node.id ? "input" : "output";
  if (configured == null || configured <= 0) return node;
  const allocated =
    plan
      .analyze()
      .requiredPorts.get(portId(source))
      ?.find((entry) => entry.itemId === port.itemId)?.perMinute ?? 0;
  const target = configured - allocated;
  // No known remainder: retain ordinary editable placement defaults.
  return sizeProductionGroup(node, catalog, port.itemId, target, direction);
}

export function sizeProductionGroup(
  node: Extract<FactoryNode, { kind: "manufacturing" | "extractor" }>,
  catalog: GameCatalog,
  itemId: string,
  target: number,
  direction: "input" | "output" = "output",
): typeof node {
  if (!Number.isFinite(target) || target <= 1e-8) return node;
  const settings = { ...node.machines[0]!, clockPercent: 100 };
  const unit = { ...node, machines: [settings] };
  const perMachine = resolveProduction(unit, catalog)[
    direction === "input" ? "inputs" : "outputs"
  ].find((entry) => entry.itemId === itemId)?.perMinute;
  if (perMachine == null || perMachine <= 0) return node;
  const equivalent = target / perMachine;
  const count = Math.max(1, Math.ceil(equivalent - Math.max(1, equivalent) * 1e-10));
  if (count > MAX_MACHINE_COUNT) return node;
  const canClock =
    node.kind === "manufacturing"
      ? catalog.machines[node.machineId]!.canOverclock
      : catalog.extractors[node.extractorId]!.canOverclock;
  const clockPercent = canClock ? Math.max(1, Math.min(100, (equivalent / count) * 100)) : 100;
  if (
    node.machines.length === count &&
    node.machines.every((m) => Math.abs(m.clockPercent - clockPercent) < 1e-8)
  )
    return node;
  return {
    ...node,
    machines: createMachineMembers(
      count,
      {
        clockPercent,
        sloopsUsed: settings.sloopsUsed,
        ...(node.kind === "extractor" ? { purity: settings.purity } : {}),
      },
      (i) => node.machines[i]?.id ?? `auto-${i + 1}`,
    ),
  };
}
