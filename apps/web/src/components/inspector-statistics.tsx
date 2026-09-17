import {
  machineCapabilities,
  scopedMachines,
  DEPOT_SPEEDS,
  configuredIncomingRates,
} from "@satisfactory-belt/factory-core";
import type { FactoryNode } from "@satisfactory-belt/factory-core";

import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";
const number = new Intl.NumberFormat("en", { maximumFractionDigits: 3 });
export function InspectorStatistics({
  node,
  scope,
  editor,
  assets,
}: {
  node: FactoryNode;
  scope: string;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  if (node.kind === "logistics") return null;
  const members = scopedMachines(node, scope),
    capabilities = machineCapabilities(node, assets.catalog);
  const rows: { label: string; value: string }[] = [];
  if (capabilities.clock)
    rows.push({
      label: "Power Shards",
      value: String(
        members.reduce((sum, m) => sum + Math.max(0, Math.ceil((m.clockPercent - 100) / 50)), 0),
      ),
    });
  if (node.kind === "manufacturing" && capabilities.sloopSlots > 0) {
    const boost = assets.catalog.machines[node.machineId]!.productionBoost;
    const factors = members.map((m) => boost.base + m.sloopsUsed * boost.perSloop);
    rows.push({
      label: "Amplification",
      value:
        Math.min(...factors) === Math.max(...factors)
          ? `${number.format(factors[0]!)}×`
          : `${number.format(Math.min(...factors))}–${number.format(Math.max(...factors))}×`,
    });
  }
  if (node.kind === "sink") {
    const rates = configuredIncomingRates(
      editor.history.getSnapshot().state,
      assets.catalog,
      node.id,
    );
    for (const counter of ["sinkPoints", "dnaPoints"] as const) {
      const relevant = rates.filter(
        (rate) => (assets.catalog.items[rate.itemId]![counter] ?? 0) > 0,
      );
      if (relevant.length)
        rows.push({
          label:
            counter === "sinkPoints"
              ? "Group configured points/min"
              : "Group configured DNA points/min",
          value: relevant.some((rate) => rate.perMinute === null)
            ? "Unresolved flow"
            : number.format(
                relevant.reduce(
                  (sum, rate) =>
                    sum + rate.perMinute! * assets.catalog.items[rate.itemId]![counter]!,
                  0,
                ),
              ),
        });
    }
    const ids = [...editor.getMaterials({ nodeId: node.id, portKey: "input:0" })];
    for (const id of ids) {
      const item = assets.catalog.items[id]!;
      rows.push({
        label: `${item.name} points/item`,
        value: `${number.format(item.dnaPoints || item.sinkPoints || 0)}${item.dnaPoints ? " DNA" : ""}`,
      });
    }
  }
  if (node.kind === "facility") {
    const c = node.configuration,
      b = assets.catalog.buildings![node.buildingId]!;
    if (c.type === "storage")
      rows.push({
        label: "Storage capacity",
        value: `${number.format(b.capacity * members.length)} ${b.transport === "pipe" ? "m³" : "slots"}`,
      });
    if (c.type === "depot")
      rows.push({
        label: "Upload capacity",
        value: `${DEPOT_SPEEDS[editor.history.getSnapshot().state.depotResearch?.speedLevel ?? 0]! * members.length} items/min`,
      });
    if (c.type === "augmenter")
      rows.push({
        label: "Power boost contribution",
        value: `+${members.reduce((sum, m) => sum + (m.suppliedMatrices ? 30 : 10), 0)}%`,
      });
    if (c.type === "drone-port" && c.hasDrone) {
      for (const [direction, id] of [
        ["Outgoing", c.outgoingItemId],
        ["Incoming", c.incomingItemId],
      ] as const)
        if (id)
          rows.push({
            label: `${direction} cargo capacity`,
            value: `${number.format((9 * (assets.catalog.items[id]!.stackSize ?? 1) * 60) / c.roundTripSeconds)} items/min`,
          });
    }
  }
  if (!rows.length) return null;
  return (
    <dl className="space-y-2 border-t pt-3 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-right tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
