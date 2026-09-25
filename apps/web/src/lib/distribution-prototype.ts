/** Adapter for the throwaway distribution preview. Never edits the source document. */
import { CanvasController } from "@satisfactory-belt/canvas-core";
import type { CanvasItem, CanvasLink, PortReference } from "@satisfactory-belt/canvas-core";
import {
  buildDistributionPrototype,
  formatPlanningNumber,
  resolveProduction,
} from "@satisfactory-belt/factory-core";
import type { NodeDisplay, DistributionPreview } from "@satisfactory-belt/factory-core";

import type { createFactoryEditor } from "./factory-editor";
import type { GameAssets } from "./game-assets";

type Endpoint = {
  id: string;
  rate: number;
  title: string;
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
  const levels = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (let i = 0; i < graph.nodes.length; i++) {
    let changed = false;
    for (const edge of graph.edges) {
      if (edge.feedback) continue;
      const next = levels.get(edge.from)! + 1;
      if (levels.get(edge.to)! < next) {
        levels.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const maxLevel = Math.max(0, ...levels.values());
  for (const node of graph.nodes) if (node.kind === "destination") levels.set(node.id, maxLevel);
  const columns = new Map<number, string[]>();
  graph.nodes.forEach((node) => {
    const level = levels.get(node.id)!;
    const column = columns.get(level) ?? [];
    column.push(node.id);
    columns.set(level, column);
  });
  const items: CanvasItem[] = [];
  for (const [level, ids] of [...columns].toSorted(([a], [b]) => a - b)) {
    // Parent order gives short crossings while keeping the prototype deterministic.
    const center = (id: string) => {
      const parents = graph.edges
        .filter((edge) => edge.to === id && !edge.feedback)
        .map((edge) => items.find((n) => n.id === edge.from)?.y ?? 0);
      return parents.reduce((a, b) => a + b, 0) / (parents.length || 1);
    };
    ids.sort((a, b) => center(a) - center(b));
    ids.forEach((id, index) => {
      const endpoint = endpoints.get(id);
      items.push({
        id,
        x: level * 380,
        y: (index - (ids.length - 1) / 2) * 230,
        width: endpoint ? 256 : 96,
        height: endpoint ? 160 : 96,
      });
    });
  }
  const refs = new Map<string, { output: PortReference; input: PortReference }>();
  const item = assets.catalog.items[snapshot.itemId];
  for (const node of graph.nodes) {
    const endpoint = endpoints.get(node.id);
    const incoming = graph.edges.filter((edge) => edge.to === node.id);
    const outgoing = graph.edges.filter((edge) => edge.from === node.id);
    const size = endpoint ? 256 : 96;
    const ports = [incoming, outgoing].flatMap((edges, side) =>
      edges.map((edge, index) => {
        const direction = side ? ("output" as const) : ("input" as const);
        const key = `${direction}:${index}`;
        const pair = refs.get(edge.id) ?? {
          output: { nodeId: "", portKey: "" },
          input: { nodeId: "", portKey: "" },
        };
        pair[direction] = { nodeId: node.id, portKey: key };
        refs.set(edge.id, pair);
        return {
          key,
          direction,
          transport: "belt" as const,
          itemId: null,
          iconId: null,
          configuredItemIconIds: [],
          name: item?.name ?? "",
          x: side ? size : 0,
          y: endpoint ? 96 : 48 + (index - (edges.length - 1) / 2) * 32,
        };
      }),
    );
    if (endpoint)
      displays.set(node.id, {
        layout: "machine",
        size,
        height: 160,
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
  const links = (): CanvasLink[] =>
    graph.edges.map((edge) => {
      const pair = refs.get(edge.id)!;
      const position = (ref: PortReference) => {
        const bounds = items.find((entry) => entry.id === ref.nodeId)!;
        const port = displays.get(ref.nodeId)!.ports.find((p) => p.key === ref.portKey)!;
        return { x: bounds.x + port.x, y: bounds.y + port.y };
      };
      const a = position(pair.output),
        b = position(pair.input);
      const bottom = Math.max(...items.map((n) => n.y + n.height)) + 120;
      return {
        id: edge.id,
        ...pair,
        points: edge.feedback
          ? [
              a,
              { x: a.x + 48, y: a.y },
              { x: a.x + 48, y: bottom },
              { x: b.x - 48, y: bottom },
              { x: b.x - 48, y: b.y },
              b,
            ]
          : [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b],
      };
    });
  const controller = new CanvasController({
    items,
    onMove(moves) {
      moves.forEach((move) => {
        const index = items.findIndex((entry) => entry.id === move.id);
        items[index] = { ...items[index]!, ...move };
      });
      controller.setLinks(links());
      controller.setItems([...items]);
    },
  });
  controller.setLinks(links());
  return {
    graph,
    controller,
    getDisplay: (id: string) => displays.get(id),
    getLinkRates: (id: string) => {
      const edge = graph.edges.find((e) => e.id === id)!;
      return [
        `${formatPlanningNumber(edge.rate)}/min · Mk.${edge.tier}${edge.feedback ? " · Return" : ""}`,
      ];
    },
  };
}
