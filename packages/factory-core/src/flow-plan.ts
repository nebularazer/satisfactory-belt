import { portId } from "@satisfactory-belt/canvas-core";
import type { PortReference } from "@satisfactory-belt/canvas-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";

import { FlowNetwork } from "./flow-network";
import type { Edge } from "./flow-network";
import { isFlowGroup, validateFlowSettings } from "./flow-sizing";
import { createConnectionIndex } from "./links";
import type { ExternalFlow, FactoryDocument } from "./links";
import { isMaterialTransport } from "./ports";
import type { SemanticPort } from "./ports";
import { resolveProduction } from "./production";
import type { MaterialRate } from "./production";
import { resolveSemanticPorts } from "./semantic-ports";
import { filterAllows } from "./splitters";

export type FlowIssue = Readonly<{
  code:
    | "invalid"
    | "unknown-rate"
    | "unsupported"
    | "target-shortfall"
    | "missing-input"
    | "unallocated-output"
    | "missing-export"
    | "unused-import"
    | "analysis-limit";
  nodeId?: string;
  linkId?: string;
  port?: PortReference;
  itemId?: string;
  perMinute?: number;
  detail?: string;
}>;
export type FlowBalance = Readonly<{
  itemId: string;
  produced: number;
  consumed: number;
  imported: number;
  exported: number;
  disposed: number;
  stored: number;
  missing: number;
  unallocated: number;
}>;
export type FlowAnalysis = Readonly<{
  status: "empty" | "feasible" | "infeasible" | "unverified" | "invalid";
  issues: readonly FlowIssue[];
  balances: readonly FlowBalance[];
  /** Configured-rate allocation, including partial results for incomplete plans.
   * Recipe outputs are configured potential, not supply-limited actual throughput. */
  links: ReadonlyMap<string, readonly MaterialRate[]>;
  incoming: ReadonlyMap<string, readonly MaterialRate[]>;
  allocatedPorts: ReadonlyMap<string, readonly MaterialRate[]>;
  /** Allocation to mandatory consumers, before surplus collection/disposal. */
  requiredPorts: ReadonlyMap<string, readonly MaterialRate[]>;
}>;

/** Connection previews and analysis share a single immutable semantic snapshot. */
export function prepareFlowPlan(document: FactoryDocument, catalog: GameCatalog) {
  const ports = document.nodes.flatMap((node) => resolveSemanticPorts(node, catalog));
  const connections = createConnectionIndex(ports, document.links);
  const byNode = new Map<string, SemanticPort[]>();
  for (const port of ports) {
    const entries = byNode.get(port.nodeId) ?? [];
    entries.push(port);
    byNode.set(port.nodeId, entries);
  }
  let analysis: FlowAnalysis | undefined;
  return {
    ...connections,
    ports: (nodeId: string): readonly SemanticPort[] => byNode.get(nodeId) ?? [],
    analyze: (): FlowAnalysis => (analysis ??= analyze(document, catalog, ports, connections)),
  };
}

/** Supply may enter concrete inputs; exports may leave known storage/logistics outputs. */
export function validateExternalFlows(
  external: readonly ExternalFlow[],
  ports: readonly SemanticPort[],
  materials: (port: PortReference) => ReadonlySet<string>,
): void {
  const byId = new Map(ports.map((port) => [portId(port), port]));
  const seen = new Set<string>();
  for (const entry of external) {
    const port = byId.get(portId(entry.port));
    const key = JSON.stringify([portId(entry.port), entry.itemId]);
    if (
      !port ||
      !isMaterialTransport(port.transport) ||
      !Number.isFinite(entry.perMinute) ||
      entry.perMinute <= 0 ||
      entry.perMinute > 1e12 ||
      seen.has(key) ||
      (port.itemId !== null
        ? port.itemId !== entry.itemId
        : port.direction !== "output" || !materials(port).has(entry.itemId)) ||
      !filterAllows(port.filter, entry.itemId)
    )
      throw new Error(
        "External flows require a matching material port and a positive finite rate.",
      );
    seen.add(key);
  }
}

