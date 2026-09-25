/** Adapter for the throwaway distribution preview. Never edits the source document. */
import { CanvasController, GRID_SIZE, portId } from "@satisfactory-belt/canvas-core";
import type { CanvasItem, CanvasLink, Point, PortReference } from "@satisfactory-belt/canvas-core";
import {
  PREVIEW_BELTS,
  buildDistributionPrototype,
  formatPlanningNumber,
  resolveProduction,
} from "@satisfactory-belt/factory-core";
import type { NodeDisplay, DistributionPreview } from "@satisfactory-belt/factory-core";
import type { ElkNode } from "elkjs/lib/elk-api";

import type { createFactoryEditor } from "./factory-editor";
import type { GameAssets } from "./game-assets";

export const PREVIEW_BELT_COLORS = [
  0x2563eb, 0xd97706, 0x059669, 0x9333ea, 0xe11d48, 0x0891b2,
] as const;
const grid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

/** Keep ELK's reserved label location on the final snapped route. */
function labelOnRoute(position: Point, points: readonly Point[]): Point {
  let closest = points[0]!;
  let distance = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    const candidate = {
      x: Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), position.x)),
      y: Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), position.y)),
    };
    const nextDistance = Math.hypot(candidate.x - position.x, candidate.y - position.y);
    if (nextDistance < distance) {
      closest = candidate;
      distance = nextDistance;
    }
  }
  return closest;
}

type Endpoint = {
  id: string;
  rate: number;
  title: string;
  groupKey: string;
  type: string;
  icon: string;
  sink: boolean;
};
export type DistributionSnapshot = {
  itemId: string;
  sources: Endpoint[];
  destinations: Endpoint[];
  error?: string;
};

/** Substitute incoming belts only in the preview; the source plan stays untouched. */
export function distributionBeltSupply(
  snapshot: DistributionSnapshot,
  rates: readonly number[],
  tier: number,
  icon: string,
): DistributionSnapshot {
  const demand = snapshot.destinations.reduce((sum, entry) => sum + entry.rate, 0);
  const supply = rates.reduce((sum, rate) => sum + rate, 0);
  const capacity = PREVIEW_BELTS[tier - 1] ?? 0;
  let error = snapshot.error;
  if (!error) {
    if (!rates.length || rates.some((rate) => !Number.isFinite(rate) || rate <= 0))
      error = "Enter a positive rate for every incoming belt.";
    else if (rates.some((rate) => rate > capacity + 0.00001))
      error = `Each incoming belt must fit Mk.${tier} (${capacity}/min).`;
    else if (Math.abs(supply - demand) > 0.00001)
      error =
        supply < demand
          ? `${formatPlanningNumber(demand - supply)}/min more supply needed.`
          : `${formatPlanningNumber(supply - demand)}/min excess supply. Reduce incoming belt rates.`;
  }
  return {
    ...snapshot,
    error,
    sources: rates.map((rate, index) => ({
      id: `incoming-belt:${index}`,
      rate,
      title: `Incoming belt ${index + 1}`,
      groupKey: "incoming-belts",
      type: "Belt supply",
      icon,
      sink: false,
    })),
  };
}

