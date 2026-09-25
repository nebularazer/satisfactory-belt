import { GRID_SIZE } from "@satisfactory-belt/canvas-core";
import type { CanvasItem } from "@satisfactory-belt/canvas-core";
import type { GameCatalog, Ingredient } from "@satisfactory-belt/game-data";

import { resolveFacility, trainStationHeight } from "./facilities";
import type { FacilityNode, Purity } from "./facilities";
import { productionLimit } from "./flow-controls";
import { commonSetting, validateMachineMembers } from "./machine-settings";
import { formatPlanningNumber } from "./number-format";
import type { PortTransport } from "./ports";
import { DEFAULT_SPLITTER_PROGRAM, SPLITTER_OUTPUTS, validateSplitterProgram } from "./splitters";
import type { SplitterProgram } from "./splitters";
import { validateSink } from "./validation";

export const NODE_SIZE = 8 * GRID_SIZE;
export const LOGISTICS_NODE_SIZE = 4 * GRID_SIZE;
export const HEADER_HEIGHT = 2 * GRID_SIZE;
export const FOOTER_Y = 7 * GRID_SIZE;
export const PORT_RADIUS = 7;
export const FUEL_PORT_RADIUS = PORT_RADIUS;
export const PIPE_PORT_RADIUS = 9;
export const SLOOP_ITEM_ID = "Desc_WAT1_C";

export type MachineMember = Readonly<{
  id: string;
  clockPercent: number;
  sloopsUsed: number;
  purity?: Purity;
  loadPercent?: number;
  suppliedMatrices?: boolean;
  impureSatellites?: number;
  normalSatellites?: number;
  pureSatellites?: number;
}>;
type NodeBase = Readonly<{
  id: string;
  x: number;
  y: number;
  machines: readonly MachineMember[];
}>;
export type ManufacturingNode = NodeBase &
  Readonly<{
    kind: "manufacturing";
    machineId: string;
    recipeId: string;
    flow?: import("./flow-sizing").FlowSettings;
  }>;
export type FactoryNode =
  | ManufacturingNode
  | FacilityNode
  | LogisticsNode
  | (NodeBase &
      Readonly<{
        kind: "sink";
        sinkId: string;
      }>)
  | (NodeBase &
      Readonly<{
        kind: "extractor";
        extractorId: string;
        resourceId: string;
        flow?: import("./flow-sizing").FlowSettings;
      }>)
  | (NodeBase &
      Readonly<{
        kind: "fixed-producer";
        producerId: string;
      }>);

export type LogisticsNode = Readonly<{
  kind: "logistics";
  id: string;
  x: number;
  y: number;
  partId: string;
  program?: SplitterProgram;
}>;

export type PortDisplay = Readonly<{
  key: string;
  direction: "input" | "output";
  transport: PortTransport;
  purpose?: "fuel";
  /** Authored output limit; never inferred from machine capacity. */
  outputLimitLabel?: string;
  disabled?: boolean;
  itemId: string | null;
  name: string;
  iconId: string | null;
  x: number;
  y: number;
}>;
export type PowerDisplay =
  | Readonly<{ kind: "known"; megawatts: number }>
  | Readonly<{ kind: "unknown" }>
  | Readonly<{ kind: "variable" }>
  | Readonly<{
      kind: "range";
      minMegawatts: number;
      maxMegawatts: number;
      averageMegawatts: number;
    }>;
export type MachineDisplay = Readonly<{
  layout: "machine";
  size: number;
  height?: number;
  bodyRows?: readonly Readonly<{ y: number; label: string }>[];
  title: string;
  subtitle: string;
  subtitleTooltip?: string;
  machineIconId: string;
  ports: readonly PortDisplay[];
  power: PowerDisplay;
  powerLabel: string;
  clockLabel: string | null;
  footer?: Readonly<{ kind: "storage" | "fluid" | "generation"; label: string }>;
  sloops: Readonly<{ used: number | null; slots: number; iconId: string }> | null;
}>;
export type LogisticsDisplay = Readonly<{
  layout: "logistics";
  size: number;
  title: string;
  machineIconId: string;
  ports: readonly (Omit<PortDisplay, "itemId" | "iconId"> & {
    itemId: null;
    iconId: null;
    /** Explicit filter choices, not evidence of incoming material flow. */
    configuredItemIconIds: readonly string[];
  })[];
}>;
export type NodeDisplay = MachineDisplay | LogisticsDisplay;

