import type { Point } from "./viewport";

export const SNAP_INTERVAL = 32;
export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 96;

export type CanvasNode = Readonly<{
  height: number;
  id: string;
  label: string;
  width: number;
  x: number;
  y: number;
}>;

export type CanvasDocument = Readonly<{
  nodes: readonly CanvasNode[];
  version: 1;
}>;

export type Rectangle = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type CanvasEditorState = Readonly<{
  canRedo: boolean;
  canUndo: boolean;
  document: CanvasDocument;
  selectedIds: readonly string[];
  snapToGrid: boolean;
}>;

export type CanvasEditorAction =
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
  | { type: "selection.move.update"; delta: Point; bypassSnap: boolean }
  | { type: "selection.move.commit" }
  | { type: "selection.move.cancel" }
  | { type: "history.undo" }
  | { type: "history.redo" }
  | { type: "settings.snap"; enabled: boolean };

export type CanvasEditor = Readonly<{
  dispatch: (action: CanvasEditorAction) => void;
  getState: () => CanvasEditorState;
  hitTest: (point: Point) => CanvasNode | undefined;
  subscribe: (listener: () => void) => () => void;
}>;

type Snapshot = Readonly<{
  document: CanvasDocument;
  selectedIds: readonly string[];
}>;

type MoveTransaction = Readonly<{
  snapshot: Snapshot;
  positions: ReadonlyMap<string, Point>;
}>;

type CreateCanvasEditorOptions = {
  document?: CanvasDocument;
  idFactory?: () => string;
  snapToGrid?: boolean;
};

const EMPTY_DOCUMENT: CanvasDocument = { nodes: [], version: 1 };

function snap(value: number) {
  return Math.round(value / SNAP_INTERVAL) * SNAP_INTERVAL;
}

function normalizeRectangle(rectangle: Rectangle): Rectangle {
  return {
    height: Math.abs(rectangle.height),
    width: Math.abs(rectangle.width),
    x: rectangle.width < 0 ? rectangle.x + rectangle.width : rectangle.x,
    y: rectangle.height < 0 ? rectangle.y + rectangle.height : rectangle.y,
  };
}

function intersects(node: CanvasNode, rectangle: Rectangle) {
  const normalized = normalizeRectangle(rectangle);
  return (
    node.x < normalized.x + normalized.width &&
    node.x + node.width > normalized.x &&
    node.y < normalized.y + normalized.height &&
    node.y + node.height > normalized.y
  );
}

function snapshotsEqual(left: Snapshot, right: Snapshot) {
  if (left.document.nodes.length !== right.document.nodes.length) return false;

  return left.document.nodes.every((node, index) => {
    const other = right.document.nodes[index];
    return other &&
      node.id === other.id &&
      node.x === other.x &&
      node.y === other.y &&
      node.width === other.width &&
      node.height === other.height &&
      node.label === other.label;
  });
}

