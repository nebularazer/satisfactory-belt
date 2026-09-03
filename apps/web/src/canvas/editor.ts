import {
  EMPTY_CANVAS_DOCUMENT,
  type CanvasDocument,
  type CanvasNode,
} from "./document";
import type { Point, Rectangle } from "./geometry";
import { createCanvasSpatialIndex } from "./spatial-index";

export const SNAP_INTERVAL = 32;
export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 96;
export const HISTORY_LIMIT = 100;

export type CanvasEditorState = Readonly<{
  canRedo: boolean;
  canUndo: boolean;
  document: CanvasDocument;
  moveDelta: Point | null;
  selectedIds: readonly string[];
  snapToGrid: boolean;
}>;

type CanvasEditorChangeData =
  | { kind: "document" }
  | { kind: "selection"; nodeIds: readonly string[] }
  | { delta: Point; kind: "move"; nodeIds: readonly string[] }
  | { kind: "settings" };

export type CanvasEditorChange = Readonly<
  CanvasEditorChangeData & { updateTimeMs: number }
>;

export type CanvasEditorAction =
  | { type: "document.replace"; document: CanvasDocument }
  | { type: "document.reset" }
  | { type: "node.create"; at: Point }
  | { type: "selection.clear" }
  | { type: "selection.delete" }
  | { type: "selection.duplicate" }
  | { type: "selection.copy" }
  | { type: "selection.paste" }
  | { type: "selection.node"; id: string; additive: boolean }
  | {
      type: "selection.marquee";
      rectangle: Rectangle;
      baseIds: readonly string[];
    }
  | { type: "selection.move.begin" }
  | { type: "selection.move.update"; delta: Point }
  | { type: "selection.move.commit" }
  | { type: "selection.move.cancel" }
  | { type: "selection.nudge"; delta: Point }
  | { type: "history.undo" }
  | { type: "history.redo" }
  | { type: "settings.snap"; enabled: boolean };

export type CanvasEditor = Readonly<{
  dispatch: (action: CanvasEditorAction) => void;
  getBounds: (scope: "all" | "selection") => Rectangle | undefined;
  getState: () => CanvasEditorState;
  hitTest: (point: Point) => CanvasNode | undefined;
  query: (rectangle: Rectangle) => readonly CanvasNode[];
  subscribe: (listener: (change: CanvasEditorChange) => void) => () => void;
}>;

type IndexedNode = Readonly<{
  index: number;
  node: CanvasNode;
}>;

type HistoryEntry = Readonly<{
  after: readonly IndexedNode[];
  afterSelection: readonly string[];
  before: readonly IndexedNode[];
  beforeSelection: readonly string[];
}>;

type MoveTransaction = {
  before: readonly IndexedNode[];
  delta: Point;
  selectionBefore: readonly string[];
};

type CreateCanvasEditorOptions = {
  document?: CanvasDocument;
  idFactory?: () => string;
  snapToGrid?: boolean;
};

function snap(value: number) {
  return Math.round(value / SNAP_INTERVAL) * SNAP_INTERVAL;
}

function applyPatch(
  document: CanvasDocument,
  source: readonly IndexedNode[],
  target: readonly IndexedNode[],
): CanvasDocument {
  const affectedIds = new Set([
    ...source.map(({ node }) => node.id),
    ...target.map(({ node }) => node.id),
  ]);
  const nodes = document.nodes.filter((node) => !affectedIds.has(node.id));

  for (const { index, node } of [...target].sort((a, b) => a.index - b.index)) {
    nodes.splice(Math.max(0, Math.min(index, nodes.length)), 0, node);
  }

  return { ...document, nodes };
}

function boundsFor(nodes: readonly CanvasNode[]): Rectangle | undefined {
  if (nodes.length === 0) return undefined;
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  return { height: bottom - top, width: right - left, x: left, y: top };
}