/** Both columns start on the same row, with one grid cell between ports. */
export function portRows(count: number): readonly number[] {
  if (!Number.isInteger(count) || count < 0 || count > 4)
    throw new Error(`Expected zero to four ports, received ${count}.`);
  return Array.from({ length: count }, (_, index) => HEADER_HEIGHT + (index + 1) * GRID_SIZE);
}

export function nodeBounds(node: FactoryNode): CanvasItem {
  const size = node.kind === "logistics" ? LOGISTICS_NODE_SIZE : NODE_SIZE;
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    width: size,
    height:
      node.kind === "facility" && node.configuration.type === "train-station"
        ? trainStationHeight(node.configuration.platforms)
        : size,
  };
}

export function resolveFactoryNode(node: FactoryNode, catalog: GameCatalog): NodeDisplay {
  if (node.kind !== "logistics") return resolveMachineNode(node, catalog);
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y))
    throw new Error(`Invalid position on ${node.id}.`);
  const part = catalog.logistics[node.partId];
  if (!part) throw new Error(`Missing logistics part ${node.partId}.`);
  validateSplitterProgram(part.kind, node.program, catalog);
  const program =
    part.kind === "smart-splitter" || part.kind === "programmable-splitter"
      ? (node.program ?? DEFAULT_SPLITTER_PROGRAM)
      : undefined;
  const ports: LogisticsDisplay["ports"][number][] = [];
  for (const direction of ["input", "output"] as const) {
    const count = (part.kind !== "merger") === (direction === "output") ? 3 : 1;
    for (let slot = 0; slot < count; slot++) {
      const rules = direction === "output" ? program?.[SPLITTER_OUTPUTS[slot]!] : undefined;
      ports.push({
        key: `${direction}:${slot}`,
        direction,
        transport: "belt",
        itemId: null,
        iconId: null,
        disabled: rules?.every((rule) => rule.kind === "none") ?? false,
        configuredItemIconIds:
          rules?.flatMap((rule) =>
            rule.kind === "item" ? [catalog.items[rule.itemId]!.iconId] : [],
          ) ?? [],
        name:
          direction === "output" && part.kind !== "merger"
            ? `${["Left", "Center", "Right"][slot]} output`
            : `${direction === "input" ? "Input" : "Output"} ${slot + 1}`,
        x: direction === "input" ? 0 : LOGISTICS_NODE_SIZE,
        y: LOGISTICS_NODE_SIZE / 2 + (slot - (count - 1) / 2) * GRID_SIZE,
      });
    }
  }
  return {
    layout: "logistics",
    size: LOGISTICS_NODE_SIZE,
    title: part.name,
    machineIconId: part.iconId,
    ports,
  };
}

const numberLabel = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
export function formatPower(power: PowerDisplay): string {
  if (power.kind === "range")
    return `${numberLabel.format(power.minMegawatts)}–${numberLabel.format(power.maxMegawatts)} MW (${numberLabel.format(power.averageMegawatts)} avg)`;
  if (power.kind === "unknown") return "— MW";
  if (power.kind === "variable") return "Variable";
  // Keep the unit explicit and bound unusually large totals without losing it to ellipsis.
  const value =
    power.megawatts >= 10000
      ? power.megawatts.toExponential(1)
      : numberLabel.format(power.megawatts);
  return `${value} MW`;
}

