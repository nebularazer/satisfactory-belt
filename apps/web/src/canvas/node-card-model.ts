import {
  createNode,
  findBuffer,
  findBuildable,
  findDescriptor,
  type MaterialPort,
  type MaterialRate,
} from "@satisfactory-belt/production";

import {
  buildableImage,
  descriptorImage,
  type ResponsiveImage,
} from "@/game/catalog-images";

import type { CanvasNode } from "./document";

export type NodeCardPortStatus = "blocked" | "neutral" | "warning";
export type NodeCardPortDirection = "bidirectional" | "input" | "output";

export type NodeCardRuntime = Readonly<{
  efficiency?: Readonly<{
    percent: number;
    status: NodeCardPortStatus;
  }>;
  ports?: Readonly<
    Record<
      string,
      Readonly<{
        connected: boolean;
        direction?: "input" | "output";
        status?: NodeCardPortStatus;
      }>
    >
  >;
}>;

export type NodeCardPort = Readonly<{
  connected: boolean;
  direction: NodeCardPortDirection;
  image?: ResponsiveImage;
  itemName?: string;
  portId: string;
  rate?: string;
  ruleCount?: number;
  status: NodeCardPortStatus;
}>;

export type NodeCardModel = Readonly<{
  buildableImage?: ResponsiveImage;
  clock?: string;
  efficiency?: Readonly<{
    percent: string;
    status: NodeCardPortStatus;
  }>;
  leftPorts: readonly NodeCardPort[];
  power?: string;
  rightPorts: readonly NodeCardPort[];
  subtitle?: string;
  title: string;
}>;

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function formatNumber(value: number) {
  return numberFormatter.format(Math.abs(value) < 0.005 ? 0 : value);
}

function formatPower({
  maximumMw,
  minimumMw,
}: Readonly<{ maximumMw: number; minimumMw: number }>) {
  return minimumMw === maximumMw
    ? `${formatNumber(minimumMw)} MW`
    : `${formatNumber(minimumMw)}–${formatNumber(maximumMw)} MW`;
}

function averageClock(configuration: CanvasNode["configuration"]) {
  if (configuration.kind !== "process") return undefined;
  const clocks = configuration.instances.flatMap((instance) =>
    "clockSpeedPercent" in instance ? [instance.clockSpeedPercent] : [],
  );
  if (clocks.length === 0) return undefined;
  return clocks.reduce((total, clock) => total + clock, 0) / clocks.length;
}

function runtimePort(
  port: MaterialPort,
  rate: MaterialRate | undefined,
  runtime: NodeCardRuntime | undefined,
): NodeCardPort {
  const itemId = rate?.itemId ?? port.itemId;
  const item = itemId ? findDescriptor(itemId) : undefined;
  const state = runtime?.ports?.[port.id];
  return {
    connected: state?.connected ?? false,
    direction:
      port.direction === "bidirectional"
        ? (state?.direction ?? "bidirectional")
        : port.direction,
    ...(itemId ? { image: descriptorImage(itemId) } : {}),
    ...(item ? { itemName: item.name } : {}),
    portId: port.id,
    ...(rate ? { rate: formatNumber(rate.ratePerMinute) } : {}),
    status: state?.status ?? "neutral",
  };
}

function calculatedPorts(
  ports: readonly MaterialPort[],
  rates: readonly MaterialRate[],
  direction: "input" | "output",
  order: readonly string[] | undefined,
  runtime: NodeCardRuntime | undefined,
) {
  const directionPorts = ports.filter((port) => port.direction === direction);
  const rank = new Map(order?.map((portId, index) => [portId, index]));
  return directionPorts
    .toSorted(
      (left, right) =>
        (rank.get(left.id) ?? directionPorts.length) -
        (rank.get(right.id) ?? directionPorts.length),
    )
    .map((port) =>
      runtimePort(
        port,
        rates.find(({ itemId }) => itemId === port.itemId),
        runtime,
      ),
    );
}