export function createCanvasEditor(
  options: CreateCanvasEditorOptions = {},
): CanvasEditor {
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const listeners = new Set<(change: CanvasEditorChange) => void>();
  const past: HistoryEntry[] = [];
  const future: HistoryEntry[] = [];
  let clipboard: readonly CanvasNode[] = [];
  let dispatchStartedAt = 0;
  let moveTransaction: MoveTransaction | undefined;
  let nodeSequence = options.document?.nodes.length ?? 0;
  let state: CanvasEditorState = {
    canRedo: false,
    canUndo: false,
    document: options.document ?? EMPTY_CANVAS_DOCUMENT,
    moveDelta: null,
    selectedIds: [],
    snapToGrid: options.snapToGrid ?? true,
  };
  const spatialIndex = createCanvasSpatialIndex(state.document);

  const publish = (
    partial: Partial<CanvasEditorState>,
    change: CanvasEditorChangeData,
  ) => {
    state = {
      ...state,
      ...partial,
      canRedo: future.length > 0,
      canUndo: past.length > 0,
    };
    const updateTimeMs = performance.now() - dispatchStartedAt;
    listeners.forEach((listener) => listener({ ...change, updateTimeMs }));
  };

  const indexedSelection = (): readonly IndexedNode[] =>
    state.selectedIds.flatMap((id) => {
      const node = spatialIndex.get(id);
      const index = spatialIndex.indexOf(id);
      return node && index !== undefined ? [{ index, node }] : [];
    });

  const commit = (
    document: CanvasDocument,
    selectedIds: readonly string[],
    entry: HistoryEntry,
  ) => {
    past.push(entry);
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
    spatialIndex.apply(
      document,
      entry.before.map(({ node }) => node),
      entry.after.map(({ node }) => node),
    );
    publish({ document, moveDelta: null, selectedIds }, { kind: "document" });
  };

  const duplicateNodes = (nodes: readonly CanvasNode[]) => {
    const offset = SNAP_INTERVAL;
    return nodes.map((node) => ({
      ...node,
      id: idFactory(),
      label: `${node.label} copy`,
      x: node.x + offset,
      y: node.y + offset,
    }));
  };

  const dispatch = (action: CanvasEditorAction) => {
    dispatchStartedAt = performance.now();

    switch (action.type) {
      case "document.replace":
        past.length = 0;
        future.length = 0;
        clipboard = [];
        moveTransaction = undefined;
        nodeSequence = action.document.nodes.length;
        spatialIndex.replace(action.document);
        publish(
          { document: action.document, moveDelta: null, selectedIds: [] },
          { kind: "document" },
        );
        return;

      case "document.reset":
        past.length = 0;
        future.length = 0;
        clipboard = [];
        moveTransaction = undefined;
        nodeSequence = 0;
        spatialIndex.replace(EMPTY_CANVAS_DOCUMENT);
        publish(
          {
            document: EMPTY_CANVAS_DOCUMENT,
            moveDelta: null,
            selectedIds: [],
          },
          { kind: "document" },
        );
        return;

      case "node.create": {
        nodeSequence += 1;
        const x = action.at.x - NODE_WIDTH / 2;
        const y = action.at.y - NODE_HEIGHT / 2;
        const node: CanvasNode = {
          height: NODE_HEIGHT,
          id: idFactory(),
          label: `Node ${nodeSequence}`,
          width: NODE_WIDTH,
          x: state.snapToGrid ? snap(x) : x,
          y: state.snapToGrid ? snap(y) : y,
        };
        const index = state.document.nodes.length;
        const selectedIds = [node.id];
        commit(
          { ...state.document, nodes: [...state.document.nodes, node] },
          selectedIds,
          {
            after: [{ index, node }],
            afterSelection: selectedIds,
            before: [],
            beforeSelection: state.selectedIds,
          },
        );
        return;
      }

      case "selection.clear":
        if (state.selectedIds.length > 0) {
          const nodeIds = state.selectedIds;
          publish({ selectedIds: [] }, { kind: "selection", nodeIds });
        }
        return;

      case "selection.node": {
        if (!spatialIndex.get(action.id)) return;
        const alreadySelected = state.selectedIds.includes(action.id);
        const selectedIds = action.additive
          ? alreadySelected
            ? state.selectedIds.filter((id) => id !== action.id)
            : [...state.selectedIds, action.id]
          : alreadySelected && state.selectedIds.length === 1
            ? state.selectedIds
            : [action.id];
        if (selectedIds === state.selectedIds) return;
        publish(
          { selectedIds },
          {
            kind: "selection",
            nodeIds: [...new Set([...state.selectedIds, ...selectedIds])],
          },
        );
        return;
      }

      case "selection.marquee": {
        const baseIds = action.baseIds.filter((id) => spatialIndex.get(id));
        const matchingIds = spatialIndex
          .query(action.rectangle)
          .map((node) => node.id);
        const selectedIds = [...new Set([...baseIds, ...matchingIds])];
        publish(
          { selectedIds },
          {
            kind: "selection",
            nodeIds: [...new Set([...state.selectedIds, ...selectedIds])],
          },
        );
        return;
      }

      case "selection.delete": {
        if (state.selectedIds.length === 0) return;
        const before = indexedSelection();
        const selected = new Set(state.selectedIds);
        commit(
          {
            ...state.document,
            nodes: state.document.nodes.filter(
              (node) => !selected.has(node.id),
            ),
          },
          [],
          {
            after: [],
            afterSelection: [],
            before,
            beforeSelection: state.selectedIds,
          },
        );
        return;
      }

      case "selection.copy":
        clipboard = indexedSelection().map(({ node }) => ({ ...node }));
        return;

      case "selection.paste": {
        if (clipboard.length === 0) return;
        const pasted = duplicateNodes(clipboard);
        const startIndex = state.document.nodes.length;
        const selectedIds = pasted.map((node) => node.id);
        commit(
          { ...state.document, nodes: [...state.document.nodes, ...pasted] },
          selectedIds,
          {
            after: pasted.map((node, index) => ({
              index: startIndex + index,
              node,
            })),
            afterSelection: selectedIds,
            before: [],
            beforeSelection: state.selectedIds,
          },
        );
        clipboard = pasted;
        return;
      }

      case "selection.duplicate": {
        const selected = indexedSelection().map(({ node }) => node);
        if (selected.length === 0) return;
        const duplicates = duplicateNodes(selected);
        const startIndex = state.document.nodes.length;
        const selectedIds = duplicates.map((node) => node.id);
        commit(
          {
            ...state.document,
            nodes: [...state.document.nodes, ...duplicates],
          },
          selectedIds,
          {
            after: duplicates.map((node, index) => ({
              index: startIndex + index,
              node,
            })),
            afterSelection: selectedIds,
            before: [],
            beforeSelection: state.selectedIds,
          },
        );
        return;
      }

      case "selection.move.begin": {
        if (state.selectedIds.length === 0 || moveTransaction) return;
        moveTransaction = {
          before: indexedSelection(),
          delta: { x: 0, y: 0 },
          selectionBefore: state.selectedIds,
        };
        return;
      }

      case "selection.move.update": {
        if (!moveTransaction) return;
        const anchor = moveTransaction.before[0]?.node;
        let delta = action.delta;

        if (state.snapToGrid && anchor) {
          delta = {
            x: snap(anchor.x + delta.x) - anchor.x,
            y: snap(anchor.y + delta.y) - anchor.y,
          };
        }

        if (
          moveTransaction.delta.x === delta.x &&
          moveTransaction.delta.y === delta.y
        ) {
          return;
        }

        moveTransaction.delta = delta;
        publish(
          { moveDelta: delta },
          { delta, kind: "move", nodeIds: state.selectedIds },
        );
        return;
      }

      case "selection.move.commit": {
        if (!moveTransaction) return;
        const transaction = moveTransaction;
        moveTransaction = undefined;
        if (transaction.delta.x === 0 && transaction.delta.y === 0) {
          if (state.moveDelta) {
            publish(
              { moveDelta: null },
              {
                delta: transaction.delta,
                kind: "move",
                nodeIds: state.selectedIds,
              },
            );
          }
          return;
        }

        const after = transaction.before.map(({ index, node }) => ({
          index,
          node: {
            ...node,
            x: node.x + transaction.delta.x,
            y: node.y + transaction.delta.y,
          },
        }));
        const document = applyPatch(state.document, transaction.before, after);
        commit(document, state.selectedIds, {
          after,
          afterSelection: state.selectedIds,
          before: transaction.before,
          beforeSelection: transaction.selectionBefore,
        });
        return;
      }

      case "selection.move.cancel":
        if (moveTransaction) {
          const nodeIds = state.selectedIds;
          moveTransaction = undefined;
          publish(
            { moveDelta: null },
            { delta: { x: 0, y: 0 }, kind: "move", nodeIds },
          );
        }
        return;

      case "selection.nudge": {
        const before = indexedSelection();
        if (
          before.length === 0 ||
          (action.delta.x === 0 && action.delta.y === 0)
        ) {
          return;
        }
        const after = before.map(({ index, node }) => ({
          index,
          node: {
            ...node,
            x: node.x + action.delta.x,
            y: node.y + action.delta.y,
          },
        }));
        commit(applyPatch(state.document, before, after), state.selectedIds, {
          after,
          afterSelection: state.selectedIds,
          before,
          beforeSelection: state.selectedIds,
        });
        return;
      }

      case "history.undo": {
        const entry = past.pop();
        if (!entry) return;
        future.push(entry);
        moveTransaction = undefined;
        const document = applyPatch(state.document, entry.after, entry.before);
        spatialIndex.apply(
          document,
          entry.after.map(({ node }) => node),
          entry.before.map(({ node }) => node),
        );
        publish(
          {
            document,
            moveDelta: null,
            selectedIds: entry.beforeSelection,
          },
          { kind: "document" },
        );
        return;
      }

      case "history.redo": {
        const entry = future.pop();
        if (!entry) return;
        past.push(entry);
        moveTransaction = undefined;
        const document = applyPatch(state.document, entry.before, entry.after);
        spatialIndex.apply(
          document,
          entry.before.map(({ node }) => node),
          entry.after.map(({ node }) => node),
        );
        publish(
          {
            document,
            moveDelta: null,
            selectedIds: entry.afterSelection,
          },
          { kind: "document" },
        );
        return;
      }

      case "settings.snap":
        if (state.snapToGrid !== action.enabled) {
          publish({ snapToGrid: action.enabled }, { kind: "settings" });
        }
        return;
    }
  };

  return {
    dispatch,
    getBounds: (scope) => {
      const nodes =
        scope === "all"
          ? state.document.nodes
          : indexedSelection().map(({ node }) => node);
      const bounds = boundsFor(nodes);
      return bounds && scope === "selection" && state.moveDelta
        ? {
            ...bounds,
            x: bounds.x + state.moveDelta.x,
            y: bounds.y + state.moveDelta.y,
          }
        : bounds;
    },
    getState: () => state,
    hitTest: (point) => spatialIndex.hitTest(point),
    query: (rectangle) => spatialIndex.query(rectangle),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
