import {
  createNode,
  findBuildable,
  findDescriptor,
  type MaterialPort,
  type MaterialRate,
} from "@satisfactory-belt/production";

import { buildableImageUrl, descriptorImageUrl } from "@/game/catalog-images";

import type { CanvasNode } from "./document";

export type NodeCardPortStatus = "blocked" | "neutral" | "warning";

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
        status?: NodeCardPortStatus;
      }>
    >
  >;
}>;

export type NodeCardMaterial = Readonly<{
  connected: boolean;
  imageUrl?: string;
  itemName?: string;
  portId: string;
  rate: string;
  status: NodeCardPortStatus;
}>;

export type NodeCardModel = Readonly<{
  buildableImageUrl?: string;
  clock: string;
  efficiency: Readonly<{
    percent: string;
    status: NodeCardPortStatus;
  }>;
  inputs: readonly NodeCardMaterial[];
  outputs: readonly NodeCardMaterial[];
  power: string;
  subtitle: string;
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
  if (configuration.kind !== "process") return 100;
  const clocks = configuration.instances.map((instance) =>
    "clockSpeedPercent" in instance ? instance.clockSpeedPercent : 100,
  );
  return clocks.reduce((total, clock) => total + clock, 0) / clocks.length;
}

function runtimeMaterial(
  port: MaterialPort,
  rate: MaterialRate | undefined,
  runtime: NodeCardRuntime | undefined,
): NodeCardMaterial {
  const itemId = rate?.itemId ?? port.itemId;
  const item = itemId ? findDescriptor(itemId) : undefined;
  const state = runtime?.ports?.[port.id];
  return {
    connected: state?.connected ?? false,
    ...(itemId ? { imageUrl: descriptorImageUrl(itemId) } : {}),
    ...(item ? { itemName: item.name } : {}),
    portId: port.id,
    rate: rate ? formatNumber(rate.ratePerMinute) : "—",
    status: state?.status ?? "neutral",
  };
}

function calculatedMaterials(
  ports: readonly MaterialPort[],
  rates: readonly MaterialRate[],
  direction: "input" | "output",
  runtime: NodeCardRuntime | undefined,
) {
  return rates.map((rate) => {
    const port = ports.find(
      (candidate) =>
        candidate.direction === direction && candidate.itemId === rate.itemId,
    );
    return runtimeMaterial(
      port ?? {
        direction,
        forms: [],
        id: `${direction}:${rate.itemId}`,
        itemId: rate.itemId,
        medium: "conveyor",
      },
      rate,
      runtime,
    );
  });
}

function connectionDependentMaterials(
  ports: readonly MaterialPort[],
  runtime: NodeCardRuntime | undefined,
) {
  const inputs = ports
    .filter(({ direction }) => direction === "input")
    .map((port) => runtimeMaterial(port, undefined, runtime));
  const outputs = ports
    .filter(({ direction }) => direction === "output")
    .map((port) => runtimeMaterial(port, undefined, runtime));
  const bidirectional = ports.filter(
    ({ direction }) => direction === "bidirectional",
  );
  const splitAt = Math.ceil(bidirectional.length / 2);
  inputs.push(
    ...bidirectional
      .slice(0, splitAt)
      .map((port) => runtimeMaterial(port, undefined, runtime)),
  );
  outputs.push(
    ...bidirectional
      .slice(splitAt)
      .map((port) => runtimeMaterial(port, undefined, runtime)),
  );
  return { inputs, outputs };
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
          inputs: calculatedMaterials(
            node.ports,
            node.profile.materials.inputs,
            "input",
            runtime,
          ),
          outputs: calculatedMaterials(
            node.ports,
            node.profile.materials.outputs,
            "output",
            runtime,
          ),
        }
      : connectionDependentMaterials(node.ports, runtime);
  const power =
    node.profile.power.produced.maximumMw > 0
      ? node.profile.power.produced
      : node.profile.power.consumed;
  const efficiency = runtime?.efficiency ?? {
    percent: 100,
    status: "neutral" as const,
  };

  return {
    ...(buildableImageUrl(canvasNode.configuration.buildableId)
      ? {
          buildableImageUrl: buildableImageUrl(
            canvasNode.configuration.buildableId,
          ),
        }
      : {}),
    clock: `${formatNumber(averageClock(canvasNode.configuration))}%`,
    efficiency: {
      percent: `${formatNumber(efficiency.percent)}%`,
      status: efficiency.status,
    },
    inputs: materials.inputs.slice(0, 4),
    outputs: materials.outputs.slice(0, 2),
    power: formatPower(power),
    subtitle:
      node.kind === "process"
        ? `${node.configuration.instances.length}× ${buildable?.name ?? "Buildable"}`
        : (buildable?.name ?? canvasNode.label),
    title: node.kind === "process" ? node.process.name : canvasNode.label,
  };
}
