/** Adapter for the distribution preview. Layout edits never change the source document. */
import { CanvasController, GRID_SIZE, portId, routeLink } from "@satisfactory-belt/canvas-core";
import type { CanvasItem, CanvasLink, Point, PortReference } from "@satisfactory-belt/canvas-core";
import {
  distributionFailure,
  formatPlanningNumber,
  distributionCapacities,
  resolveProduction,
} from "@satisfactory-belt/factory-core";
import type {
  NodeDisplay,
  LogisticsDisplay,
  DistributionResult,
  DistributionRequest,
  DistributionErrorCode,
  DistributionTransport,
} from "@satisfactory-belt/factory-core";
import type { ElkNode } from "elkjs/lib/elk-api";

import {
  manifoldSockets,
  manifoldPositions,
  manifoldRoute,
  manifoldLabel,
} from "./distribution-manifold";
import type { createFactoryEditor } from "./factory-editor";
import type { GameAssets } from "./game-assets";

export const DISTRIBUTION_BELT_COLORS = [
  0x2563eb, 0xd97706, 0x059669, 0x9333ea, 0xe11d48, 0x0891b2,
] as const;
const grid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;
const offsetPoint = (point: Point, offset?: Point): Point => ({
  x: point.x + (offset?.x ?? 0),
  y: point.y + (offset?.y ?? 0),
});

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
  groupId?: string;
  title: string;
  groupKey: string;
  type: string;
  icon: string;
  sink: boolean;
};
export type DistributionDetail = "nodes" | "machines";
export type DistributionSnapshot = {
  detail: DistributionDetail;
  itemId: string;
  transport: DistributionTransport;
  sources: Endpoint[];
  destinations: Endpoint[];
  error?: string;
  errorCode?: DistributionErrorCode;
};

export function distributionSnapshot(
  editor: ReturnType<typeof createFactoryEditor>,
  assets: GameAssets,
  ref: PortReference,
  detail: DistributionDetail = "nodes",
): DistributionSnapshot {
  const itemId = [...editor.getMaterials(ref)][0] ?? "";
  const transport = assets.catalog.items[itemId]?.form === "solid" ? "belt" : "pipe";
  const result: DistributionSnapshot = { detail, itemId, transport, sources: [], destinations: [] };
  const materials = [...editor.getMaterials(ref)];
  if (
    materials.length !== 1 ||
    !["solid", "liquid", "gas"].includes(assets.catalog.items[itemId]?.form ?? "")
  )
    return {
      ...result,
      errorCode: "unsupported",
      error:
        "Distribution supports one material per port. Select a belt or pipe port carrying a single material.",
    };
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
        errorCode: "unsupported",
        error:
          "Select direct machine connections. Distribution through existing logistics networks is not supported.",
      };
    const endpoint: Endpoint = {
      id: key,
      rate: entry.rate,
      title: display.title,
      groupKey:
        node.kind === "manufacturing" ? `recipe:${node.recipeId}` : `${node.kind}:${display.title}`,
      type: display.subtitle,
      icon: display.machineIconId,
      sink: node.kind === "sink",
    };
    if (detail === "nodes") {
      (entry.source ? result.sources : result.destinations).push(endpoint);
      continue;
    }
    const weights = node.machines.map((member) => {
      const production = resolveProduction({ ...node, machines: [member] }, assets.catalog);
      const rates = entry.source ? production.outputs : production.inputs;
      return node.kind === "sink"
        ? 1
        : (rates.find((rate) => rate.itemId === itemId)?.perMinute ?? 0);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (!total)
      return {
        ...result,
        errorCode: "invalid-input",
        error: "The selected machine has no configured rate to expand.",
      };
    weights.forEach((weight, index) => {
      if (!weight) return;
      const member: Endpoint = {
        ...endpoint,
        id: `${key}:${index}`,
        groupId: key,
        rate: (entry.rate * weight) / total,
        type: `${display.subtitle.replace(/^.*?×\s*/, "")} ${index + 1}`,
      };
      (entry.source ? result.sources : result.destinations).push(member);
    });
  }
  return result;
}

