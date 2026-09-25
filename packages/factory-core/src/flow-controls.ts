/* oxlint-disable oxc/no-map-spread -- Flow controls return immutable document values. */
import type { GameCatalog } from "@satisfactory-belt/game-data";

import {
  flowCapacityNode,
  flowMachineLimit,
  validateFlowSettings,
  isFlowGroup,
} from "./flow-sizing";
import type { FlowGroup } from "./flow-sizing";
import { resizeMachineGroup } from "./machine-settings";
import { resolveProduction } from "./production";

export type ProductionLimit =
  | { kind: "machines"; value: number }
  | { kind: "output"; itemId: string; value: number }
  | null;
export function productionLimit(node: FlowGroup): ProductionLimit {
  if (node.flow?.outputLimit)
    return {
      kind: "output",
      itemId: node.flow.outputLimit.itemId,
      value: node.flow.outputLimit.perMinute,
    };
  const target = Object.entries(node.flow?.targets ?? {})[0];
  if (target) return { kind: "output", itemId: target[0], value: target[1] };
  const count = flowMachineLimit(node);
  return count === undefined ? null : { kind: "machines", value: count };
}
export function withProductionLimit(
  node: FlowGroup,
  catalog: GameCatalog,
  limit: ProductionLimit,
): FlowGroup {
  const flow = {
    ...node.flow,
    clockMode: node.flow?.clockMode ?? ("auto" as const),
    machineLimit: limit?.kind === "machines" ? limit.value : null,
    targets: {},
    outputLimit:
      limit?.kind === "output" ? { itemId: limit.itemId, perMinute: limit.value } : undefined,
  };
  // A solved count/underclock is not an authored limit. Start unconstrained
  // groups from one configured machine; connected supply will size them again.
  const cleared = limit === null && productionLimit(node) !== null;
  const base = cleared && !flow.memberClocks ? resizeMachineGroup(node, 1, () => "limit") : node;
  const next = {
    ...node,
    flow: cleared ? { ...flow, utilization: 1 } : flow,
    machines: cleared
      ? base.machines.map((member) => ({
          ...member,
          clockPercent: flow.memberClocks?.[member.id] ?? flow.clockPercent ?? 100,
        }))
      : node.machines,
  };
  validateFlowSettings(next, catalog);
  // Ensure newly authored members inherit the previous member settings.
  return limit?.kind === "machines" ? flowCapacityNode(next) : next;
}
/** Converting units preserves the authored limit, not a temporarily constrained result. */
export function convertProductionLimit(
  node: FlowGroup,
  catalog: GameCatalog,
  unit: string,
): FlowGroup {
  const current = productionLimit(node);
  if (unit === "machines") {
    if (current?.kind === "machines") return node;
    const capacity = resolveProduction(
      {
        ...node,
        flow: { ...node.flow, utilization: 1 },
        machines: node.machines.map((m) => ({
          ...m,
          clockPercent: node.flow?.clockPercent ?? 100,
        })),
      },
      catalog,
    );
    const rate =
      current?.kind === "output"
        ? capacity.outputs.find((r) => r.itemId === current.itemId)?.perMinute
        : null;
    const count =
      rate && current
        ? Math.max(1, Math.ceil((current.value / rate) * node.machines.length - 1e-8))
        : node.machines.length;
    return withProductionLimit(node, catalog, { kind: "machines", value: count });
  }
  const actual = resolveProduction(node, catalog).outputs.find((r) => r.itemId === unit)?.perMinute;
  let value = actual;
  if (current?.kind === "machines")
    value = resolveProduction(flowCapacityNode(node), catalog).outputs.find(
      (r) => r.itemId === unit,
    )?.perMinute;
  if (current?.kind === "output") {
    const unitNode = {
      ...node,
      flow: { ...node.flow, utilization: 1 },
      machines: node.machines.map((m) => ({ ...m, clockPercent: 100 })),
    };
    const rates = resolveProduction(unitNode, catalog).outputs;
    const previous = rates.find((r) => r.itemId === current.itemId)?.perMinute;
    const next = rates.find((r) => r.itemId === unit)?.perMinute;
    value = previous && next ? (current.value * next) / previous : actual;
  }
  if (!value || value <= 0) {
    const single = resizeMachineGroup(node, 1, () => "limit");
    if (!isFlowGroup(single)) return node;
    value = resolveProduction(
      {
        ...single,
        flow: { ...node.flow, utilization: 1 },
        machines: single.machines.map((m) => ({ ...m, clockPercent: 100 })),
      },
      catalog,
    ).outputs.find((r) => r.itemId === unit)?.perMinute;
  }
  return value ? withProductionLimit(node, catalog, { kind: "output", itemId: unit, value }) : node;
}
