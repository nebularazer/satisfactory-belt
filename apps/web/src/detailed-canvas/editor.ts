import {
  analyzeDetailedPlan,
  type DetailedFlowAnalysis,
  type LogisticsTier,
  type PhysicalConnection,
  type RoutingRule,
} from "@satisfactory-belt/planning";

import type { Point } from "@/canvas/geometry";

import {
  detailedPlanFromCanvas,
  type DetailedCanvasDocument,
} from "./document";

export type DetailedCanvasEditorState = Readonly<{
  analysis: DetailedFlowAnalysis;
  analysisRevision: number;
  canRedo: boolean;
  canUndo: boolean;
  document: DetailedCanvasDocument;
  selectedConnectionIds: readonly string[];
  selectedNodeIds: readonly string[];
}>;

export type DetailedCanvasEditorAction =
  | { type: "connection.create"; connection: PhysicalConnection }
  | { type: "connection.delete"; id: string }
  | { type: "connection.tier"; id: string; tierId: string }
  | { type: "history.redo" }
  | { type: "history.undo" }
  | { type: "node.create"; node: DetailedCanvasDocument["nodes"][number] }
  | { type: "node.delete"; id: string }
  | { type: "node.move"; delta: Point; ids: readonly string[] }
  | { type: "node.routing"; id: string; rules: readonly RoutingRule[] }
  | {
      type: "selection.set";
      connectionIds?: readonly string[];
      nodeIds?: readonly string[];
    }
  | { type: "selection.copy" }
  | { type: "selection.delete" }
  | { type: "selection.duplicate" }
  | { type: "selection.paste" };

type Snapshot = Readonly<{
  document: DetailedCanvasDocument;
  selectedConnectionIds: readonly string[];
  selectedNodeIds: readonly string[];
}>;

type HistoryEntry = Readonly<{
  change: Readonly<{
    connectionIds?: readonly string[];
    nodeIds?: readonly string[];
  }>;
  semantic: boolean;
  snapshot: Snapshot;
}>;

type AnalysisScheduler = Readonly<{
  analyze: (
    plan: ReturnType<typeof detailedPlanFromCanvas>,
    change?: Readonly<{
      connectionIds?: readonly string[];
      nodeIds?: readonly string[];
    }>,
  ) => number;
}>;