/** Describe a supported construction without running the generator on the UI thread. */
export function distributionRequest(
  snapshot: DistributionSnapshot,
  tier: number,
): DistributionRequest | DistributionResult {
  const capacity = distributionCapacities(snapshot.transport)[tier - 1] ?? 0;
  const unit = snapshot.transport === "pipe" ? " m³" : "";
  const capacityError =
    snapshot.detail === "nodes" &&
    [...snapshot.sources, ...snapshot.destinations].some(
      (endpoint) => endpoint.rate > capacity + 1e-5,
    )
      ? `A connected node exceeds Mk.${tier} (${capacity}${unit}/min). Select a higher ${snapshot.transport} tier or Individual machines. Parallel ${snapshot.transport === "pipe" ? "pipes" : "belts"} between nodes are not supported yet.`
      : undefined;
  const error = snapshot.error ?? capacityError;
  if (error)
    return distributionFailure(
      snapshot.error ? (snapshot.errorCode ?? "unsupported") : "capacity",
      error,
    );
  return {
    sources: snapshot.sources.map(({ id, rate, groupId }) => ({ id, rate, groupId })),
    destinations: snapshot.destinations.map(({ id, rate, groupId }) => ({ id, rate, groupId })),
    maxTier: tier,
    transport: snapshot.transport,
  };
}