export function distributionSnapshot(
  editor: ReturnType<typeof createFactoryEditor>,
  assets: GameAssets,
  ref: PortReference,
): DistributionSnapshot {
  const itemId = [...editor.getMaterials(ref)][0] ?? "";
  const result: DistributionSnapshot = { itemId, sources: [], destinations: [] };
  const materials = [...editor.getMaterials(ref)];
  if (materials.length !== 1 || assets.catalog.items[itemId]?.form !== "solid")
    return { ...result, error: "This experiment supports one solid item per port." };
  const allocations = new Map<string, { ref: PortReference; rate: number; source: boolean }>();
  const analysis = editor.getFlowAnalysis();
  for (const link of editor.history.getSnapshot().state.links) {
    if (
      ![link.output, link.input].some(
        (end) => end.nodeId === ref.nodeId && end.portKey === ref.portKey,
      )
    )
      continue;
    const rate = analysis.links.get(link.id)?.find((r) => r.itemId === itemId)?.perMinute ?? 0;
    if (rate <= 0) continue;
    for (const [end, source] of [
      [link.output, true],
      [link.input, false],
    ] as const) {
      const key = `${source}:${end.nodeId}:${end.portKey}`;
      const previous = allocations.get(key);
      allocations.set(key, { ref: end, source, rate: rate + (previous?.rate ?? 0) });
    }
  }
  for (const [key, entry] of allocations) {
    const node = editor.getNode(entry.ref.nodeId);
    const display = editor.getDisplay(entry.ref.nodeId);
    if (!node || !display || node.kind === "logistics" || display.layout !== "machine")
      return {
        ...result,
        error:
          "Select direct machine connections for this experiment. Existing logistics networks are not expanded yet.",
      };
    const weights = node.machines.map((member) => {
      const production = resolveProduction({ ...node, machines: [member] }, assets.catalog);
      const rates = entry.source ? production.outputs : production.inputs;
      return node.kind === "sink"
        ? 1
        : (rates.find((rate) => rate.itemId === itemId)?.perMinute ?? 0);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (!total)
      return { ...result, error: "The selected machine has no configured rate to expand." };
    weights.forEach((weight, index) => {
      if (!weight) return;
      const endpoint: Endpoint = {
        id: `${key}:${index}`,
        rate: (entry.rate * weight) / total,
        title: display.title,
        groupKey:
          node.kind === "manufacturing"
            ? `recipe:${node.recipeId}`
            : `${node.kind}:${display.title}`,
        type: `${display.subtitle.replace(/^.*?×\s*/, "")} ${index + 1}`,
        icon: display.machineIconId,
        sink: node.kind === "sink",
      };
      (entry.source ? result.sources : result.destinations).push(endpoint);
    });
  }
  return result;
}

export function distributionScene(
  snapshot: DistributionSnapshot,
  assets: GameAssets,
  tier: number,
  mode: "balanced" | "manifold",
) {
  const graph: DistributionPreview = snapshot.error
    ? { nodes: [], edges: [], error: snapshot.error }
    : mode === "manifold" && snapshot.destinations.some((d) => d.sink)
      ? {
          nodes: [],
          edges: [],
          error:
            "Sinks do not back up at a target rate. Use Balanced for a distribution containing a sink.",
        }
      : buildDistributionPrototype(snapshot.sources, snapshot.destinations, tier, mode);
  const endpoints = new Map([...snapshot.sources, ...snapshot.destinations].map((e) => [e.id, e]));
  const displays = new Map<string, NodeDisplay>();
  const items: CanvasItem[] = graph.nodes.map((node) => ({
    id: node.id,
    x: 0,
    y: 0,
    width: endpoints.has(node.id) ? 256 : 128,
    height: endpoints.has(node.id) ? 256 : 128,
  }));
  const refs = new Map<string, { output: PortReference; input: PortReference }>();
  const item = assets.catalog.items[snapshot.itemId];
  for (const node of graph.nodes) {
    const endpoint = endpoints.get(node.id);
    const incoming = graph.edges.filter((edge) => edge.to === node.id);
    const outgoing = graph.edges.filter((edge) => edge.from === node.id);
    const size = endpoint ? 256 : 128;
    const ports = [incoming, outgoing].flatMap((edges, side) => {
      const direction = side ? ("output" as const) : ("input" as const);
      const count = endpoint ? edges.length : (node.kind === "splitter") === Boolean(side) ? 3 : 1;
      const slots = edges.length === 2 && count === 3 ? [0, 2] : edges.map((_, index) => index);
      edges.forEach((edge, index) => {
        const pair = refs.get(edge.id) ?? {
          output: { nodeId: "", portKey: "" },
          input: { nodeId: "", portKey: "" },
        };
        pair[direction] = { nodeId: node.id, portKey: `${direction}:${slots[index]}` };
        refs.set(edge.id, pair);
      });
      return Array.from({ length: count }, (_, index) => ({
        key: `${direction}:${index}`,
        direction,
        transport: "belt" as const,
        itemId: null,
        iconId: null,
        configuredItemIconIds: [],
        name: item?.name ?? "",
        x: side ? size : 0,
        y: endpoint ? 96 : count === 3 ? 32 + index * 32 : 64,
      }));
    });
    if (endpoint)
      displays.set(node.id, {
        layout: "machine",
        size,
        height: 256,
        title: endpoint.title,
        subtitle: endpoint.type,
        machineIconId: endpoint.icon,
        ports,
        power: { kind: "unknown" },
        powerLabel: `${formatPlanningNumber(endpoint.rate)}/min`,
        clockLabel: null,
        sloops: null,
        footer: { kind: "storage", label: `${formatPlanningNumber(endpoint.rate)}/min` },
      });
    else
      displays.set(node.id, {
        layout: "logistics",
        size,
        title: node.kind === "splitter" ? "Splitter" : "Merger",
        machineIconId:
          Object.values(assets.catalog.logistics).find((part) => part.kind === node.kind)?.iconId ??
          "",
        ports,
      });
  }
  const routed = new Map<string, CanvasLink>();
  const controller = new CanvasController({ items, readOnly: true, onMove() {} });
  return {
    graph,
    controller,
    async layout(signal: AbortSignal) {
      const { layoutDistribution } = await import("./distribution-elk-prototype");
      // An invisible layout block reserves a column for each recipe. Its ports
      // are the real member ports, so ELK can route without moving nodes later.
      const groups = new Map<string, typeof snapshot.destinations>();
      for (const endpoint of snapshot.destinations) {
        const id = `recipe-group:${endpoint.groupKey}`;
        const members = groups.get(id) ?? [];
        members.push(endpoint);
        groups.set(id, members);
      }
      const destinationIds = new Set(snapshot.destinations.map((endpoint) => endpoint.id));
      const ports = (id: string, offsetY = 0) =>
        displays.get(id)!.ports.map((port) => ({
          id: portId({ nodeId: id, portKey: port.key }),
          x: port.x,
          y: port.y + offsetY,
          width: 0,
          height: 0,
          layoutOptions: { "elk.port.side": port.direction === "input" ? "WEST" : "EAST" },
        }));
      const children: ElkNode[] = items
        .filter((bounds) => !destinationIds.has(bounds.id))
        .map((bounds) => ({
          id: bounds.id,
          width: bounds.width,
          height: bounds.height,
          layoutOptions: {
            "elk.portConstraints": "FIXED_POS",
            "elk.layered.layering.layerConstraint":
              graph.nodes.find((node) => node.id === bounds.id)!.kind === "source"
                ? "FIRST"
                : "NONE",
          },
          ports: ports(bounds.id),
        }));
      for (const [id, members] of groups)
        children.push({
          id,
          width: 256,
          height: members.length * 320 - 64,
          layoutOptions: { "elk.portConstraints": "FIXED_POS" },
          ports: members.flatMap((member, index) => ports(member.id, index * 320)),
        });
      const layoutGraph: ElkNode = {
        id: "distribution",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.edgeRouting": "ORTHOGONAL",
          "elk.padding": "[top=32,left=32,bottom=32,right=32]",
          "elk.spacing.nodeNode": "64",
          "elk.spacing.edgeNode": "64",
          "elk.spacing.edgeEdge": "64",
          "elk.layered.spacing.nodeNodeBetweenLayers": "128",
          "elk.layered.spacing.edgeNodeBetweenLayers": "64",
          "elk.layered.spacing.edgeEdgeBetweenLayers": "64",
          "elk.layered.feedbackEdges": "true",
          "elk.layered.mergeEdges": "false",
          "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        },
        children,
        edges: graph.edges.map((edge) => ({
          id: edge.id,
          sources: [portId(refs.get(edge.id)!.output)],
          targets: [portId(refs.get(edge.id)!.input)],
          labels: [
            {
              text: formatPlanningNumber(edge.rate),
              width: 64,
              height: 32,
              layoutOptions: {
                "elk.edgeLabels.placement": "CENTER",
                "elk.edgeLabels.inline": "true",
              },
            },
          ],
        })),
      };
      // Recipe blocks join related branches into one component. Lay independent
      // components out separately so their suppliers and routes cannot interleave.
      const owners = new Map(
        children.flatMap((child) => child.ports!.map((port) => [port.id, child.id] as const)),
      );
      const neighbors = new Map(children.map((child) => [child.id, new Set<string>()]));
      for (const edge of layoutGraph.edges!) {
        const source = owners.get(edge.sources[0]!)!;
        const target = owners.get(edge.targets[0]!)!;
        neighbors.get(source)!.add(target);
        neighbors.get(target)!.add(source);
      }
      const remaining = new Set(children.map((child) => child.id));
      const result: ElkNode = { id: "distribution", children: [], edges: [] };
      let offsetY = 0;
      while (remaining.size) {
        const component = new Set<string>();
        const pending = [remaining.values().next().value!];
        while (pending.length) {
          const id = pending.pop()!;
          if (!remaining.delete(id)) continue;
          component.add(id);
          pending.push(...neighbors.get(id)!);
        }
        // Each layout owns an ELK worker; run sequentially to bound worker memory.
        // eslint-disable-next-line no-await-in-loop
        const section = await layoutDistribution(
          {
            ...layoutGraph,
            children: children.filter((child) => component.has(child.id)),
            edges: layoutGraph.edges!.filter((edge) =>
              component.has(owners.get(edge.sources[0]!)!),
            ),
          },
          signal,
        );
        for (const child of section.children ?? []) {
          child.y = (child.y ?? 0) + offsetY;
          result.children!.push(child);
        }
        const translate = (point: Point) => ({ x: point.x, y: point.y + offsetY });
        for (const edge of section.edges ?? []) {
          for (const route of edge.sections ?? []) {
            route.startPoint = translate(route.startPoint);
            route.endPoint = translate(route.endPoint);
            route.bendPoints = route.bendPoints?.map(translate);
          }
          for (const label of edge.labels ?? []) label.y = (label.y ?? 0) + offsetY;
          result.edges!.push(edge);
        }
        offsetY += Math.ceil((section.height ?? 0) / GRID_SIZE) * GRID_SIZE + 128;
      }
      for (const child of result.children ?? []) {
        const members = groups.get(child.id);
        for (const [offset, id] of (members?.map((member) => member.id) ?? [child.id]).entries()) {
          const index = items.findIndex((entry) => entry.id === id);
          items[index] = {
            ...items[index]!,
            x: grid(child.x ?? 0),
            y: grid((child.y ?? 0) + offset * 320),
          };
        }
      }
      for (const edge of result.edges ?? []) {
        const section = edge.sections?.[0];
        if (!section) throw new Error("ELK did not route a preview belt.");
        const label = edge.labels?.[0];
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
          .map((point) => ({ x: grid(point.x), y: grid(point.y) }))
          .filter(
            (point, index, route) =>
              index === 0 || point.x !== route[index - 1]!.x || point.y !== route[index - 1]!.y,
          );
        routed.set(edge.id, {
          id: edge.id,
          ...refs.get(edge.id)!,
          points,
          color: PREVIEW_BELT_COLORS[graph.edges.find((entry) => entry.id === edge.id)!.tier - 1],
          dashed: graph.edges.find((entry) => entry.id === edge.id)!.feedback,
          labelPosition:
            label?.x === undefined || label.y === undefined
              ? undefined
              : labelOnRoute(
                  { x: label.x + (label.width ?? 0) / 2, y: label.y + (label.height ?? 0) / 2 },
                  points,
                ),
          labelFontSize: 14,
        });
      }
      controller.setLinks([...routed.values()]);
      controller.setItems([...items]);
    },
    getDisplay: (id: string) => displays.get(id),
    getLinkRates: (id: string) => {
      const edge = graph.edges.find((e) => e.id === id)!;
      return [formatPlanningNumber(edge.rate)];
    },
  };
}
