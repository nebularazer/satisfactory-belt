import { productionRegions } from "./production-regions";
import { MAX_GROUP_NAME_LENGTH, type GroupNames } from "./group-names";
import type { ConnectionRoute } from "./connection-route";
import { addRouteBend, moveRouteSegment } from "./route-editing";
import { routeIsClear, samePoint, simplifyRoute } from "./orthogonal-router";
import {
  createNode,
  type NodeConfiguration,
  type NodeTemplate,
} from "@satisfactory-belt/production";
import {
  BasicPlanError,
  createBasicPlan,
  DEFAULT_LOGISTICS_TIERS,
  type LogisticsTier,
  type MaterialEndpoint,
  type MaterialLink,
} from "@satisfactory-belt/planning";

import {
  EMPTY_CANVAS_DOCUMENT,
  canvasNodeId,
  type CanvasDocument,
  type CanvasMaterialLink,
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
  materialLinkPath,
  routeObstacles,
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
  routeEdit?: Readonly<{ id: string; route: ConnectionRoute; valid: boolean }>;
  selectedGroupId?: string;
  selectedLinkIds: readonly string[];
  selectedIds: readonly string[];
  connectionError?: Readonly<{ code: string; message: string }>;
  connectionPreview?: Readonly<{
    current: Point;
    from: MaterialEndpoint;
    replacingLinkId?: string;
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
  | { type: "selection.group"; id: string }
  | { type: "group.rename"; id: string; name: string }
  | {
      type: "document.insert";
      source: CanvasDocument;
      document: CanvasDocument;
    }
  | { type: "document.replace"; document: CanvasDocument }
  | { type: "document.reset" }
  | {
      type: "link.route.begin";
      id: string;
      route: ConnectionRoute;
      segment: number;
    }
  | { type: "link.route.update"; at: Point }
  | { type: "link.route.commit" }
  | { type: "link.route.cancel" }
  | { type: "link.route.bend"; id: string; segment?: number }
  | { type: "link.route.reset"; id: string }
  | {
      type: "document.arrange";
      source: CanvasDocument;
      document: CanvasDocument;
    }
  | {
      type: "link.create";
      from: MaterialEndpoint;
      id?: string;
      to: MaterialEndpoint;
    }
  | {
      type: "link.reconnect";
      from: MaterialEndpoint;
      id: string;
      to: MaterialEndpoint;
    }
  | { type: "link.delete"; id: string }
  | { type: "link.tier"; id: string; tierId: string }
  | {
      type: "link.preview";
      current: Point;
      from: MaterialEndpoint;
      replacingLinkId?: string;
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
  topology: "aggregate" | "physical";
  logisticsTiers: readonly LogisticsTier[];
}>;

type IndexedNode = Readonly<{
  index: number;
  node: CanvasNode;
}>;

type IndexedLink = Readonly<{
  index: number;
  link: CanvasMaterialLink;
}>;

type HistoryEntry = Readonly<{
  groupNames?: { before?: GroupNames; after?: GroupNames };
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
  topology?: "aggregate" | "physical";
  logisticsTiers?: readonly LogisticsTier[];
};

function validateDocument(
  document: CanvasDocument,
  topology: "aggregate" | "physical",
) {
  const plan = createBasicPlan({
    materialLinks: document.materialLinks,
    nodes: document.nodes.map(({ configuration }) => configuration),
  });
  if (topology === "aggregate") return plan;

  const occupied = new Map<string, string>();
  for (const node of document.nodes) {
    if (
      node.configuration.kind === "process" &&
      node.configuration.instances.length !== 1
    ) {
      throw new BasicPlanError(
        "basic.endpoint.occupied",
        "A physical canvas Process Node must represent exactly one machine.",
        { nodeId: node.configuration.id },
      );
    }
  }
  for (const link of plan.materialLinks) {
    for (const endpoint of [link.from, link.to]) {
      const key = `${endpoint.nodeId}\u0000${endpoint.portId}`;
      const existingLinkId = occupied.get(key);
      if (existingLinkId) {
        throw new BasicPlanError(
          "basic.endpoint.occupied",
          `Physical Material Port ${endpoint.nodeId}:${endpoint.portId} is already occupied.`,
          { existingLinkId, linkId: link.id },
        );
      }
      occupied.set(key, link.id);
    }
  }
  return plan;
}

function defaultLogistics(
  document: CanvasDocument,
  endpoint: MaterialEndpoint,
  tiers: readonly LogisticsTier[],
): CanvasMaterialLink["logistics"] {
  const node = document.nodes.find(
    ({ configuration }) => configuration.id === endpoint.nodeId,
  );
  const port = node
    ? createNode(node.configuration).ports.find(
        ({ id }) => id === endpoint.portId,
      )
    : undefined;
  const kind: "conveyor" | "pipeline" =
    port?.medium === "pipeline" ? "pipeline" : "conveyor";
  const tier = tiers
    .filter(({ medium }) => medium === kind)
    .toSorted(
      (left, right) => left.capacityPerMinute - right.capacityPerMinute,
    )[0];
  if (!tier) throw new Error(`This plan has no available ${kind} tier.`);
  return { kind, tierId: tier.id };
}

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
        (node.height === GRID_INTERVAL * 5 ||
          node.height === GRID_INTERVAL * 5 + GRID_INTERVAL / 2)) ||
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
  const topology = options.topology ?? "aggregate";
  // Older saves contain only the tiers selected for conversion. Editing always
  // offers the full catalog while preserving any saved custom definitions.
  const savedTiers = options.logisticsTiers ?? [];
  const logisticsTiers = [
    ...savedTiers,
    ...DEFAULT_LOGISTICS_TIERS.filter(
      (tier) => !savedTiers.some((saved) => saved.id === tier.id),
    ),
  ];
  const listeners = new Set<(change: CanvasEditorChange) => void>();
  const past: HistoryEntry[] = [];
  const future: HistoryEntry[] = [];
  let clipboard: Readonly<{
    links: readonly CanvasMaterialLink[];
    nodes: readonly CanvasNode[];
  }> = { links: [], nodes: [] };
  let dispatchStartedAt = 0;
  let moveTransaction: MoveTransaction | undefined;
  let routeTransaction:
    | {
        id: string;
        source: CanvasDocument;
        route: ConnectionRoute;
        segment: number;
      }
    | undefined;
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
    if (change.kind === "selection" && !("selectedGroupId" in partial))
      state = { ...state, selectedGroupId: undefined };
    if (state.selectedGroupId) {
      const group = productionRegions(state.document).find(
        (group) => group.id === state.selectedGroupId,
      );
      if (
        !group ||
        state.selectedLinkIds.length ||
        group.nodeIds.length !== state.selectedIds.length ||
        group.nodeIds.some((id) => !state.selectedIds.includes(id))
      )
        state = { ...state, selectedGroupId: undefined };
    }
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
    validateTopology = true,
  ) => {
    if (validateTopology) {
      validateDocument(document, topology);
    }
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
    links: readonly CanvasMaterialLink[],
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
              ...link,
              ...(link.route
                ? {
                    route: link.route.map(({ x, y }) => ({
                      x: x + offset,
                      y: y + offset,
                    })),
                  }
                : {}),
              from: { ...link.from, nodeId: fromNodeId },
              id: idFactory(),
              to: { ...link.to, nodeId: toNodeId },
            },
          ]
        : [];
    });
    return { links: duplicatedLinks, nodes: duplicates };
  };

  const commitRoute = (id: string, route?: ConnectionRoute) => {
    const index = state.document.materialLinks.findIndex(
      (link) => link.id === id,
    );
    const before = state.document.materialLinks[index];
    if (!before) return;
    const { route: _route, routeMode: _mode, ...connection } = before;
    const after: CanvasMaterialLink = route
      ? { ...connection, route, routeMode: "manual" }
      : connection;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    commit(
      {
        ...state.document,
        materialLinks: state.document.materialLinks.map((link) =>
          link.id === id ? after : link,
        ),
      },
      state.selectedIds,
      {
        before: [],
        after: [],
        beforeLinks: [{ index, link: before }],
        afterLinks: [{ index, link: after }],
        beforeSelection: state.selectedIds,
        afterSelection: state.selectedIds,
        beforeLinkSelection: state.selectedLinkIds,
        afterLinkSelection: state.selectedLinkIds,
      },
      state.selectedLinkIds,
      false,
    );
  };
  const clearRouteEdit = () => {
    routeTransaction = undefined;
    if (state.routeEdit)
      publish({ routeEdit: undefined }, { kind: "settings" });
  };
  const routeValid = (id: string, route: ConnectionRoute) => {
    const link = state.document.materialLinks.find((link) => link.id === id);
    const path = link ? materialLinkPath(state.document, link) : undefined;
    return Boolean(
      link &&
      path &&
      route.length >= 2 &&
      samePoint(route[0]!, path.from) &&
      samePoint(route.at(-1)!, path.to) &&
      routeIsClear(
        route,
        routeObstacles(state.document.nodes),
        link.from.nodeId,
        link.to.nodeId,
      ),
    );
  };

  const dispatch = (action: CanvasEditorAction) => {
    dispatchStartedAt = performance.now();
    if (routeTransaction && action.type === "document.arrange") return;
    if (routeTransaction && !action.type.startsWith("link.route."))
      clearRouteEdit();

    switch (action.type) {
      case "link.route.begin": {
        if (!routeValid(action.id, action.route)) return;
        routeTransaction = {
          id: action.id,
          route: action.route,
          segment: action.segment,
          source: state.document,
        };
        publish(
          { routeEdit: { id: action.id, route: action.route, valid: true } },
          { kind: "settings" },
        );
        return;
      }
      case "link.route.update": {
        if (!routeTransaction || routeTransaction.source !== state.document) {
          clearRouteEdit();
          return;
        }
        const at = state.snapToGrid
          ? { x: snap(action.at.x), y: snap(action.at.y) }
          : action.at;
        const route = moveRouteSegment(
          routeTransaction.route,
          routeTransaction.segment,
          at,
        );
        publish(
          {
            routeEdit: {
              id: routeTransaction.id,
              route,
              valid: routeValid(routeTransaction.id, route),
            },
          },
          { kind: "settings" },
        );
        return;
      }
      case "link.route.commit": {
        const edit = state.routeEdit;
        const current = routeTransaction?.source === state.document;
        const changed =
          edit &&
          routeTransaction &&
          JSON.stringify(simplifyRoute(edit.route)) !==
            JSON.stringify(simplifyRoute(routeTransaction.route));
        clearRouteEdit();
        if (edit?.valid && current && changed) commitRoute(edit.id, edit.route);
        return;
      }
      case "link.route.cancel":
        clearRouteEdit();
        return;
      case "link.route.reset":
        clearRouteEdit();
        commitRoute(action.id);
        return;
      case "link.route.bend": {
        clearRouteEdit();
        const link = state.document.materialLinks.find(
          ({ id }) => id === action.id,
        );
        const path = link ? materialLinkPath(state.document, link) : undefined;
        if (!path?.route) return;
        for (const offset of [64, -64, 32, -32]) {
          const route = addRouteBend(path.route, action.segment, offset);
          if (
            route.length > path.route.length &&
            routeValid(action.id, route)
          ) {
            commitRoute(action.id, route);
            return;
          }
        }
        publish(
          {
            connectionError: {
              code: "canvas.route.blocked",
              message:
                "There is no room for a bend here. Move the connection or nearby nodes to make space.",
            },
          },
          { kind: "settings" },
        );
        return;
      }

      case "document.insert": {
        if (
          action.source !== state.document ||
          moveTransaction ||
          topology !== "aggregate"
        )
          return;
        const after = action.document.nodes.map((node, index) => ({
          node,
          index: state.document.nodes.length + index,
        }));
        const afterLinks = action.document.materialLinks.map((link, index) => ({
          link,
          index: state.document.materialLinks.length + index,
        }));
        const document = {
          ...state.document,
          nodes: [...state.document.nodes, ...action.document.nodes],
          materialLinks: [
            ...state.document.materialLinks,
            ...action.document.materialLinks,
          ],
        };
        validateDocument(document, topology);
        const selectedIds = action.document.nodes.map(canvasNodeId);
        commit(document, selectedIds, {
          before: [],
          after,
          beforeLinks: [],
          afterLinks,
          beforeSelection: state.selectedIds,
          afterSelection: selectedIds,
          beforeLinkSelection: state.selectedLinkIds,
          afterLinkSelection: [],
        });
        return;
      }

      case "document.arrange": {
        // A worker result must never overwrite edits made while it was running.
        if (action.source !== state.document || moveTransaction) return;
        const before = state.document.nodes.map((node, index) => ({
          node,
          index,
        }));
        const after = action.document.nodes.map((node, index) => ({
          node,
          index,
        }));
        commit(
          action.document,
          state.selectedIds,
          {
            before,
            after,
            beforeLinks: state.document.materialLinks.map((link, index) => ({
              link,
              index,
            })),
            afterLinks: action.document.materialLinks.map((link, index) => ({
              link,
              index,
            })),
            beforeSelection: state.selectedIds,
            afterSelection: state.selectedIds,
            beforeLinkSelection: state.selectedLinkIds,
            afterLinkSelection: state.selectedLinkIds,
          },
          state.selectedLinkIds,
          false,
        );
        return;
      }

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
        try {
          const link: CanvasMaterialLink = {
            from: action.from,
            id: action.id ?? idFactory(),
            ...(topology === "physical"
              ? {
                  logistics: defaultLogistics(
                    state.document,
                    action.from,
                    logisticsTiers,
                  ),
                }
              : {}),
            to: action.to,
          };
          const index = state.document.materialLinks.length;
          const document = {
            ...state.document,
            materialLinks: [...state.document.materialLinks, link],
          };
          const normalized = validateDocument(document, topology);
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
              afterLinkSelection: [],
              afterSelection: [],
              before: [],
              beforeLinkSelection: state.selectedLinkIds,
              beforeSelection: state.selectedIds,
            },
            [],
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

      case "link.reconnect": {
        const index = state.document.materialLinks.findIndex(
          ({ id }) => id === action.id,
        );
        const previousLink = state.document.materialLinks[index];
        if (!previousLink) return;
        const replacement: CanvasMaterialLink = {
          ...previousLink,
          from: action.from,
          id: action.id,
          to: action.to,
        };
        try {
          const materialLinks = state.document.materialLinks.map(
            (link, linkIndex) => (linkIndex === index ? replacement : link),
          );
          const normalized = validateDocument(
            { ...state.document, materialLinks },
            topology,
          );
          const canonicalLink = normalized.materialLinks[index]!;
          if (
            canonicalLink.from.nodeId === previousLink.from.nodeId &&
            canonicalLink.from.portId === previousLink.from.portId &&
            canonicalLink.to.nodeId === previousLink.to.nodeId &&
            canonicalLink.to.portId === previousLink.to.portId
          ) {
            dispatch({
              type: "selection.link",
              additive: false,
              id: previousLink.id,
            });
            return;
          }
          commit(
            { ...state.document, materialLinks: normalized.materialLinks },
            [],
            {
              after: [],
              afterLinks: [{ index, link: canonicalLink }],
              afterLinkSelection: [canonicalLink.id],
              afterSelection: [],
              before: [],
              beforeLinks: [{ index, link: previousLink }],
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
              ...(action.replacingLinkId
                ? { replacingLinkId: action.replacingLinkId }
                : {}),
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

      case "link.tier": {
        const index = state.document.materialLinks.findIndex(
          ({ id }) => id === action.id,
        );
        const link = state.document.materialLinks[index];
        const tier = logisticsTiers.find(({ id }) => id === action.tierId);
        if (!link?.logistics || !tier || tier.medium !== link.logistics.kind) {
          return;
        }
        const replacement: CanvasMaterialLink = {
          ...link,
          logistics: { ...link.logistics, tierId: tier.id },
        };
        commit(
          {
            ...state.document,
            materialLinks: state.document.materialLinks.map((candidate) =>
              candidate.id === link.id ? replacement : candidate,
            ),
          },
          state.selectedIds,
          {
            after: [],
            afterLinks: [{ index, link: replacement }],
            afterLinkSelection: state.selectedLinkIds,
            afterSelection: state.selectedIds,
            before: [],
            beforeLinks: [{ index, link }],
            beforeLinkSelection: state.selectedLinkIds,
            beforeSelection: state.selectedIds,
          },
          state.selectedLinkIds,
          false,
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
        commit(
          applyPatch(state.document, before, after),
          state.selectedIds,
          {
            after,
            afterSelection: state.selectedIds,
            before,
            beforeSelection: state.selectedIds,
          },
          state.selectedLinkIds,
          false,
        );
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
        commit(
          applyPatch(state.document, before, after),
          state.selectedIds,
          {
            after,
            afterSelection: state.selectedIds,
            before,
            beforeSelection: state.selectedIds,
          },
          state.selectedLinkIds,
          false,
        );
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
        commit(
          applyPatch(state.document, before, after),
          state.selectedIds,
          {
            after,
            afterSelection: state.selectedIds,
            before,
            beforeSelection: state.selectedIds,
          },
          state.selectedLinkIds,
          false,
        );
        return;
      }

      case "selection.group": {
        const group = productionRegions(state.document).find(
          (group) => group.id === action.id,
        );
        if (!group) return;
        publish(
          {
            selectedGroupId: group.id,
            selectedIds: group.nodeIds,
            selectedLinkIds: [],
          },
          {
            kind: "selection",
            nodeIds: [...state.selectedIds, ...group.nodeIds],
          },
        );
        return;
      }
      case "group.rename": {
        const group = productionRegions(state.document).find(
          (group) => group.id === action.id,
        );
        const name = action.name.trim();
        if (!group || name.length > MAX_GROUP_NAME_LENGTH) return;
        const groupNames = { ...state.document.groupNames };
        if (!name || name === group.defaultName) delete groupNames[group.id];
        else groupNames[group.id] = name;
        if (
          (groupNames[group.id] ?? "") ===
          (state.document.groupNames?.[group.id] ?? "")
        )
          return;
        const { groupNames: beforeNames, ...base } = state.document;
        const afterNames = Object.keys(groupNames).length
          ? groupNames
          : undefined;
        commit(
          { ...base, ...(afterNames ? { groupNames: afterNames } : {}) },
          state.selectedIds,
          {
            before: [],
            after: [],
            beforeSelection: state.selectedIds,
            afterSelection: state.selectedIds,
            beforeLinkSelection: state.selectedLinkIds,
            afterLinkSelection: state.selectedLinkIds,
            groupNames: { before: beforeNames, after: afterNames },
          },
          state.selectedLinkIds,
          false,
        );
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
        if (selectedIds === state.selectedIds && !state.selectedGroupId) return;
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
        commit(
          document,
          state.selectedIds,
          {
            after,
            afterSelection: state.selectedIds,
            before: transaction.before,
            beforeSelection: transaction.selectionBefore,
          },
          state.selectedLinkIds,
          false,
        );
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
        let document = applyPatch(
          state.document,
          entry.after,
          entry.before,
          entry.afterLinks,
          entry.beforeLinks,
        );
        if (entry.groupNames) {
          const { groupNames: _names, ...base } = document;
          const names = entry.groupNames.before;
          document = { ...base, ...(names ? { groupNames: names } : {}) };
        }
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
        let document = applyPatch(
          state.document,
          entry.before,
          entry.after,
          entry.beforeLinks,
          entry.afterLinks,
        );
        if (entry.groupNames) {
          const { groupNames: _names, ...base } = document;
          const names = entry.groupNames.after;
          document = { ...base, ...(names ? { groupNames: names } : {}) };
        }
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
    topology,
    logisticsTiers,
  };
}
