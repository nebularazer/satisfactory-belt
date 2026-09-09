import {
  createNode,
  findBuildable,
  findDescriptor,
  findProductionProcess,
  type MaterialRate,
} from "@satisfactory-belt/production";
import type { CanvasDocument } from "./document";
import { presentMaterialLinks } from "./material-link-presentation";
import { productionStructure } from "./production-structure";

export const groupNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});
export type FlowRow = {
  itemId?: string;
  item: string;
  unit: string;
  rates: (number | undefined)[];
  destination: string;
  remainder: boolean;
};
export function rateExpression(
  rates: readonly (number | undefined)[],
  suffix = "",
) {
  const counts = new Map<number | undefined, number>();
  for (const rate of rates) {
    const key = rate === undefined ? undefined : Math.round(rate * 1e6) / 1e6;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(
      ([rate, count]) =>
        `${count > 1 ? `${count} × ` : ""}${rate === undefined ? "Unresolved" : `${groupNumber.format(rate)}${suffix}`}`,
    )
    .join(" + ");
}
export function flowTotal(rates: readonly (number | undefined)[]) {
  return rates.some((rate) => rate === undefined)
    ? undefined
    : (rates as number[]).reduce((sum, rate) => sum + rate, 0);
}

/** Boundary throughput excludes internal recirculation. Each connection is counted
 * once, even when it has multiple geometric segments. No inferred surplus is waste. */
export function summarizeGroup(
  document: CanvasDocument,
  group: { nodeIds: readonly string[]; destinationIds: readonly string[] },
) {
  const ids = new Set(group.nodeIds);
  const nodes = document.nodes.filter((node) => ids.has(node.configuration.id));
  const byId = new Map(
    document.nodes.map((node) => [node.configuration.id, node]),
  );
  const flows = new Map(
    presentMaterialLinks(document).map((flow) => [flow.id, flow]),
  );
  const incoming = document.materialLinks.filter(
    (link) => !ids.has(link.from.nodeId) && ids.has(link.to.nodeId),
  );
  const outgoing = document.materialLinks.filter(
    (link) => ids.has(link.from.nodeId) && !ids.has(link.to.nodeId),
  );
  const internal = document.materialLinks.filter(
    (link) => ids.has(link.from.nodeId) && ids.has(link.to.nodeId),
  );
  const feedbackIds = productionStructure(document).feedbackLinks;
  const feedback = internal.filter((link) => feedbackIds.has(link.id));
  function destinations(start: string) {
    const found = new Set<string>(),
      visited = new Set<string>(),
      pending = [start];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const config = byId.get(id)?.configuration;
      if (config?.kind === "process") found.add(config.processId);
      else
        for (const link of document.materialLinks)
          if (link.from.nodeId === id) pending.push(link.to.nodeId);
    }
    return [...found].sort();
  }
  function rows(links: typeof incoming, withDestinations = false): FlowRow[] {
    const rows = new Map<string, FlowRow>();
    for (const link of links) {
      const flow = flows.get(link.id)!;
      const targets = withDestinations ? destinations(link.to.nodeId) : [];
      const remainder =
        targets.length > 0 &&
        group.destinationIds.length > 0 &&
        targets.every((id) => !group.destinationIds.includes(id));
      const destination = targets
        .map((id) => findProductionProcess(id)?.name ?? id)
        .join(", ");
      const key = JSON.stringify([flow.itemId, flow.unit, destination]);
      const row = rows.get(key) ?? {
        ...(flow.itemId ? { itemId: flow.itemId } : {}),
        item: flow.itemName,
        unit: flow.itemId ? flow.unit : "",
        rates: [],
        destination,
        remainder,
      };
      row.rates.push(flow.ratePerMinute);
      rows.set(key, row);
    }
    return [...rows.values()].sort(
      (a, b) =>
        Number(a.remainder) - Number(b.remainder) ||
        a.item.localeCompare(b.item) ||
        a.destination.localeCompare(b.destination),
    );
  }
  const buildings = new Map<string, number>();
  const clocks: number[] = [];
  const power = {
    consumed: { minimumMw: 0, maximumMw: 0 },
    produced: { minimumMw: 0, maximumMw: 0 },
  };
  const configured = {
    inputs: [] as MaterialRate[],
    outputs: [] as MaterialRate[],
  };
  for (const node of nodes) {
    const model = createNode(node.configuration);
    const config = model.configuration;
    const name = findBuildable(config.buildableId)?.name ?? node.label;
    buildings.set(
      name,
      (buildings.get(name) ?? 0) +
        (config.kind === "process" ? config.instances.length : 1),
    );
    if (config.kind === "process")
      for (const instance of config.instances)
        if ("clockSpeedPercent" in instance)
          clocks.push(instance.clockSpeedPercent);
    for (const side of ["consumed", "produced"] as const)
      for (const end of ["minimumMw", "maximumMw"] as const)
        power[side][end] += model.profile.power[side][end];
    if (model.profile.materials.kind === "calculated")
      for (const side of ["inputs", "outputs"] as const)
        configured[side].push(...model.profile.materials[side]);
  }
  function configuredRows(rates: MaterialRate[]): FlowRow[] {
    const rows = new Map<string, FlowRow>();
    for (const rate of rates) {
      const item = findDescriptor(rate.itemId);
      const row = rows.get(rate.itemId) ?? {
        itemId: rate.itemId,
        item: item?.name ?? rate.itemId,
        unit: item?.form === "solid" ? "items/min" : "m³/min",
        rates: [],
        destination: "",
        remainder: false,
      };
      row.rates.push(rate.ratePerMinute);
      rows.set(rate.itemId, row);
    }
    return [...rows.values()];
  }
  const tiers = new Map<
    string,
    { name: string; incoming: number; internal: number; outgoing: number }
  >();
  for (const [scope, links] of Object.entries({
    incoming,
    internal,
    outgoing,
  }) as ["incoming" | "internal" | "outgoing", typeof incoming][])
    for (const link of links) {
      const tier = link.logistics;
      const name = tier
        ? `${tier.kind === "conveyor" ? "Belt" : "Pipe"} ${tier.tierId.replace(/^(conveyor|pipeline)-mk/, "Mk.")}`
        : "Unspecified tier";
      const row = tiers.get(name) ?? {
        name,
        incoming: 0,
        internal: 0,
        outgoing: 0,
      };
      row[scope]++;
      tiers.set(name, row);
    }
  return {
    recipes: [
      ...new Set(
        nodes.flatMap((node) =>
          node.configuration.kind === "process"
            ? [
                findProductionProcess(node.configuration.processId)?.name ??
                  node.label,
              ]
            : [],
        ),
      ),
    ],
    inputs: rows(incoming),
    outputs: rows(outgoing, true),
    outputTotals: rows(outgoing),
    feedback: rows(feedback),
    internalCount: internal.length,
    feedbackCount: feedback.length,
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    buildings: [...buildings].map(([name, count]) => ({ name, count })),
    clocks,
    power,
    consumption: configuredRows(configured.inputs),
    production: configuredRows(configured.outputs),
    tiers: [...tiers.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