export function createCanvasEditor(
  options: CreateCanvasEditorOptions = {},
): CanvasEditor {
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const listeners = new Set<() => void>();
  const past: Snapshot[] = [];
  const future: Snapshot[] = [];
  let clipboard: readonly CanvasNode[] = [];
  let moveTransaction: MoveTransaction | undefined;
  let nodeSequence = options.document?.nodes.length ?? 0;
  let state: CanvasEditorState = {
    canRedo: false,
    canUndo: false,
    document: options.document ?? EMPTY_DOCUMENT,
    selectedIds: [],
    snapToGrid: options.snapToGrid ?? true,
  };

  const snapshot = (): Snapshot => ({
    document: state.document,
    selectedIds: state.selectedIds,
  });

  const publish = (partial: Partial<CanvasEditorState>) => {
    state = {
      ...state,
      ...partial,
      canRedo: future.length > 0,
      canUndo: past.length > 0,
    };
    listeners.forEach((listener) => listener());
  };

  const commit = (
    document: CanvasDocument,
    selectedIds: readonly string[],
    previous = snapshot(),
  ) => {
    past.push(previous);
    future.length = 0;
    publish({ document, selectedIds });
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

  const selectedNodes = () => {
    const selected = new Set(state.selectedIds);
    return state.document.nodes.filter((node) => selected.has(node.id));
  };

  const dispatch = (action: CanvasEditorAction) => {
    switch (action.type) {
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
        commit(
          { ...state.document, nodes: [...state.document.nodes, node] },
          [node.id],
        );
        return;
      }

      case "selection.clear":
        if (state.selectedIds.length > 0) publish({ selectedIds: [] });
        return;

      case "selection.node": {
        const alreadySelected = state.selectedIds.includes(action.id);
        const selectedIds = action.additive
          ? alreadySelected
            ? state.selectedIds.filter((id) => id !== action.id)
            : [...state.selectedIds, action.id]
          : alreadySelected && state.selectedIds.length === 1
            ? state.selectedIds
            : [action.id];
        publish({ selectedIds });
        return;
      }

      case "selection.marquee": {
        const matchingIds = state.document.nodes
          .filter((node) => intersects(node, action.rectangle))
          .map((node) => node.id);
        publish({ selectedIds: [...new Set([...action.baseIds, ...matchingIds])] });
        return;
      }

      case "selection.delete": {
        if (state.selectedIds.length === 0) return;
        const selected = new Set(state.selectedIds);
        commit(
          {
            ...state.document,
            nodes: state.document.nodes.filter((node) => !selected.has(node.id)),
          },
          [],
        );
        return;
      }

      case "selection.copy":
        clipboard = selectedNodes().map((node) => ({ ...node }));
        return;

      case "selection.paste": {
        if (clipboard.length === 0) return;
        const pasted = duplicateNodes(clipboard);
        clipboard = pasted;
        commit(
          { ...state.document, nodes: [...state.document.nodes, ...pasted] },
          pasted.map((node) => node.id),
        );
        return;
      }

      case "selection.duplicate": {
        const nodes = selectedNodes();
        if (nodes.length === 0) return;
        const duplicates = duplicateNodes(nodes);
        commit(
          { ...state.document, nodes: [...state.document.nodes, ...duplicates] },
          duplicates.map((node) => node.id),
        );
        return;
      }

      case "selection.move.begin": {
        if (state.selectedIds.length === 0 || moveTransaction) return;
        moveTransaction = {
          positions: new Map(
            selectedNodes().map((node) => [node.id, { x: node.x, y: node.y }]),
          ),
          snapshot: snapshot(),
        };
        return;
      }

      case "selection.move.update": {
        if (!moveTransaction) return;
        const anchorId = state.selectedIds[0];
        const anchor = anchorId ? moveTransaction.positions.get(anchorId) : undefined;
        let delta = action.delta;

        if (state.snapToGrid && !action.bypassSnap && anchor) {
          delta = {
            x: snap(anchor.x + delta.x) - anchor.x,
            y: snap(anchor.y + delta.y) - anchor.y,
          };
        }

        const nodes = state.document.nodes.map((node) => {
          const origin = moveTransaction?.positions.get(node.id);
          return origin
            ? { ...node, x: origin.x + delta.x, y: origin.y + delta.y }
            : node;
        });
        publish({ document: { ...state.document, nodes } });
        return;
      }

      case "selection.move.commit": {
        if (!moveTransaction) return;
        const previous = moveTransaction.snapshot;
        moveTransaction = undefined;
        const current = snapshot();
        if (snapshotsEqual(previous, current)) return;
        past.push(previous);
        future.length = 0;
        publish({});
        return;
      }

      case "selection.move.cancel":
        if (moveTransaction) {
          const previous = moveTransaction.snapshot;
          moveTransaction = undefined;
          publish(previous);
        }
        return;

      case "history.undo": {
        const previous = past.pop();
        if (!previous) return;
        future.push(snapshot());
        moveTransaction = undefined;
        publish(previous);
        return;
      }

      case "history.redo": {
        const next = future.pop();
        if (!next) return;
        past.push(snapshot());
        moveTransaction = undefined;
        publish(next);
        return;
      }

      case "settings.snap":
        if (state.snapToGrid !== action.enabled) {
          publish({ snapToGrid: action.enabled });
        }
        return;
    }
  };

  return {
    dispatch,
    getState: () => state,
    hitTest: (point) => {
      for (let index = state.document.nodes.length - 1; index >= 0; index -= 1) {
        const node = state.document.nodes[index];
        if (
          node &&
          point.x >= node.x &&
          point.x <= node.x + node.width &&
          point.y >= node.y &&
          point.y <= node.y + node.height
        ) {
          return node;
        }
      }
      return undefined;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
