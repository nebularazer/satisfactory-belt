import {
  createNode,
  type NodeConfiguration,
  type NodeTemplate,
} from "@satisfactory-belt/production";
import {
  BasicPlanError,
  createBasicPlan,
  type MaterialEndpoint,
  type MaterialLink,
} from "@satisfactory-belt/planning";

import {
  EMPTY_CANVAS_DOCUMENT,
  canvasNodeId,
  type CanvasDocument,
  type CanvasNode,
  type CanvasRouterPriorities,
  type CanvasRouterRules,
} from "./document";
import type { Point, Rectangle } from "./geometry";
import { GRID_INTERVAL, SNAP_INTERVAL } from "./grid";
import { nodeCardLayout } from "./node-card-layout";
import { createCanvasSpatialIndex } from "./spatial-index";
import {
  hitTestMaterialPort,
  type CanvasMaterialPort,
} from "./material-port-geometry";
import {
  createMaterialLinkIndex,
  type MaterialLinkPath,
} from "./material-link-geometry";

export const NODE_WIDTH = GRID_INTERVAL * 8;
export const NODE_HEIGHT = GRID_INTERVAL * 8;
export const HISTORY_LIMIT = 100;

export type CanvasEditorState = Readonly<{
  canRedo: boolean;
  canUndo: boolean;
  document: CanvasDocument;
  moveDelta: Point | null;
  selectedLinkIds: readonly string[];
  selectedIds: readonly string[];
  connectionError?: Readonly<{ code: string; message: string }>;
  connectionPreview?: Readonly<{
    current: Point;
    from: MaterialEndpoint;
    target?: MaterialEndpoint;
  }>;
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
  | {
      type: "link.create";
      from: MaterialEndpoint;
      id?: string;
      to: MaterialEndpoint;
    }
  | { type: "link.delete"; id: string }
  | {
      type: "link.preview";
      current: Point;
      from: MaterialEndpoint;
      target?: MaterialEndpoint;
    }
  | { type: "link.preview.cancel" }
  | { type: "selection.link"; additive: boolean; id: string }
  | {
      type: "node.configure";
      configuration: NodeConfiguration;
      id: string;
    }
  | {
      type: "node.ports.reorder";
      direction: "input" | "output";
      id: string;
      portIds: readonly string[];
    }
  | {
      type: "node.router.priorities";
      id: string;
      priorities: CanvasRouterPriorities;
    }
  | {
      type: "node.router.rules";
      id: string;
      rules: CanvasRouterRules;
    }
  | {
      type: "node.create";
      at: Point;
      label?: string;
      node: NodeTemplate;
    }
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
  hitTestLink: (point: Point, radius: number) => MaterialLink | undefined;
  hitTestPort: (point: Point, radius: number) => CanvasMaterialPort | undefined;
  query: (rectangle: Rectangle) => readonly CanvasNode[];
  queryLinks: (rectangle: Rectangle) => readonly MaterialLinkPath[];
  subscribe: (listener: (change: CanvasEditorChange) => void) => () => void;
}>;

type IndexedNode = Readonly<{
  index: number;
  node: CanvasNode;
}>;

type IndexedLink = Readonly<{
  index: number;
  link: MaterialLink;
}>;