export function resolveMachineNode(
  node: Exclude<FactoryNode, LogisticsNode>,
  catalog: GameCatalog,
): MachineDisplay {
  validateMachineMembers(node, catalog);
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y))
    throw new Error(`Invalid position on ${node.id}.`);
  if (node.kind === "facility") return resolveFacility(node, catalog);
  const utilization =
    (node.kind === "manufacturing" || node.kind === "extractor") &&
    node.flow?.clockMode === "manual"
      ? (node.flow.utilization ?? 1)
      : 1;
  // Manual clocks retain configured members; utilization expresses how many
  // machine-equivalents are producing. Auto clocks already express their load.
  const usedMachines =
    node.machines.filter((member) => member.clockPercent > 0).length * utilization;
  const limit =
    node.kind === "manufacturing" || node.kind === "extractor" ? productionLimit(node) : null;
  const configuredCount = limit?.kind === "machines" ? limit.value : null;
  const machineCountLabel =
    configuredCount === null
      ? formatPlanningNumber(usedMachines)
      : `${formatPlanningNumber(usedMachines)} / ${configuredCount}`;
  const subtitleTooltip =
    configuredCount === null
      ? undefined
      : `${formatPlanningNumber(usedMachines)} ${usedMachines > 0 && usedMachines <= 1 + 1e-7 ? "machine" : "machines"} used · ${configuredCount} ${configuredCount === 1 ? "machine" : "machines"} configured`;
  const clock = commonSetting(node.machines, "clockPercent");
  const sloops = commonSetting(node.machines, "sloopsUsed");
  const clockLabel = clock === null ? "Mixed" : `${formatPlanningNumber(clock)}%`;
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y))
    throw new Error(`Invalid position on ${node.id}.`);
  function ports(
    entries: readonly Ingredient[],
    direction: PortDisplay["direction"],
  ): PortDisplay[] {
    const rows = portRows(entries.length);
    return entries.map(({ itemId }, index) => {
      const item = catalog.items[itemId];
      if (!item) throw new Error(`Missing item ${itemId}.`);
      return {
        key: `${direction}:${itemId}`,
        direction,
        transport: item.form === "solid" ? "belt" : "pipe",
        itemId,
        name: item.name,
        outputLimitLabel:
          direction === "output" && limit?.kind === "output" && limit.itemId === itemId
            ? formatPlanningNumber(limit.value)
            : undefined,
        iconId: item.iconId,
        x: direction === "input" ? 0 : NODE_SIZE,
        y: rows[index]!,
      };
    });
  }
  if (node.kind === "sink") {
    validateSink(node);
    const sink = catalog.sinks[node.sinkId];
    if (!sink) throw new Error(`Missing AWESOME Sink ${node.sinkId}.`);
    const power: PowerDisplay = {
      kind: "known",
      megawatts: node.machines.length * sink.powerMegawatts,
    };
    return {
      layout: "machine",
      size: NODE_SIZE,
      title: sink.name,
      subtitle: `${node.machines.length}× ${sink.name}`,
      machineIconId: sink.iconId,
      ports: [
        {
          key: "input:0",
          direction: "input",
          transport: "belt",
          itemId: null,
          iconId: null,
          name: "Sinkable materials",
          x: 0,
          y: portRows(1)[0]!,
        },
      ],
      power,
      powerLabel: formatPower(power),
      clockLabel: null,
      sloops: null,
    };
  }
  if (node.kind === "extractor") {
    const extractor = catalog.extractors[node.extractorId];
    if (!extractor) throw new Error(`Missing extractor ${node.extractorId}.`);
    if (!extractor.resourceIds.includes(node.resourceId))
      throw new Error(`Resource ${node.resourceId} is incompatible with ${extractor.id}.`);
    const output = ports([{ itemId: node.resourceId, amount: 1 }], "output");
    const power: PowerDisplay = {
      kind: "known",
      megawatts: node.machines.reduce(
        (sum, member) =>
          sum +
          utilization *
            extractor.powerMegawatts *
            (member.clockPercent / 100) ** extractor.powerConsumptionExponent,
        0,
      ),
    };
    return {
      layout: "machine",
      size: NODE_SIZE,
      title: output[0]!.name,
      subtitle: `${machineCountLabel}× ${extractor.name}`,
      subtitleTooltip,
      machineIconId: extractor.iconId,
      ports: output,
      power,
      powerLabel: formatPower(power),
      clockLabel: extractor.canOverclock ? clockLabel : null,
      sloops: null,
    };
  }
  if (node.kind === "fixed-producer") {
    const producer = catalog.fixedProducers[node.producerId];
    if (!producer) throw new Error(`Missing producer ${node.producerId}.`);
    const power: PowerDisplay = {
      kind: "known",
      megawatts: node.machines.length * producer.powerMegawatts,
    };
    return {
      layout: "machine",
      size: NODE_SIZE,
      title: producer.name,
      subtitle: `${node.machines.length}× ${producer.name}`,
      machineIconId: producer.iconId,
      ports: ports(producer.products, "output"),
      power,
      powerLabel: formatPower(power),
      clockLabel: producer.canOverclock ? "100%" : null,
      sloops: null,
    };
  }
  const machine = catalog.machines[node.machineId];
  const recipe = catalog.recipes[node.recipeId];
  if (!machine || !recipe) throw new Error(`Missing machine or recipe on ${node.id}.`);
  if (!recipe.machineIds.includes(machine.id))
    throw new Error(`Recipe ${recipe.id} is incompatible with ${machine.id}.`);
  const power: PowerDisplay =
    machine.power.kind === "variable"
      ? {
          kind: "range",
          ...(() => {
            const factor = node.machines.reduce(
              (sum, member) =>
                sum +
                utilization *
                  (member.clockPercent / 100) ** machine.powerConsumptionExponent *
                  (machine.productionBoost.base +
                    member.sloopsUsed * machine.productionBoost.perSloop) **
                    machine.productionBoost.powerExponent,
              0,
            );
            const min = recipe.variablePower.constantMegawatts * factor;
            const max =
              (recipe.variablePower.constantMegawatts + recipe.variablePower.factorMegawatts) *
              factor;
            return { minMegawatts: min, maxMegawatts: max, averageMegawatts: (min + max) / 2 };
          })(),
        }
      : {
          kind: "known",
          megawatts: node.machines.reduce(
            (sum, member) =>
              sum +
              (machine.power.kind === "fixed" ? machine.power.megawatts : 0) *
                utilization *
                (member.clockPercent / 100) ** machine.powerConsumptionExponent *
                (machine.productionBoost.base +
                  member.sloopsUsed * machine.productionBoost.perSloop) **
                  machine.productionBoost.powerExponent,
            0,
          ),
        };
  const sloopIcon = catalog.items[SLOOP_ITEM_ID]?.iconId;
  if (machine.sloopSlots > 0 && !sloopIcon) throw new Error("Missing Somersloop item icon.");
  return {
    layout: "machine",
    size: NODE_SIZE,
    title: recipe.alternate ? recipe.name.replace(/^Alternate:\s*/i, "") : recipe.name,
    subtitle: `${machineCountLabel}× ${machine.name}`,
    subtitleTooltip,
    machineIconId: machine.iconId,
    ports: [...ports(recipe.ingredients, "input"), ...ports(recipe.products, "output")],
    power,
    powerLabel: formatPower(power),
    clockLabel: machine.canOverclock ? clockLabel : null,
    sloops:
      machine.sloopSlots > 0
        ? { used: sloops, slots: machine.sloopSlots, iconId: sloopIcon! }
        : null,
  };
}
export * from "./ports";
export * from "./links";

export * from "./splitters";
export * from "./semantic-ports";

export * from "./placement";

export * from "./machine-settings";
export * from "./production";

export * from "./facilities";

export * from "./configuration";

export * from "./clipboard";

export * from "./transport";

export { settingsKey } from "./settings";

export * from "./flow-plan";
export * from "./validation";

export * from "./flow-placement";

export * from "./flow-sizing";

export { formatPlanningNumber } from "./number-format";

export * from "./flow-controls";