/** Remove declarations whose ports disappeared or changed material during a deliberate edit. */
export function reconcileExternalFlows(
  document: FactoryDocument,
  catalog: GameCatalog,
): FactoryDocument {
  if (!document.externalFlows?.length) return document;
  const ports = document.nodes.flatMap((node) => resolveSemanticPorts(node, catalog));
  const index = createConnectionIndex(ports, document.links);
  const externalFlows = document.externalFlows.filter((entry) => {
    try {
      validateExternalFlows([entry], ports, index.materials);
      return true;
    } catch {
      return false;
    }
  });
  return externalFlows.length === document.externalFlows.length
    ? document
    : { ...document, externalFlows };
}

function analyze(
  document: FactoryDocument,
  catalog: GameCatalog,
  ports: readonly SemanticPort[],
  index: ReturnType<typeof createConnectionIndex>,
): FlowAnalysis {
  const issues: FlowIssue[] = [];
  const result = (
    status: FlowAnalysis["status"],
    balances: FlowBalance[] = [],
    links = new Map<string, MaterialRate[]>(),
    incoming = new Map<string, MaterialRate[]>(),
    allocatedPorts = new Map<string, MaterialRate[]>(),
    requiredPorts = new Map<string, MaterialRate[]>(),
  ): FlowAnalysis => ({ status, issues, balances, links, incoming, allocatedPorts, requiredPorts });
  const nodeIds = new Set(document.nodes.map((node) => node.id));
  const linkIds = new Set(document.links.map((link) => link.id));
  if (nodeIds.size !== document.nodes.length || linkIds.size !== document.links.length)
    issues.push({ code: "invalid", detail: "Duplicate graph identities." });
  for (const linkId of index.invalidLinks())
    issues.push({ code: "invalid", linkId, detail: "Invalid material connection." });
  try {
    validateExternalFlows(document.externalFlows ?? [], ports, index.materials);
    for (const node of document.nodes) if (isFlowGroup(node)) validateFlowSettings(node, catalog);
  } catch (error) {
    issues.push({ code: "invalid", detail: String(error) });
  }
  if (issues.length) return result("invalid");
  if (!document.nodes.length) return result("empty");
  for (const node of document.nodes) {
    if (!isFlowGroup(node)) continue;
    const production = resolveProduction(node, catalog);
    for (const [itemId, target] of Object.entries(node.flow?.targets ?? {})) {
      const rate = production.outputs.find((entry) => entry.itemId === itemId)?.perMinute ?? 0;
      if (target - rate > 1e-5)
        issues.push({
          code: "target-shortfall",
          nodeId: node.id,
          itemId,
          perMinute: target - rate,
        });
    }
  }

  const byNode = new Map<string, SemanticPort[]>();
  for (const port of ports) {
    const entries = byNode.get(port.nodeId) ?? [];
    entries.push(port);
    byNode.set(port.nodeId, entries);
  }
  type Terminal = {
    port: SemanticPort;
    itemId: string;
    amount: number;
    kind: "produced" | "consumed" | "imported" | "exported";
  };
  const terminals = new Map<string, Terminal[]>();
  function terminal(port: SemanticPort, itemId: string, amount: number, kind: Terminal["kind"]) {
    const entries = terminals.get(itemId) ?? [];
    entries.push({ port, itemId, amount, kind });
    terminals.set(itemId, entries);
  }
  for (const node of document.nodes) {
    if (
      node.kind === "logistics" ||
      node.kind === "sink" ||
      (node.kind === "facility" && node.configuration.type === "space-elevator")
    )
      continue;
    if (
      node.kind === "facility" &&
      ["depot", "truck-station", "train-station", "drone-port"].includes(node.configuration.type)
    ) {
      issues.push({
        code: "unsupported",
        nodeId: node.id,
        detail:
          "Transport and finite-delivery facilities are not continuous Flow recipes. Use explicit external supply/exports for the planned factory.",
      });
      continue;
    }
    const production = resolveProduction(node, catalog);
    for (const direction of ["input", "output"] as const) {
      for (const rate of direction === "input" ? production.inputs : production.outputs) {
        const port = byNode
          .get(node.id)
          ?.find((p) => p.direction === direction && p.itemId === rate.itemId);
        if (!port) {
          issues.push({ code: "invalid", nodeId: node.id, detail: "Missing production port." });
          continue;
        }
        if (rate.perMinute === null || !Number.isFinite(rate.perMinute) || rate.perMinute < 0) {
          issues.push({ code: "unknown-rate", nodeId: node.id, itemId: rate.itemId });
          continue;
        }
        terminal(
          port,
          rate.itemId,
          rate.perMinute,
          direction === "output" ? "produced" : "consumed",
        );
        // An unconnected target output is the planned final product. Once connected,
        // consumers/storage receive it instead; targets never double-count that flow.
        if (
          direction === "output" &&
          isFlowGroup(node) &&
          node.flow?.targets?.[rate.itemId] !== undefined &&
          !document.links.some((link) => portId(link.output) === portId(port)) &&
          !document.externalFlows?.some(
            (entry) => portId(entry.port) === portId(port) && entry.itemId === rate.itemId,
          )
        )
          terminal(
            port,
            rate.itemId,
            Math.min(rate.perMinute, node.flow.targets[rate.itemId]!),
            "exported",
          );
      }
    }
  }
  const byPort = new Map(ports.map((port) => [portId(port), port]));
  for (const entry of document.externalFlows ?? []) {
    const port = byPort.get(portId(entry.port))!;
    terminal(
      port,
      entry.itemId,
      entry.perMinute,
      port.direction === "input" ? "imported" : "exported",
    );
  }
  if (issues.some((issue) => issue.code !== "target-shortfall"))
    return result(issues.some((issue) => issue.code === "invalid") ? "invalid" : "unverified");

  const links = new Map<string, MaterialRate[]>();
  const incoming = new Map<string, MaterialRate[]>();
  const allocatedPorts = new Map<string, MaterialRate[]>();
  const requiredPorts = new Map<string, MaterialRate[]>();
  const balances: FlowBalance[] = [];
  for (const [itemId, entries] of [...terminals].toSorted(([a], [b]) => a.localeCompare(b))) {
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const epsilon = Math.max(1e-8, total * Number.EPSILON * 32);
    const eligible = ports.filter(
      (port) =>
        isMaterialTransport(port.transport) &&
        (port.itemId === itemId || (port.itemId === null && index.materials(port).has(itemId))),
    );
    const ids = new Map(eligible.map((port, i) => [portId(port), i + 2]));
    const graph = new FlowNetwork(eligible.length + 2, epsilon);
    const terminalEdges = entries.map((entry) => ({
      entry,
      edge:
        entry.kind === "produced" || entry.kind === "imported"
          ? graph.add(0, ids.get(portId(entry.port))!, entry.amount)
          : graph.add(ids.get(portId(entry.port))!, 1, entry.amount),
    }));
    const linkEdges: { id: string; input: PortReference; output: PortReference; edge: Edge }[] = [];
    for (const link of document.links) {
      const from = ids.get(portId(link.output)),
        to = ids.get(portId(link.input));
      if (from !== undefined && to !== undefined)
        linkEdges.push({
          id: link.id,
          input: link.input,
          output: link.output,
          edge: graph.add(from, to, total),
        });
    }
    const disposals: { nodeId: string; edge: Edge }[] = [];
    for (const node of document.nodes) {
      const nodePorts = byNode.get(node.id) ?? [];
      if (
        node.kind === "logistics" ||
        (node.kind === "facility" && node.configuration.type === "storage")
      ) {
        const inputs = nodePorts.filter(
          (port) => port.direction === "input" && ids.has(portId(port)),
        );
        const outputs = nodePorts.filter(
          (port) =>
            port.direction === "output" &&
            ids.has(portId(port)) &&
            filterAllows(port.filter, itemId),
        );
        for (const input of inputs)
          for (const output of outputs)
            graph.add(ids.get(portId(input))!, ids.get(portId(output))!, total);
      }
    }
    if (!graph.solve(0, 1)) {
      issues.push({ code: "analysis-limit" });
      return result("unverified");
    }
    for (const { input, output, edge } of linkEdges) {
      const flow = edge.capacity - edge.remaining;
      append(requiredPorts, portId(input), itemId, flow);
      append(requiredPorts, portId(output), itemId, flow);
    }
    for (const { entry, edge } of terminalEdges)
      if (entry.kind === "imported" || entry.kind === "exported")
        append(requiredPorts, portId(entry.port), itemId, edge.capacity - edge.remaining);
    // Sinks only consume surplus after production.
    for (const node of document.nodes) {
      if (
        node.kind !== "sink" &&
        !(node.kind === "facility" && node.configuration.type === "space-elevator")
      )
        continue;
      for (const port of byNode.get(node.id) ?? [])
        if (ids.has(portId(port)))
          disposals.push({
            nodeId: node.id,
            edge: graph.add(ids.get(portId(port))!, 1, total),
          });
    }
    if (!graph.solve(0, 1)) {
      issues.push({ code: "analysis-limit" });
      return result("unverified");
    }
    // Storage is an implicit surplus destination in a Flow plan. Add it only
    // after consumers and explicit disposal, so it never competes with demand.
    const collection: Edge[] = [];
    for (const node of document.nodes)
      if (node.kind === "facility" && node.configuration.type === "storage")
        for (const port of byNode.get(node.id) ?? [])
          if (port.direction === "input" && ids.has(portId(port)))
            collection.push(graph.add(ids.get(portId(port))!, 1, total));
    if (collection.length && !graph.solve(0, 1)) {
      issues.push({ code: "analysis-limit" });
      return result("unverified");
    }
    const totals = { produced: 0, consumed: 0, imported: 0, exported: 0 };
    let missing = 0,
      unallocated = 0;
    for (const { entry, edge } of terminalEdges) {
      totals[entry.kind] += entry.amount;
      if (entry.kind === "imported") {
        append(incoming, entry.port.nodeId, itemId, edge.capacity - edge.remaining);
        append(allocatedPorts, portId(entry.port), itemId, edge.capacity - edge.remaining);
      }
      if (entry.kind === "exported")
        append(allocatedPorts, portId(entry.port), itemId, edge.capacity - edge.remaining);
      if (edge.remaining <= epsilon) continue;
      const supply = entry.kind === "produced" || entry.kind === "imported";
      if (supply) unallocated += edge.remaining;
      else missing += edge.remaining;
      issues.push({
        code:
          entry.kind === "produced"
            ? "unallocated-output"
            : entry.kind === "imported"
              ? "unused-import"
              : entry.kind === "exported"
                ? "missing-export"
                : "missing-input",
        nodeId: entry.port.nodeId,
        port: { nodeId: entry.port.nodeId, portKey: entry.port.portKey },
        itemId,
        perMinute: edge.remaining,
      });
    }
    for (const { id, input, output, edge } of linkEdges) {
      const flow = edge.capacity - edge.remaining;
      if (flow <= epsilon) continue;
      append(links, id, itemId, flow);
      append(incoming, input.nodeId, itemId, flow);
      append(allocatedPorts, portId(input), itemId, flow);
      append(allocatedPorts, portId(output), itemId, flow);
    }
    const disposed = disposals.reduce((sum, { edge }) => sum + edge.capacity - edge.remaining, 0);
    const stored = collection.reduce((sum, edge) => sum + edge.capacity - edge.remaining, 0);
    balances.push({ itemId, ...totals, disposed, stored, missing, unallocated });
  }
  return result(
    issues.length ? "infeasible" : "feasible",
    balances,
    links,
    incoming,
    allocatedPorts,
    requiredPorts,
  );
}

const append = (
  map: Map<string, MaterialRate[]>,
  key: string,
  itemId: string,
  perMinute: number,
) => {
  if (perMinute <= 0) return;
  const entries = map.get(key) ?? [];
  const existing = entries.find((entry) => entry.itemId === itemId);
  if (existing)
    entries[entries.indexOf(existing)] = { itemId, perMinute: existing.perMinute! + perMinute };
  else entries.push({ itemId, perMinute });
  map.set(key, entries);
};