type HistoryEntry = Readonly<{
  after: readonly IndexedNode[];
  afterLinks?: readonly IndexedLink[];
  afterLinkSelection?: readonly string[];
  afterSelection: readonly string[];
  before: readonly IndexedNode[];
  beforeLinks?: readonly IndexedLink[];
  beforeLinkSelection?: readonly string[];
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

function normalizeLegacyNodeCardSizes(
  document: CanvasDocument,
): CanvasDocument {
  let changed = false;
  const nodes = document.nodes.map((node) => {
    const layout = nodeCardLayout(node.configuration);
    if (layout.width === node.width && layout.height === node.height)
      return node;
    const legacyFullSize =
      node.width === NODE_WIDTH && node.height === NODE_HEIGHT;
    const legacyPassiveSize =
      (node.configuration.kind === "router" &&
        node.width === GRID_INTERVAL * 6 &&
        node.height === GRID_INTERVAL * 5) ||
      (node.configuration.kind === "buffer" &&
        node.width === GRID_INTERVAL * 8 &&
        node.height === GRID_INTERVAL * 6);
    if (!legacyFullSize && !legacyPassiveSize) return node;

    changed = true;
    return { ...node, height: layout.height, width: layout.width };
  });
  return changed ? { ...document, nodes } : document;
}

function applyPatch(
  document: CanvasDocument,
  source: readonly IndexedNode[],
  target: readonly IndexedNode[],
  sourceLinks: readonly IndexedLink[] = [],
  targetLinks: readonly IndexedLink[] = [],
): CanvasDocument {
  const affectedIds = new Set([
    ...source.map(({ node }) => canvasNodeId(node)),
    ...target.map(({ node }) => canvasNodeId(node)),
  ]);
  const nodes = document.nodes.filter(
    (node) => !affectedIds.has(canvasNodeId(node)),
  );

  for (const { index, node } of [...target].sort((a, b) => a.index - b.index)) {
    nodes.splice(Math.max(0, Math.min(index, nodes.length)), 0, node);
  }
  const affectedLinkIds = new Set([
    ...sourceLinks.map(({ link }) => link.id),
    ...targetLinks.map(({ link }) => link.id),
  ]);
  const materialLinks = document.materialLinks.filter(
    (link) => !affectedLinkIds.has(link.id),
  );
  for (const { index, link } of [...targetLinks].sort(
    (a, b) => a.index - b.index,
  )) {
    materialLinks.splice(
      Math.max(0, Math.min(index, materialLinks.length)),
      0,
      link,
    );
  }

  return { ...document, materialLinks, nodes };
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
  const initialDocument = normalizeLegacyNodeCardSizes(
    options.document ?? EMPTY_CANVAS_DOCUMENT,
  );
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const listeners = new Set<(change: CanvasEditorChange) => void>();
  const past: HistoryEntry[] = [];
  const future: HistoryEntry[] = [];
  let clipboard: Readonly<{
    links: readonly MaterialLink[];
    nodes: readonly CanvasNode[];
  }> = { links: [], nodes: [] };
  let dispatchStartedAt = 0;
  let moveTransaction: MoveTransaction | undefined;
  let nodeSequence = initialDocument.nodes.length;
  let state: CanvasEditorState = {
    canRedo: false,
    canUndo: false,
    document: initialDocument,
    moveDelta: null,
    selectedLinkIds: [],
    selectedIds: [],
    snapToGrid: options.snapToGrid ?? true,
  };
  const spatialIndex = createCanvasSpatialIndex(state.document);
  const linkIndex = createMaterialLinkIndex(state.document);

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
    selectedLinkIds: readonly string[] = state.selectedLinkIds,
  ) => {
    createBasicPlan({
      materialLinks: document.materialLinks,
      nodes: document.nodes.map(({ configuration }) => configuration),
    });
    past.push(entry);
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
    spatialIndex.apply(
      document,
      entry.before.map(({ node }) => node),
      entry.after.map(({ node }) => node),
    );
    linkIndex.replace(document);
    publish(
      {
        connectionError: undefined,
        document,
        moveDelta: null,
        selectedIds,
        selectedLinkIds,
      },
      { kind: "document" },
    );
  };

  const duplicateDocument = (
    nodes: readonly CanvasNode[],
    links: readonly MaterialLink[],
  ) => {
    const offset = SNAP_INTERVAL;
    const ids = new Map<string, string>();
    const duplicates = nodes.map((node) => {
      const id = idFactory();
      ids.set(canvasNodeId(node), id);
      return {
        ...node,
        configuration: { ...node.configuration, id },
        label: `${node.label} copy`,
        x: node.x + offset,
        y: node.y + offset,
      };
    });
    const duplicatedLinks = links.flatMap((link) => {
      const fromNodeId = ids.get(link.from.nodeId);
      const toNodeId = ids.get(link.to.nodeId);
      return fromNodeId && toNodeId
        ? [
            {
              from: { ...link.from, nodeId: fromNodeId },
              id: idFactory(),
              to: { ...link.to, nodeId: toNodeId },
            },
          ]
        : [];
    });
    return { links: duplicatedLinks, nodes: duplicates };
  };

  const dispatch = (action: CanvasEditorAction) => {
    dispatchStartedAt = performance.now();

    switch (action.type) {
      case "document.replace": {
        const document = normalizeLegacyNodeCardSizes(action.document);
        past.length = 0;
        future.length = 0;
        clipboard = { links: [], nodes: [] };
        moveTransaction = undefined;
        nodeSequence = document.nodes.length;
        spatialIndex.replace(document);
        linkIndex.replace(document);
        publish(
          {
            connectionError: undefined,
            connectionPreview: undefined,
            document,
            moveDelta: null,
            selectedIds: [],
            selectedLinkIds: [],
          },
          { kind: "document" },
        );
        return;
      }

      case "document.reset":
        past.length = 0;
        future.length = 0;
        clipboard = { links: [], nodes: [] };
        moveTransaction = undefined;
        nodeSequence = 0;
        spatialIndex.replace(EMPTY_CANVAS_DOCUMENT);
        linkIndex.replace(EMPTY_CANVAS_DOCUMENT);
        publish(
          {
            document: EMPTY_CANVAS_DOCUMENT,
            connectionError: undefined,
            connectionPreview: undefined,
            moveDelta: null,
            selectedIds: [],
            selectedLinkIds: [],
          },
          { kind: "document" },
        );
        return;

      case "link.create": {
        const link: MaterialLink = {
          from: action.from,
          id: action.id ?? idFactory(),
          to: action.to,
        };
        const index = state.document.materialLinks.length;
        try {
          const document = {
            ...state.document,
            materialLinks: [...state.document.materialLinks, link],
          };
          const normalized = createBasicPlan({
            materialLinks: document.materialLinks,
            nodes: document.nodes.map(({ configuration }) => configuration),
          });
          const canonicalLink = normalized.materialLinks.at(-1)!;
          commit(
            {
              ...document,
              materialLinks: [
                ...document.materialLinks.slice(0, -1),
                canonicalLink,
              ],
            },
            [],
            {
              after: [],
              afterLinks: [{ index, link: canonicalLink }],
              afterLinkSelection: [canonicalLink.id],
              afterSelection: [],
              before: [],
              beforeLinkSelection: state.selectedLinkIds,
              beforeSelection: state.selectedIds,
            },
            [canonicalLink.id],
          );
        } catch (error) {
          const failure =
            error instanceof BasicPlanError
              ? { code: error.code, message: error.message }
              : {
                  code: "basic.link.invalid",
                  message:
                    error instanceof Error
                      ? error.message
                      : "The Material Link is invalid.",
                };
          publish({ connectionError: failure }, { kind: "settings" });
        }
        return;
      }

      case "link.preview":
        publish(
          {
            connectionError: undefined,
            connectionPreview: {
              current: action.current,
              from: action.from,
              ...(action.target ? { target: action.target } : {}),
            },
          },
          { kind: "settings" },
        );
        return;

      case "link.preview.cancel":
        if (state.connectionPreview) {
          publish({ connectionPreview: undefined }, { kind: "settings" });
        }
        return;

      case "link.delete": {
        const index = state.document.materialLinks.findIndex(
          ({ id }) => id === action.id,
        );
        const link = state.document.materialLinks[index];
        if (!link) return;
        const selectedLinkIds = state.selectedLinkIds.filter(
          (id) => id !== action.id,
        );
        commit(
          {
            ...state.document,
            materialLinks: state.document.materialLinks.filter(
              ({ id }) => id !== action.id,
            ),
          },
          state.selectedIds,
          {
            after: [],
            afterLinks: [],
            afterLinkSelection: selectedLinkIds,
            afterSelection: state.selectedIds,
            before: [],
            beforeLinks: [{ index, link }],
            beforeLinkSelection: state.selectedLinkIds,
            beforeSelection: state.selectedIds,
          },
          selectedLinkIds,
        );
        return;
      }

      case "node.create": {
        nodeSequence += 1;
        const id = idFactory();
        const configuration = createNode({
          ...action.node,
          id,
        }).configuration;
        const layout = nodeCardLayout(configuration);
        const x = action.at.x - layout.width / 2;
        const y = action.at.y - layout.height / 2;
        const node: CanvasNode = {
          configuration,
          height: layout.height,
          label: action.label ?? `Node ${nodeSequence}`,
          width: layout.width,
          x: state.snapToGrid ? snap(x) : x,
          y: state.snapToGrid ? snap(y) : y,
        };
        const index = state.document.nodes.length;
        const selectedIds = [canvasNodeId(node)];
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

      case "node.configure": {
        const beforeNode = spatialIndex.get(action.id);
        const index = spatialIndex.indexOf(action.id);
        if (
          !beforeNode ||
          index === undefined ||
          action.configuration.id !== action.id
        ) {
          return;
        }
        const configuration = createNode(action.configuration).configuration;
        const layout = nodeCardLayout(configuration);
        const afterNode: CanvasNode = {
          ...beforeNode,
          configuration,
          height: layout.height,
          width: layout.width,
        };
        const before = [{ index, node: beforeNode }];
        const after = [{ index, node: afterNode }];
        commit(applyPatch(state.document, before, after), state.selectedIds, {
          after,
          afterSelection: state.selectedIds,
          before,
          beforeSelection: state.selectedIds,
        });
        return;
      }

      case "node.ports.reorder": {
        const beforeNode = spatialIndex.get(action.id);
        const index = spatialIndex.indexOf(action.id);
        if (!beforeNode || index === undefined) return;
        const afterNode: CanvasNode = {
          ...beforeNode,
          portOrder: {
            ...beforeNode.portOrder,
            [action.direction]: [...action.portIds],
          },
        };
        const before = [{ index, node: beforeNode }];
        const after = [{ index, node: afterNode }];
        commit(applyPatch(state.document, before, after), state.selectedIds, {
          after,
          afterSelection: state.selectedIds,
          before,
          beforeSelection: state.selectedIds,
        });
        return;
      }

      case "node.router.rules": {
        const beforeNode = spatialIndex.get(action.id);
        const index = spatialIndex.indexOf(action.id);
        if (
          !beforeNode ||
          index === undefined ||
          beforeNode.configuration.kind !== "router"
        ) {
          return;
        }
        const afterNode: CanvasNode = {
          ...beforeNode,
          routerRules: action.rules,
        };
        const before = [{ index, node: beforeNode }];
        const after = [{ index, node: afterNode }];
        commit(applyPatch(state.document, before, after), state.selectedIds, {
          after,
          afterSelection: state.selectedIds,
          before,
          beforeSelection: state.selectedIds,
        });
        return;
      }

      case "node.router.priorities": {
        const beforeNode = spatialIndex.get(action.id);
        const index = spatialIndex.indexOf(action.id);
        if (
          !beforeNode ||
          index === undefined ||
          beforeNode.configuration.kind !== "router"
        ) {
          return;
        }
        const afterNode: CanvasNode = {
          ...beforeNode,
          routerPriorities: action.priorities,
        };
        const before = [{ index, node: beforeNode }];
        const after = [{ index, node: afterNode }];
        commit(applyPatch(state.document, before, after), state.selectedIds, {
          after,
          afterSelection: state.selectedIds,
          before,
          beforeSelection: state.selectedIds,
        });
        return;
      }

      case "selection.clear":
        if (state.selectedIds.length > 0 || state.selectedLinkIds.length > 0) {
          const nodeIds = state.selectedIds;
          publish(
            { selectedIds: [], selectedLinkIds: [] },
            { kind: "selection", nodeIds },
          );
        }
        return;

      case "selection.link": {
        if (!state.document.materialLinks.some(({ id }) => id === action.id)) {
          return;
        }
        const alreadySelected = state.selectedLinkIds.includes(action.id);
        const selectedLinkIds = action.additive
          ? alreadySelected
            ? state.selectedLinkIds.filter((id) => id !== action.id)
            : [...state.selectedLinkIds, action.id]
          : alreadySelected && state.selectedLinkIds.length === 1
            ? state.selectedLinkIds
            : [action.id];
        publish(
          {
            selectedIds: action.additive ? state.selectedIds : [],
            selectedLinkIds,
          },
          { kind: "selection", nodeIds: state.selectedIds },
        );
        return;
      }

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
          {
            selectedIds,
            selectedLinkIds: action.additive ? state.selectedLinkIds : [],
          },
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
          .map(canvasNodeId);
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
        if (
          state.selectedIds.length === 0 &&
          state.selectedLinkIds.length === 0
        ) {
          return;
        }
        const before = indexedSelection();
        const selected = new Set(state.selectedIds);
        const beforeLinks = state.document.materialLinks.flatMap(
          (link, index) =>
            selected.has(link.from.nodeId) ||
            selected.has(link.to.nodeId) ||
            state.selectedLinkIds.includes(link.id)
              ? [{ index, link }]
              : [],
        );
        const removedLinkIds = new Set(beforeLinks.map(({ link }) => link.id));
        commit(
          {
            ...state.document,
            materialLinks: state.document.materialLinks.filter(
              ({ id }) => !removedLinkIds.has(id),
            ),
            nodes: state.document.nodes.filter(
              (node) => !selected.has(canvasNodeId(node)),
            ),
          },
          [],
          {
            after: [],
            afterLinks: [],
            afterLinkSelection: [],
            afterSelection: [],
            before,
            beforeLinks,
            beforeLinkSelection: state.selectedLinkIds,
            beforeSelection: state.selectedIds,
          },
          [],
        );
        return;
      }

      case "selection.copy": {
        const nodes = indexedSelection().map(({ node }) => ({ ...node }));
        const selected = new Set(nodes.map(canvasNodeId));
        clipboard = {
          links: state.document.materialLinks.filter(
            ({ from, to }) =>
              selected.has(from.nodeId) && selected.has(to.nodeId),
          ),
          nodes,
        };
        return;
      }

      case "selection.paste": {
        if (clipboard.nodes.length === 0) return;
        const pasted = duplicateDocument(clipboard.nodes, clipboard.links);
        const startIndex = state.document.nodes.length;
        const startLinkIndex = state.document.materialLinks.length;
        const selectedIds = pasted.nodes.map(canvasNodeId);
        commit(
          {
            ...state.document,
            materialLinks: [...state.document.materialLinks, ...pasted.links],
            nodes: [...state.document.nodes, ...pasted.nodes],
          },
          selectedIds,
          {
            after: pasted.nodes.map((node, index) => ({
              index: startIndex + index,
              node,
            })),
            afterLinks: pasted.links.map((link, index) => ({
              index: startLinkIndex + index,
              link,
            })),
            afterLinkSelection: [],
            afterSelection: selectedIds,
            before: [],
            beforeLinkSelection: state.selectedLinkIds,
            beforeSelection: state.selectedIds,
          },
          [],
        );
        clipboard = pasted;
        return;
      }

      case "selection.duplicate": {
        const selected = indexedSelection().map(({ node }) => node);
        if (selected.length === 0) return;
        const selectedIdsBefore = new Set(selected.map(canvasNodeId));
        const links = state.document.materialLinks.filter(
          ({ from, to }) =>
            selectedIdsBefore.has(from.nodeId) &&
            selectedIdsBefore.has(to.nodeId),
        );
        const duplicates = duplicateDocument(selected, links);
        const startIndex = state.document.nodes.length;
        const startLinkIndex = state.document.materialLinks.length;
        const selectedIds = duplicates.nodes.map(canvasNodeId);
        commit(
          {
            ...state.document,
            materialLinks: [
              ...state.document.materialLinks,
              ...duplicates.links,
            ],
            nodes: [...state.document.nodes, ...duplicates.nodes],
          },
          selectedIds,
          {
            after: duplicates.nodes.map((node, index) => ({
              index: startIndex + index,
              node,
            })),
            afterLinks: duplicates.links.map((link, index) => ({
              index: startLinkIndex + index,
              link,
            })),
            afterLinkSelection: [],
            afterSelection: selectedIds,
            before: [],
            beforeLinkSelection: state.selectedLinkIds,
            beforeSelection: state.selectedIds,
          },
          [],
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
        const document = applyPatch(
          state.document,
          entry.after,
          entry.before,
          entry.afterLinks,
          entry.beforeLinks,
        );
        spatialIndex.apply(
          document,
          entry.after.map(({ node }) => node),
          entry.before.map(({ node }) => node),
        );
        linkIndex.replace(document);
        publish(
          {
            document,
            moveDelta: null,
            selectedIds: entry.beforeSelection,
            selectedLinkIds: entry.beforeLinkSelection ?? [],
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
        const document = applyPatch(
          state.document,
          entry.before,
          entry.after,
          entry.beforeLinks,
          entry.afterLinks,
        );
        spatialIndex.apply(
          document,
          entry.before.map(({ node }) => node),
          entry.after.map(({ node }) => node),
        );
        linkIndex.replace(document);
        publish(
          {
            document,
            moveDelta: null,
            selectedIds: entry.afterSelection,
            selectedLinkIds: entry.afterLinkSelection ?? [],
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
    hitTestLink: (point, radius) => linkIndex.hitTest(point, radius),
    hitTestPort: (point, radius) =>
      hitTestMaterialPort(
        spatialIndex.query({
          height: radius * 2,
          width: radius * 2,
          x: point.x - radius,
          y: point.y - radius,
        }),
        point,
        radius,
      ),
    query: (rectangle) => spatialIndex.query(rectangle),
    queryLinks: (rectangle) => linkIndex.query(rectangle),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