export function distributionScene(
  snapshot: DistributionSnapshot,
  assets: GameAssets,
  graph: DistributionResult,
) {
  const endpoints = new Map([...snapshot.sources, ...snapshot.destinations].map((e) => [e.id, e]));
  const kinds = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const displays = new Map<string, NodeDisplay>();
  const items: CanvasItem[] = graph.nodes.map((node) => ({
    id: node.id,
    x: 0,
    y: 0,
    width: endpoints.has(node.id) ? 256 : node.kind === "junction" ? 64 : 128,
    height: endpoints.has(node.id) ? 256 : node.kind === "junction" ? 64 : 128,
  }));
  const refs = new Map<string, { output: PortReference; input: PortReference }>();
  const item = assets.catalog.items[snapshot.itemId];
  const rateUnit = snapshot.transport === "pipe" ? " m³/min" : "/min";
  for (const node of graph.nodes) {
    const endpoint = endpoints.get(node.id);
    const incoming = graph.edges.filter((edge) => edge.to === node.id);
    const outgoing = graph.edges.filter((edge) => edge.from === node.id);
    const size = endpoint ? 256 : node.kind === "junction" ? 64 : 128;
    const ports: LogisticsDisplay["ports"][number][] = [];
    if (node.kind === "junction") {
      // All sockets are interchangeable. Use the horizontal pair for the trunk
      // and put the remaining one/two branches on perpendicular sides.
      const primary = (edges: typeof incoming, upstream: boolean) =>
        edges.toSorted(
          (a, b) =>
            Number(kinds.get(upstream ? b.from : b.to) === "junction") -
              Number(kinds.get(upstream ? a.from : a.to) === "junction") ||
            b.rate - a.rate ||
            a.id.localeCompare(b.id),
        )[0]!;
      const west = primary(incoming, true);
      const east = primary(outgoing, false);
      const branches = [...incoming, ...outgoing].filter((edge) => edge !== west && edge !== east);
      const sockets = graph.pipeManifold
        ? manifoldSockets(graph, node.id, size)
        : [
            { edge: west, x: 0, y: size / 2 },
            { edge: east, x: size, y: size / 2 },
            ...branches.map((edge, index) => ({
              edge,
              x: size / 2,
              y: branches.length === 2 && index === 0 ? 0 : size,
            })),
          ];
      for (const [index, socket] of sockets.entries()) {
        const direction = socket.edge.to === node.id ? "input" : "output";
        const key = `socket:${index}`;
        const pair = refs.get(socket.edge.id) ?? {
          output: { nodeId: "", portKey: "" },
          input: { nodeId: "", portKey: "" },
        };
        pair[direction] = { nodeId: node.id, portKey: key };
        refs.set(socket.edge.id, pair);
        ports.push({
          key,
          direction,
          bidirectional: true,
          transport: "pipe",
          itemId: null,
          iconId: null,
          configuredItemIconIds: [],
          name: item?.name ?? "",
          x: socket.x,
          y: socket.y,
        });
      }
      // A cross may also be used with one unconnected socket.
      if (node.junctionType === "cross" && sockets.length === 3) {
        const free = [
          { x: 0, y: size / 2 },
          { x: size, y: size / 2 },
          { x: size / 2, y: 0 },
          { x: size / 2, y: size },
        ].find((point) => !ports.some((port) => port.x === point.x && port.y === point.y))!;
        ports.push({
          key: "socket:3",
          direction: "output",
          bidirectional: true,
          transport: "pipe",
          itemId: null,
          iconId: null,
          configuredItemIconIds: [],
          name: item?.name ?? "",
          ...free,
        });
      }
    } else
      ports.push(
        ...[incoming, outgoing].flatMap((edges, side) => {
          const direction = side ? ("output" as const) : ("input" as const);
          const count = endpoint
            ? edges.length
            : (node.kind === "splitter") === Boolean(side)
              ? 3
              : 1;
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
            transport: snapshot.transport,
            itemId: null,
            iconId: null,
            configuredItemIconIds: [],
            name: item?.name ?? "",
            x: side ? size : 0,
            y: endpoint ? 96 : count === 3 ? 32 + index * 32 : count === 2 ? 32 + index * 64 : 64,
          }));
        }),
      );
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
        powerLabel: `${formatPlanningNumber(endpoint.rate)}${rateUnit}`,
        clockLabel: null,
        sloops: null,
        footer: { kind: "storage", label: `${formatPlanningNumber(endpoint.rate)}${rateUnit}` },
      });
    else
      displays.set(node.id, {
        layout: "logistics",
        size,
        title:
          node.kind === "junction"
            ? node.junctionType === "t"
              ? "Pipeline T-junction"
              : "Pipeline cross-junction"
            : node.kind === "splitter"
              ? "Splitter"
              : "Merger",
        pipeJunction: node.junctionType,
        machineIconId:
          Object.values(assets.catalog.logistics).find((part) => part.kind === node.kind)?.iconId ??
          "",
        ports,
      });
  }
  const routed = new Map<string, CanvasLink>();
  const controller = new CanvasController({
    items,
    readOnly: true,
    allowNodeMovement: true,
    onMove(moves) {
      const offsets = new Map<string, Point>();
      for (const move of moves) {
        const index = items.findIndex((bounds) => bounds.id === move.id);
        if (index === -1) continue;
        const bounds = items[index]!;
        offsets.set(bounds.id, { x: move.x - bounds.x, y: move.y - bounds.y });
        items[index] = { ...bounds, x: move.x, y: move.y };
      }
      for (const [id, link] of routed) {
        const sourceOffset = offsets.get(link.output.nodeId);
        const targetOffset = offsets.get(link.input.nodeId);
        if (!sourceOffset && !targetOffset) continue;
        const translated =
          sourceOffset &&
          targetOffset &&
          sourceOffset.x === targetOffset.x &&
          sourceOffset.y === targetOffset.y;
        routed.set(id, {
          ...link,
          points: translated
            ? link.points.map((point) => offsetPoint(point, sourceOffset))
            : routeLink(
                offsetPoint(link.points[0]!, sourceOffset),
                offsetPoint(link.points.at(-1)!, targetOffset),
                [],
                undefined,
                link.endpointSides,
              ),
          labelPosition:
            translated && link.labelPosition
              ? offsetPoint(link.labelPosition, sourceOffset)
              : undefined,
        });
      }
      controller.setLinks([...routed.values()]);
      controller.setItems([...items]);
    },
  });
  const portSide = (ref: PortReference) => {
    const display = displays.get(ref.nodeId)!;
    const port = display.ports.find((entry) => entry.key === ref.portKey)!;
    return port.x === 0
      ? "west"
      : port.x === display.size
        ? "east"
        : port.y === 0
          ? "north"
          : "south";
  };
  const setRoute = (
    edge: DistributionResult["edges"][number],
    points: readonly Point[],
    labelPosition?: Point,
  ) => {
    const ends = refs.get(edge.id)!;
    routed.set(edge.id, {
      id: edge.id,
      ...ends,
      points,
      endpointSides:
        snapshot.transport === "pipe"
          ? {
              output: portSide(ends.output),
              input: portSide(ends.input),
            }
          : undefined,
      color: DISTRIBUTION_BELT_COLORS[edge.tier - 1],
      dashed: edge.feedback,
      labelPosition,
      labelFontSize: 14,
    });
  };
  return {
    graph,
    controller,
    async layout(signal: AbortSignal) {
      signal.throwIfAborted();
      if (graph.pipeManifold) {
        const positions = manifoldPositions(graph);
        for (let index = 0; index < items.length; index++)
          items[index] = { ...items[index]!, ...positions.get(items[index]!.id)! };
        const position = (ref: PortReference): Point => {
          const port = displays.get(ref.nodeId)!.ports.find((entry) => entry.key === ref.portKey)!;
          return offsetPoint(port, positions.get(ref.nodeId));
        };
        for (const edge of graph.edges) {
          const ends = refs.get(edge.id)!;
          const points = manifoldRoute(
            position(ends.output),
            position(ends.input),
            kinds.get(edge.from) === "source",
          );
          setRoute(edge, points, manifoldLabel(points));
        }
        controller.setLinks([...routed.values()]);
        controller.setItems([...items]);
        return;
      }
      const { layoutDistribution } = await import("./distribution-layout");
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
          layoutOptions: {
            "elk.port.side": portSide({ nodeId: id, portKey: port.key }).toUpperCase(),
          },
        }));
      const children: ElkNode[] = items
        .filter((bounds) => !destinationIds.has(bounds.id))
        .map((bounds) => ({
          id: bounds.id,
          width: bounds.width,
          height: bounds.height,
          layoutOptions: {
            // Junction ports are interchangeable. Let crossing minimization order
            // them while keeping inputs west and outputs east.
            "elk.portConstraints":
              endpoints.has(bounds.id) ||
              displays.get(bounds.id)!.ports.some((port) => port.bidirectional)
                ? "FIXED_POS"
                : "FIXED_SIDE",
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
          layoutOptions: {
            "elk.portConstraints": "FIXED_POS",
            "elk.layered.layering.layerConstraint": "LAST",
          },
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
          "elk.spacing.edgeNode": "32",
          "elk.spacing.edgeEdge": "32",
          "elk.layered.spacing.nodeNodeBetweenLayers": "64",
          "elk.layered.spacing.edgeNodeBetweenLayers": "32",
          "elk.layered.spacing.edgeEdgeBetweenLayers": "32",
          "elk.layered.feedbackEdges": "true",
          // Follow the construction from its suppliers; the cycles close on return belts.
          "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
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
        const display = displays.get(child.id);
        if (display?.layout === "logistics" && !display.pipeJunction) {
          displays.set(child.id, {
            ...display,
            ports: display.ports.map((port) => {
              const placed = child.ports!.find(
                (entry) => entry.id === portId({ nodeId: child.id, portKey: port.key }),
              )!;
              return Object.assign({}, port, { y: grid(placed.y ?? 0) });
            }),
          });
        }
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
        if (!section) throw new Error("ELK did not route a preview connection.");
        const label = edge.labels?.[0];
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
          .map((point) => ({ x: grid(point.x), y: grid(point.y) }))
          .filter(
            (point, index, route) =>
              index === 0 || point.x !== route[index - 1]!.x || point.y !== route[index - 1]!.y,
          );
        setRoute(
          graph.edges.find((entry) => entry.id === edge.id)!,
          points,
          label?.x === undefined || label.y === undefined
            ? undefined
            : labelOnRoute(
                { x: label.x + (label.width ?? 0) / 2, y: label.y + (label.height ?? 0) / 2 },
                points,
              ),
        );
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