function connectionDependentPorts(
  ports: readonly MaterialPort[],
  routerRules: CanvasNode["routerRules"],
  runtime: NodeCardRuntime | undefined,
) {
  const cardPort = (port: MaterialPort): NodeCardPort => {
    const rules = routerRules?.[port.id] ?? [];
    if (rules.length > 1) {
      return {
        ...runtimePort(port, undefined, runtime),
        itemName: `${rules.length} routing rules`,
        ruleCount: rules.length,
      };
    }
    const itemId = rules.find((rule) => findDescriptor(rule));
    return runtimePort(itemId ? { ...port, itemId } : port, undefined, runtime);
  };
  const leftPorts = ports
    .filter(({ direction }) => direction === "input")
    .map(cardPort);
  const rightPorts = ports
    .filter(({ direction }) => direction === "output")
    .map(cardPort);
  const bidirectional = ports.filter(
    ({ direction }) => direction === "bidirectional",
  );
  const splitAt = Math.ceil(bidirectional.length / 2);
  leftPorts.push(...bidirectional.slice(0, splitAt).map(cardPort));
  rightPorts.push(...bidirectional.slice(splitAt).map(cardPort));
  return { leftPorts, rightPorts };
}

function powerMetric(profile: ReturnType<typeof createNode>["profile"]) {
  return profile.power.consumed.maximumMw > 0
    ? formatPower(profile.power.consumed)
    : undefined;
}

function materialNodeSubtitle(canvasNode: CanvasNode) {
  if (canvasNode.configuration.kind === "transport") {
    return canvasNode.configuration.mode === "load" ? "Load" : "Unload";
  }
  if (canvasNode.configuration.kind !== "buffer") return undefined;

  const capacity = findBuffer(canvasNode.configuration.buildableId)?.capacity;
  if (!capacity) return undefined;
  return capacity.type === "inventory"
    ? `${formatNumber(capacity.slots)} slots`
    : `${formatNumber(capacity.cubicMetres)} m³`;
}

function materialNodeTitle(canvasNode: CanvasNode) {
  if (canvasNode.configuration.kind === "transport") {
    return canvasNode.label.replace(/\s+\((?:Load|Unload)\)$/, "");
  }
  if (canvasNode.configuration.kind === "router") {
    return canvasNode.label.replace(/^Conveyor\s+/, "");
  }
  return canvasNode.label;
}

export function createNodeCardModel(
  canvasNode: CanvasNode,
  runtime?: NodeCardRuntime,
): NodeCardModel {
  const node = createNode(canvasNode.configuration);
  const buildable = findBuildable(canvasNode.configuration.buildableId);
  const materials =
    node.profile.materials.kind === "calculated"
      ? {
          leftPorts: calculatedPorts(
            node.ports,
            node.profile.materials.inputs,
            "input",
            canvasNode.portOrder?.input,
            runtime,
          ),
          rightPorts: calculatedPorts(
            node.ports,
            node.profile.materials.outputs,
            "output",
            canvasNode.portOrder?.output,
            runtime,
          ),
        }
      : connectionDependentPorts(node.ports, canvasNode.routerRules, runtime);
  const clock = averageClock(canvasNode.configuration);
  const efficiency =
    node.kind === "process"
      ? (runtime?.efficiency ?? {
          percent: undefined,
          status: "neutral" as const,
        })
      : undefined;
  const image = buildableImage(canvasNode.configuration.buildableId);
  const power = powerMetric(node.profile);
  const subtitle =
    node.kind === "process"
      ? `${node.configuration.instances.length}× ${buildable?.name ?? "Buildable"}`
      : materialNodeSubtitle(canvasNode);

  return {
    ...(image ? { buildableImage: image } : {}),
    ...(clock === undefined ? {} : { clock: `${formatNumber(clock)}%` }),
    ...(efficiency
      ? {
          efficiency: {
            percent:
              efficiency.percent === undefined
                ? "—"
                : `${formatNumber(efficiency.percent)}%`,
            status: efficiency.status,
          },
        }
      : {}),
    leftPorts: materials.leftPorts,
    ...(power ? { power } : {}),
    rightPorts: materials.rightPorts,
    ...(subtitle ? { subtitle } : {}),
    title:
      node.kind === "process"
        ? node.process.name
        : materialNodeTitle(canvasNode),
  };
}