export function createDetailedCanvasEditor(
  initialDocument: DetailedCanvasDocument,
  scheduler?: AnalysisScheduler,
  idFactory: () => string = () => crypto.randomUUID(),
) {
  const initialPlan = detailedPlanFromCanvas(initialDocument);
  const past: HistoryEntry[] = [];
  const future: HistoryEntry[] = [];
  let clipboard: Readonly<{
    connections: readonly PhysicalConnection[];
    nodes: DetailedCanvasDocument["nodes"];
  }> = { connections: [], nodes: [] };
  const listeners = new Set<() => void>();
  let state: DetailedCanvasEditorState = {
    analysis: analyzeDetailedPlan(initialPlan),
    analysisRevision: 1,
    canRedo: false,
    canUndo: false,
    document: initialDocument,
    selectedConnectionIds: [],
    selectedNodeIds: [],
  };
  const publish = (next: Partial<DetailedCanvasEditorState>) => {
    state = {
      ...state,
      ...next,
      canRedo: future.length > 0,
      canUndo: past.length > 0,
    };
    listeners.forEach((listener) => listener());
  };
  const snapshot = (): Snapshot => ({
    document: state.document,
    selectedConnectionIds: state.selectedConnectionIds,
    selectedNodeIds: state.selectedNodeIds,
  });
  const commit = (
    document: DetailedCanvasDocument,
    semantic: boolean,
    change: Readonly<{
      connectionIds?: readonly string[];
      nodeIds?: readonly string[];
    }> = {},
  ) => {
    const before = snapshot();
    const plan = detailedPlanFromCanvas(document);
    past.push({ change, semantic, snapshot: before });
    future.length = 0;
    const analysisRevision = semantic
      ? (scheduler?.analyze(plan, change) ?? state.analysisRevision + 1)
      : state.analysisRevision;
    publish({
      ...(semantic && !scheduler
        ? { analysis: analyzeDetailedPlan(plan) }
        : {}),
      analysisRevision,
      document,
    });
  };
  const duplicate = (
    nodes: DetailedCanvasDocument["nodes"],
    connections: readonly PhysicalConnection[],
  ) => {
    const nodeIds = new Map<string, string>();
    const copies = nodes.map((node) => {
      const id = idFactory();
      nodeIds.set(node.configuration.id, id);
      const configuration =
        node.configuration.kind === "process"
          ? {
              ...node.configuration,
              id,
              instances: node.configuration.instances.map(
                (instance, index) => ({
                  ...instance,
                  id: `${id}:instance-${index + 1}`,
                }),
              ),
            }
          : { ...node.configuration, id };
      return {
        ...node,
        configuration,
        label: `${node.label} copy`,
        x: node.x + 16,
        y: node.y + 16,
      };
    });
    const copiedConnections = connections.flatMap((connection) => {
      const fromNodeId = nodeIds.get(connection.from.nodeId);
      const toNodeId = nodeIds.get(connection.to.nodeId);
      return fromNodeId && toNodeId
        ? [
            {
              ...connection,
              from: { ...connection.from, nodeId: fromNodeId },
              id: idFactory(),
              to: { ...connection.to, nodeId: toNodeId },
            },
          ]
        : [];
    });
    return { connections: copiedConnections, nodes: copies };
  };
  const dispatch = (action: DetailedCanvasEditorAction) => {
    switch (action.type) {
      case "connection.create":
        commit(
          {
            ...state.document,
            connections: [...state.document.connections, action.connection],
          },
          true,
          { connectionIds: [action.connection.id] },
        );
        return;
      case "connection.delete":
        commit(
          {
            ...state.document,
            connections: state.document.connections.filter(
              ({ id }) => id !== action.id,
            ),
          },
          true,
          { connectionIds: [action.id] },
        );
        return;
      case "connection.tier": {
        const tier = state.document.tiers.find(
          ({ id }) => id === action.tierId,
        );
        const connection = state.document.connections.find(
          ({ id }) => id === action.id,
        );
        if (!tier || !connection) return;
        commit(
          {
            ...state.document,
            connections: state.document.connections.map((candidate) =>
              candidate.id === action.id
                ? { ...candidate, tierId: action.tierId }
                : candidate,
            ),
          },
          true,
          { connectionIds: [action.id] },
        );
        return;
      }
      case "node.create":
        commit(
          {
            ...state.document,
            nodes: [...state.document.nodes, action.node],
          },
          true,
          { nodeIds: [action.node.configuration.id] },
        );
        return;
      case "node.delete": {
        const connectionIds = state.document.connections
          .filter(
            ({ from, to }) =>
              from.nodeId === action.id || to.nodeId === action.id,
          )
          .map(({ id }) => id);
        commit(
          {
            ...state.document,
            connections: state.document.connections.filter(
              ({ id }) => !connectionIds.includes(id),
            ),
            nodes: state.document.nodes.filter(
              ({ configuration }) => configuration.id !== action.id,
            ),
          },
          true,
          { connectionIds, nodeIds: [action.id] },
        );
        return;
      }
      case "node.routing":
        commit(
          {
            ...state.document,
            nodes: state.document.nodes.map((node) =>
              node.configuration.id === action.id
                ? { ...node, routingRules: action.rules }
                : node,
            ),
          },
          true,
          { nodeIds: [action.id] },
        );
        return;
      case "node.move":
        if (!action.ids.length || (!action.delta.x && !action.delta.y)) return;
        commit(
          {
            ...state.document,
            nodes: state.document.nodes.map((node) =>
              action.ids.includes(node.configuration.id)
                ? {
                    ...node,
                    x: node.x + action.delta.x,
                    y: node.y + action.delta.y,
                  }
                : node,
            ),
          },
          false,
        );
        return;
      case "selection.set":
        publish({
          selectedConnectionIds: action.connectionIds ?? [],
          selectedNodeIds: action.nodeIds ?? [],
        });
        return;
      case "selection.copy": {
        const selected = new Set(state.selectedNodeIds);
        clipboard = {
          connections: state.document.connections.filter(
            ({ from, to }) =>
              selected.has(from.nodeId) && selected.has(to.nodeId),
          ),
          nodes: state.document.nodes.filter(({ configuration }) =>
            selected.has(configuration.id),
          ),
        };
        return;
      }
      case "selection.delete": {
        const selectedNodes = new Set(state.selectedNodeIds);
        const selectedConnections = new Set(state.selectedConnectionIds);
        const removedConnections = state.document.connections.filter(
          ({ from, id, to }) =>
            selectedConnections.has(id) ||
            selectedNodes.has(from.nodeId) ||
            selectedNodes.has(to.nodeId),
        );
        if (!selectedNodes.size && !removedConnections.length) return;
        commit(
          {
            ...state.document,
            connections: state.document.connections.filter(
              ({ id }) =>
                !removedConnections.some(
                  ({ id: removedId }) => removedId === id,
                ),
            ),
            nodes: state.document.nodes.filter(
              ({ configuration }) => !selectedNodes.has(configuration.id),
            ),
          },
          true,
          {
            connectionIds: removedConnections.map(({ id }) => id),
            nodeIds: [...selectedNodes],
          },
        );
        publish({ selectedConnectionIds: [], selectedNodeIds: [] });
        return;
      }
      case "selection.duplicate":
      case "selection.paste": {
        const source =
          action.type === "selection.paste"
            ? clipboard
            : (() => {
                const selected = new Set(state.selectedNodeIds);
                return {
                  connections: state.document.connections.filter(
                    ({ from, to }) =>
                      selected.has(from.nodeId) && selected.has(to.nodeId),
                  ),
                  nodes: state.document.nodes.filter(({ configuration }) =>
                    selected.has(configuration.id),
                  ),
                };
              })();
        if (!source.nodes.length) return;
        const copies = duplicate(source.nodes, source.connections);
        commit(
          {
            ...state.document,
            connections: [...state.document.connections, ...copies.connections],
            nodes: [...state.document.nodes, ...copies.nodes],
          },
          true,
          {
            connectionIds: copies.connections.map(({ id }) => id),
            nodeIds: copies.nodes.map(({ configuration }) => configuration.id),
          },
        );
        publish({
          selectedConnectionIds: [],
          selectedNodeIds: copies.nodes.map(
            ({ configuration }) => configuration.id,
          ),
        });
        if (action.type === "selection.paste") clipboard = copies;
        return;
      }
      case "history.undo": {
        const entry = past.pop();
        if (!entry) return;
        future.push({
          change: entry.change,
          semantic: entry.semantic,
          snapshot: snapshot(),
        });
        const plan = detailedPlanFromCanvas(entry.snapshot.document);
        const analysisRevision = entry.semantic
          ? (scheduler?.analyze(plan, entry.change) ??
            state.analysisRevision + 1)
          : state.analysisRevision;
        publish({
          ...(entry.semantic && !scheduler
            ? { analysis: analyzeDetailedPlan(plan) }
            : {}),
          analysisRevision,
          ...entry.snapshot,
        });
        return;
      }
      case "history.redo": {
        const entry = future.pop();
        if (!entry) return;
        past.push({
          change: entry.change,
          semantic: entry.semantic,
          snapshot: snapshot(),
        });
        const plan = detailedPlanFromCanvas(entry.snapshot.document);
        const analysisRevision = entry.semantic
          ? (scheduler?.analyze(plan, entry.change) ??
            state.analysisRevision + 1)
          : state.analysisRevision;
        publish({
          ...(entry.semantic && !scheduler
            ? { analysis: analyzeDetailedPlan(plan) }
            : {}),
          analysisRevision,
          ...entry.snapshot,
        });
      }
    }
  };

  return {
    dispatch,
    getState: () => state,
    replaceAnalysis(revision: number, analysis: DetailedFlowAnalysis) {
      if (revision === state.analysisRevision) publish({ analysis });
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type DetailedCanvasEditor = ReturnType<
  typeof createDetailedCanvasEditor
>;

export type DetailedConnectionPresentation = Readonly<{
  descriptorRates: readonly Readonly<{
    itemId: string;
    ratePerMinute: number;
  }>[];
  diagnosticCodes: readonly string[];
  direction: "forward";
  id: string;
  kind: PhysicalConnection["kind"];
  tier?: LogisticsTier;
  utilization: number;
}>;

export function presentDetailedConnections(
  document: DetailedCanvasDocument,
  analysis: DetailedFlowAnalysis,
): readonly DetailedConnectionPresentation[] {
  return document.connections.map((connection) => {
    const flows = analysis.connectionFlows.filter(
      ({ connectionId }) => connectionId === connection.id,
    );
    const profile = analysis.conveyorProfiles.find(
      ({ connectionId }) => connectionId === connection.id,
    );
    const tier = document.tiers.find(({ id }) => id === connection.tierId);
    const total = flows.reduce(
      (sum, { ratePerMinute }) => sum + ratePerMinute,
      0,
    );
    return {
      descriptorRates: flows.map(({ itemId, ratePerMinute }) => ({
        itemId,
        ratePerMinute,
      })),
      diagnosticCodes: analysis.diagnostics
        .filter(({ connectionId }) => connectionId === connection.id)
        .map(({ code }) => code),
      direction: "forward",
      id: connection.id,
      kind: connection.kind,
      ...(tier ? { tier } : {}),
      utilization:
        profile?.utilization ?? (tier ? total / tier.capacityPerMinute : 0),
    };
  });
}
