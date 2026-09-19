import { CANVAS_PALETTES } from "@satisfactory-belt/canvas-pixi/theme";
import {
  DEFAULT_SPLITTER_PROGRAM,
  MAX_SPLITTER_RULES,
  machineCapabilities,
  resolveFactoryNode,
  stationRoute,
  routeTopology,
  scopedMachines,
  DEPOT_SPEEDS,
} from "@satisfactory-belt/factory-core";
import type { FactoryNode } from "@satisfactory-belt/factory-core";
import { ZapIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { CatalogIcon } from "@/components/catalog-search-details";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";
const footerColors: CSSProperties & Record<`--${string}`, string> = {
  "--footer-color": CANVAS_PALETTES.light.footer,
  "--footer-color-dark": CANVAS_PALETTES.dark.footer,
  "--power-stroke": CANVAS_PALETTES.light.power.stroke,
  "--power-stroke-dark": CANVAS_PALETTES.dark.power.stroke,
  "--power-fill": CANVAS_PALETTES.light.power.fill,
  "--power-fill-dark": CANVAS_PALETTES.dark.power.fill,
  "--generation-stroke": CANVAS_PALETTES.light.generation.stroke,
  "--generation-stroke-dark": CANVAS_PALETTES.dark.generation.stroke,
  "--generation-fill": CANVAS_PALETTES.light.generation.fill,
  "--generation-fill-dark": CANVAS_PALETTES.dark.generation.fill,
};
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
  if (node.kind === "logistics") {
    if (assets.catalog.logistics[node.partId]!.kind !== "programmable-splitter") return null;
    const used = Object.values(node.program ?? DEFAULT_SPLITTER_PROGRAM).reduce(
      (sum, rules) => sum + rules.length,
      0,
    );
    return (
      <dl className="border-t pt-4 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Available program slots</dt>
          <dd className="tabular-nums">
            {MAX_SPLITTER_RULES - used}/{MAX_SPLITTER_RULES}
          </dd>
        </div>
      </dl>
    );
  }
  const members = scopedMachines(node, scope),
    capabilities = machineCapabilities(node, assets.catalog);
  const rows: { label: string; value: string; icon?: ReactNode; power?: boolean }[] = [];
  const itemIcon = (id: string) => (
    <CatalogIcon iconId={assets.catalog.items[id]!.iconId} assets={assets} size={16} />
  );
  if (capabilities.clock)
    rows.push({
      label: "Power Shards",
      icon: itemIcon("Desc_CrystalShard_C"),
      value: String(
        members.reduce((sum, m) => sum + Math.max(0, Math.ceil((m.clockPercent - 100) / 50)), 0),
      ),
    });
  const display = resolveFactoryNode({ ...node, machines: members }, assets.catalog);
  if (node.kind === "manufacturing" && capabilities.sloopSlots > 0) {
    const boost = assets.catalog.machines[node.machineId]!.productionBoost;
    const factors = members.map((m) => boost.base + m.sloopsUsed * boost.perSloop);
    rows.push({
      label: "Amplification",
      icon: itemIcon("Desc_WAT1_C"),
      value:
        Math.min(...factors) === Math.max(...factors)
          ? `${number.format(factors[0]!)}×`
          : `${number.format(Math.min(...factors))}–${number.format(Math.max(...factors))}×`,
    });
  }
  if (node.kind === "sink") {
    const rates =
      editor.getFlowAnalysis().status === "feasible"
        ? (editor.getFlowAnalysis().incoming.get(node.id) ?? [])
        : null;
    for (const counter of ["sinkPoints", "dnaPoints"] as const) {
      const relevant = (rates ?? []).filter(
        (rate) => (assets.catalog.items[rate.itemId]![counter] ?? 0) > 0,
      );
      if (relevant.length)
        rows.push({
          label:
            counter === "sinkPoints"
              ? `Estimated points/min${node.machines.length > 1 ? " (group)" : ""}`
              : `Estimated DNA points/min${node.machines.length > 1 ? " (group)" : ""}`,
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
    if (c.type === "drone-port") {
      const route = stationRoute(editor.history.getSnapshot().state, node);
      const closed = routeTopology(editor.history.getSnapshot().state, node.id).closed;
      for (const [direction, id] of [
        ["Outgoing", c.outgoingItemId],
        ["Incoming", c.incomingItemId],
      ] as const)
        if (id)
          rows.push({
            label: `${direction} cargo capacity`,
            value:
              closed && route
                ? `${number.format((9 * (assets.catalog.items[id]!.stackSize ?? 1) * 60 * route.vehicleCount) / route.roundTripSeconds)} items/min`
                : "Complete the route loop",
          });
    }
  }
  if (
    display.layout === "machine" &&
    !(node.kind === "facility" && node.configuration.type === "storage")
  ) {
    const generated =
      node.kind === "facility" && ["generator", "augmenter"].includes(node.configuration.type);
    rows.push({
      label: generated ? "Power generated" : scope === "all" ? "Total power" : "Power",
      power: true,
      value: display.powerLabel.replace(/ generated$/, ""),
      icon: generated ? (
        <ZapIcon className="size-4 text-[var(--generation-stroke)] fill-[var(--generation-fill)] dark:text-[var(--generation-stroke-dark)] dark:fill-[var(--generation-fill-dark)]" />
      ) : (
        <ZapIcon className="size-4 text-[var(--power-stroke)] fill-[var(--power-fill)] dark:text-[var(--power-stroke-dark)] dark:fill-[var(--power-fill-dark)]" />
      ),
    });
  }
  if (!rows.length) return null;
  return (
    <dl className="space-y-2 border-t pt-4 text-xs" style={footerColors}>
      {rows.map((row) => (
        <div
          key={row.label}
          className={`flex items-start justify-between gap-3 ${row.power ? "text-[var(--footer-color)] dark:text-[var(--footer-color-dark)]" : ""}`}
        >
          <dt className={`flex items-center gap-1.5 ${row.power ? "" : "text-muted-foreground"}`}>
            {row.icon}
            {row.label}
          </dt>
          <dd className="text-right tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
