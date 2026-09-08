import { materialLinkPath } from "./material-link-geometry";
import { routeHandles } from "./route-editing";
import type { MaterialEndpoint } from "@satisfactory-belt/planning";

import {
  canvasConnectionTargets,
  canvasDocumentForConnection,
} from "./connection-compatibility";
import { canvasNodeId, type CanvasDocument } from "./document";
import type { CanvasEditor } from "./editor";
import type { Point, Rectangle } from "./geometry";
import { GRID_INTERVAL, SNAP_INTERVAL } from "./grid";
import { screenToWorld, ZOOM_STEP, type Viewport } from "./viewport";

const MOUSE_DRAG_THRESHOLD = 4;
const TOUCH_DRAG_THRESHOLD = 10;
const EDGE_PAN_MARGIN = 56;
const EDGE_PAN_MAX_STEP = 14;

type ConnectionIntent = Readonly<{
  compatibleTargets: ReadonlySet<string>;
  from: MaterialEndpoint;
}>;

type Interaction =
  | {
      kind: "route";
      pointerId: number;
      startScreen: Point;
      moved: boolean;
      axis: "x" | "y";
    }
  | (ConnectionIntent & {
      current: Point;
      dropOnEmpty: boolean;
      hovered?: MaterialEndpoint;
      kind: "connection";
      moved: boolean;
      origin: Point;
      pointerId: number;
      reconnect?: Readonly<{
        additive: boolean;
        linkId: string;
      }>;
      startScreen: Point;
      target?: MaterialEndpoint;
    })
  | {
      additive: boolean;
      kind: "link";
      linkId: string;
      moved: boolean;
      pointerId: number;
      startScreen: Point;
    }
  | {
      clearSelectionOnClick: boolean;
      kind: "pan";
      lastScreen: Point;
      moved: boolean;
      pointerId: number;
      selectNodeOnTap?: string;
      startScreen: Point;
    }
  | {
      kind: "move";
      moved: boolean;
      nodeId: string;
      pointerId: number;
      selectionBefore: readonly string[];
      started: boolean;
      startScreen: Point;
      startWorld: Point;
    }
  | {
      baseIds: readonly string[];
      dragging: boolean;
      hitId?: string;
      kind: "select";
      pointerId: number;
      startScreen: Point;
    };

function endpointKey(endpoint: MaterialEndpoint) {
  return `${endpoint.nodeId}\u0000${endpoint.portId}`;
}

function connectionIntent(
  document: CanvasDocument,
  from: MaterialEndpoint,
  topology: CanvasEditor["topology"],
): ConnectionIntent {
  return {
    compatibleTargets: new Set(
      canvasConnectionTargets(document, from, topology)
        .filter(({ status }) => status === "compatible")
        .map(({ endpoint }) => endpointKey(endpoint)),
    ),
    from,
  };
}

function reconnectableLinkAtEndpoint(
  document: CanvasDocument,
  endpoint: MaterialEndpoint,
  topology: CanvasEditor["topology"],
  selectedLinkIds: readonly string[],
) {
  const node = document.nodes.find(
    ({ configuration }) => configuration.id === endpoint.nodeId,
  );
  const key = endpointKey(endpoint);
  const links = document.materialLinks.filter(
    ({ from, to }) => endpointKey(from) === key || endpointKey(to) === key,
  );
  if (topology === "aggregate" && node?.configuration.kind === "process") {
    const selectedLinks = new Set(selectedLinkIds);
    const selectedIncidentLinks = links.filter(({ id }) =>
      selectedLinks.has(id),
    );
    return selectedIncidentLinks.length === 1
      ? selectedIncidentLinks[0]
      : undefined;
  }
  return links[0];
}

function compatibleTarget(
  intent: ConnectionIntent,
  hovered: MaterialEndpoint | undefined,
) {
  return hovered && intent.compatibleTargets.has(endpointKey(hovered))
    ? hovered
    : undefined;
}

export type CanvasInteractionHost = Readonly<{
  cancelPlacement: () => void;
  fit: (scope: "all" | "selection") => void;
  getViewport: () => Viewport;
  getViewportCenter: () => Point;
  isPlacementActive: () => boolean;
  panBy: (delta: Point) => void;
  placeNode: (at: Point) => void;
  requestNode: (at: Point, connection?: CanvasConnectionRequest) => void;
  resetView: () => void;
  setMarquee: (rectangle?: Rectangle) => void;
  zoomAt: (factor: number, anchor: Point) => void;
}>;

export type CanvasConnectionRequest = Readonly<{
  from: MaterialEndpoint;
  replacingLinkId?: string;
}>;

function passedDragThreshold(
  start: Point,
  current: Point,
  pointerType: string,
) {
  const threshold =
    pointerType === "touch" ? TOUCH_DRAG_THRESHOLD : MOUSE_DRAG_THRESHOLD;
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

function edgePanDelta(
  point: Point,
  movement: Point,
  size: Readonly<{ height: number; width: number }>,
) {
  const axis = (value: number, direction: number, length: number) => {
    if (value < EDGE_PAN_MARGIN && direction < 0) {
      return EDGE_PAN_MAX_STEP * (1 - Math.max(0, value) / EDGE_PAN_MARGIN);
    }
    if (value > length - EDGE_PAN_MARGIN && direction > 0) {
      return (
        -EDGE_PAN_MAX_STEP * (1 - Math.max(0, length - value) / EDGE_PAN_MARGIN)
      );
    }
    return 0;
  };
  return {
    x: axis(point.x, movement.x, size.width),
    y: axis(point.y, movement.y, size.height),
  };
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "input, textarea, [contenteditable='true'], [role='menu']",
      ),
    )
  );
}

export function attachCanvasInteractions(
  canvas: HTMLCanvasElement,
  editor: CanvasEditor,
  host: CanvasInteractionHost,
) {
  let interaction: Interaction | null = null;
  let armedConnection: ConnectionIntent | null = null;
  let lastPointerScreen: Point | null = null;
  let spacePressed = false;
  const touches = new Map<number, Point>();
  let touchSequenceWasMultitouch = false;
  let touchGesture: {
    distance: number;
    midpoint: Point;
  } | null = null;

  const screenPoint = (event: MouseEvent): Point => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const restoreSelection = (ids: readonly string[]) => {
    const selectedIds = editor.getState().selectedIds;
    if (
      selectedIds.length === ids.length &&
      selectedIds.every((id, index) => id === ids[index])
    ) {
      return;
    }
    editor.dispatch({ type: "selection.clear" });
    for (const id of ids) {
      editor.dispatch({ type: "selection.node", additive: true, id });
    }
  };

  const releasePointer = (pointerId: number) => {
    if (canvas.hasPointerCapture(pointerId))
      canvas.releasePointerCapture(pointerId);
  };

  const touchPair = () => [...touches.entries()].slice(0, 2);

  const cancelConnection = () => {
    armedConnection = null;
    editor.dispatch({ type: "link.preview.cancel" });
  };

  const touchGeometry = () => {
    const pair = touchPair();
    const first = pair[0]?.[1];
    const second = pair[1]?.[1];
    if (!first || !second) return undefined;
    return {
      distance: Math.max(Math.hypot(second.x - first.x, second.y - first.y), 1),
      midpoint: {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      },
    };
  };

  const hitRouteHandle = (point: Point, radius: number) => {
    const state = editor.getState();
    if (state.selectedLinkIds.length !== 1) return undefined;
    const link = state.document.materialLinks.find(
      ({ id }) => id === state.selectedLinkIds[0],
    );
    const path = link ? materialLinkPath(state.document, link) : undefined;
    return path?.route
      ? routeHandles(path.route, host.getViewport().zoom)
          .map((handle) => ({
            ...handle,
            id: link!.id,
            distance: Math.hypot(
              point.x - handle.point.x,
              point.y - handle.point.y,
            ),
          }))
          .filter(({ distance }) => distance <= radius)
          .toSorted((a, b) => a.distance - b.distance)[0]
      : undefined;
  };

  const finishInteraction = (event: PointerEvent, cancelled = false) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    if (interaction.kind === "route") {
      editor.dispatch({
        type:
          cancelled || !interaction.moved
            ? "link.route.cancel"
            : "link.route.commit",
      });
    }

    if (interaction.kind === "move") {
      if (interaction.started) {
        editor.dispatch({
          type:
            cancelled || !interaction.moved
              ? "selection.move.cancel"
              : "selection.move.commit",
        });
      }
      if (!cancelled && !interaction.moved) {
        editor.dispatch({
          type: "selection.node",
          additive: false,
          id: interaction.nodeId,
        });
      }
    }

    if (interaction.kind === "connection") {
      if (interaction.reconnect) {
        if (!cancelled && interaction.moved && interaction.target) {
          editor.dispatch({
            type: "link.reconnect",
            from: interaction.from,
            id: interaction.reconnect.linkId,
            to: interaction.target,
          });
        } else if (!cancelled && interaction.moved && interaction.dropOnEmpty) {
          host.requestNode(interaction.current, {
            from: interaction.from,
            replacingLinkId: interaction.reconnect.linkId,
          });
        } else if (!cancelled && !interaction.moved) {
          editor.dispatch({
            type: "selection.link",
            additive: interaction.reconnect.additive,
            id: interaction.reconnect.linkId,
          });
        }
        cancelConnection();
      } else if (!cancelled && interaction.target) {
        editor.dispatch({
          type: "link.create",
          from: interaction.from,
          to: interaction.target,
        });
        cancelConnection();
      } else if (!cancelled && interaction.moved) {
        if (interaction.dropOnEmpty) {
          host.requestNode(interaction.current, { from: interaction.from });
        }
        cancelConnection();
      } else if (!cancelled) {
        armedConnection = {
          compatibleTargets: interaction.compatibleTargets,
          from: interaction.from,
        };
        editor.dispatch({
          type: "link.preview",
          current: interaction.origin,
          from: interaction.from,
        });
      } else {
        cancelConnection();
      }
    }

    if (interaction.kind === "link" && !cancelled && !interaction.moved) {
      editor.dispatch({
        type: "selection.link",
        additive: interaction.additive,
        id: interaction.linkId,
      });
    }

    if (interaction.kind === "select") {
      host.setMarquee();
      if (cancelled) {
        restoreSelection(interaction.baseIds);
      } else if (!interaction.dragging && interaction.hitId) {
        editor.dispatch({
          type: "selection.node",
          additive: true,
          id: interaction.hitId,
        });
      }
    }

    if (interaction.kind === "pan" && !cancelled && !interaction.moved) {
      if (interaction.selectNodeOnTap) {
        editor.dispatch({
          type: "selection.node",
          additive: false,
          id: interaction.selectNodeOnTap,
        });
      } else if (interaction.clearSelectionOnClick) {
        editor.dispatch({ type: "selection.clear" });
      }
    }

    releasePointer(event.pointerId);
    interaction = null;
    canvas.dataset.cursor = "grab";
  };

  const pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    canvas.focus();

    const screen = screenPoint(event);
    lastPointerScreen = screen;
    const worldPoint = screenToWorld(screen, host.getViewport());
    const coarsePointer = event.pointerType === "touch";
    const hitPort = editor.hitTestPort(
      worldPoint,
      (coarsePointer ? 24 : 12) / host.getViewport().zoom,
    );
    const hitLink = editor.hitTestLink(
      worldPoint,
      (coarsePointer ? 24 : 12) / host.getViewport().zoom,
    );
    const hit = editor.hitTest(worldPoint);
    const selectionModifier = event.ctrlKey || event.metaKey;

    canvas.setPointerCapture(event.pointerId);

    if (event.pointerType === "touch") {
      if (touches.size === 0) touchSequenceWasMultitouch = false;
      touches.set(event.pointerId, screen);
      if (touches.size >= 2) {
        if (interaction?.kind === "connection" || armedConnection) {
          cancelConnection();
        }
        if (interaction?.kind === "move") {
          if (interaction.started) {
            editor.dispatch({ type: "selection.move.cancel" });
          }
          restoreSelection(interaction.selectionBefore);
        }
        if (interaction?.kind === "route")
          editor.dispatch({ type: "link.route.cancel" });
        if (interaction?.kind === "select") {
          host.setMarquee();
          restoreSelection(interaction.baseIds);
        }
        interaction = null;
        touchSequenceWasMultitouch = true;
        touchGesture = touchGeometry() ?? null;
        canvas.dataset.cursor = "grabbing";
        return;
      }
    }

    if (event.button === 1 || spacePressed) {
      interaction = {
        clearSelectionOnClick: false,
        kind: "pan",
        lastScreen: screen,
        moved: false,
        pointerId: event.pointerId,
        startScreen: screen,
      };
      canvas.dataset.cursor = "grabbing";
      return;
    }

    if (host.isPlacementActive()) {
      host.placeNode(worldPoint);
      releasePointer(event.pointerId);
      canvas.dataset.cursor = "grab";
      return;
    }

    const routeHandle =
      !selectionModifier && !hitPort && !hit
        ? hitRouteHandle(
            worldPoint,
            (coarsePointer ? 24 : 12) / host.getViewport().zoom,
          )
        : undefined;
    if (routeHandle) {
      interaction = {
        kind: "route",
        pointerId: event.pointerId,
        startScreen: screen,
        moved: false,
        axis: routeHandle.axis,
      };
      editor.dispatch({
        type: "link.route.begin",
        id: routeHandle.id,
        route: routeHandle.route,
        segment: routeHandle.index,
      });
      canvas.dataset.cursor =
        routeHandle.axis === "x" ? "ew-resize" : "ns-resize";
      return;
    }

    if (hitPort) {
      const from = { nodeId: hitPort.nodeId, portId: hitPort.port.id };
      if (armedConnection) {
        const target = compatibleTarget(armedConnection, from);
        const armedSourceIsAggregate =
          editor.topology === "aggregate" &&
          editor
            .getState()
            .document.nodes.find(
              ({ configuration }) =>
                configuration.id === armedConnection?.from.nodeId,
            )?.configuration.kind === "process";
        if (
          (armedSourceIsAggregate ||
            !reconnectableLinkAtEndpoint(
              editor.getState().document,
              armedConnection.from,
              editor.topology,
              [],
            )) &&
          target
        ) {
          editor.dispatch({
            type: "link.create",
            from: armedConnection.from,
            to: target,
          });
        }
        cancelConnection();
        releasePointer(event.pointerId);
        canvas.dataset.cursor = "grab";
        return;
      }
      const connectedLink = reconnectableLinkAtEndpoint(
        editor.getState().document,
        from,
        editor.topology,
        editor.getState().selectedLinkIds,
      );
      if (connectedLink) {
        const fixedEndpoint =
          endpointKey(connectedLink.from) === endpointKey(from)
            ? connectedLink.to
            : connectedLink.from;
        const documentWithoutLink = canvasDocumentForConnection(
          editor.getState().document,
          connectedLink.id,
        );
        const intent = connectionIntent(
          documentWithoutLink,
          fixedEndpoint,
          editor.topology,
        );
        interaction = {
          ...intent,
          current: worldPoint,
          dropOnEmpty: false,
          kind: "connection",
          moved: false,
          origin: hitPort.point,
          pointerId: event.pointerId,
          reconnect: {
            additive: selectionModifier,
            linkId: connectedLink.id,
          },
          startScreen: screen,
        };
        editor.dispatch({
          type: "link.preview",
          current: hitPort.point,
          from: fixedEndpoint,
          replacingLinkId: connectedLink.id,
        });
        canvas.dataset.cursor = "crosshair";
        return;
      }
      const intent = connectionIntent(
        editor.getState().document,
        from,
        editor.topology,
      );
      interaction = {
        ...intent,
        current: worldPoint,
        dropOnEmpty: false,
        kind: "connection",
        moved: false,
        origin: hitPort.point,
        pointerId: event.pointerId,
        startScreen: screen,
      };
      editor.dispatch({
        type: "link.preview",
        current: hitPort.point,
        from,
      });
      canvas.dataset.cursor = "crosshair";
      return;
    }

    if (armedConnection) cancelConnection();

    if (selectionModifier) {
      if (hitLink) {
        editor.dispatch({
          type: "selection.link",
          additive: true,
          id: hitLink.id,
        });
        releasePointer(event.pointerId);
        return;
      }
      interaction = {
        baseIds: editor.getState().selectedIds,
        dragging: false,
        hitId: hit ? canvasNodeId(hit) : undefined,
        kind: "select",
        pointerId: event.pointerId,
        startScreen: screen,
      };
      canvas.dataset.cursor = "crosshair";
      return;
    }

    if (hit) {
      const hitId = canvasNodeId(hit);
      const selectionBefore = editor.getState().selectedIds;
      const started = event.pointerType !== "touch";
      if (started) {
        if (!selectionBefore.includes(hitId)) {
          editor.dispatch({
            type: "selection.node",
            additive: false,
            id: hitId,
          });
        }
        editor.dispatch({ type: "selection.move.begin" });
      }
      interaction = {
        kind: "move",
        moved: false,
        nodeId: hitId,
        pointerId: event.pointerId,
        selectionBefore,
        started,
        startScreen: screen,
        startWorld: worldPoint,
      };
      canvas.dataset.cursor = "grabbing";
      return;
    }

    if (hitLink) {
      interaction = {
        additive: false,
        kind: "link",
        linkId: hitLink.id,
        moved: false,
        pointerId: event.pointerId,
        startScreen: screen,
      };
      canvas.dataset.cursor = "pointer";
      return;
    }

    interaction = {
      clearSelectionOnClick: true,
      kind: "pan",
      lastScreen: screen,
      moved: false,
      pointerId: event.pointerId,
      startScreen: screen,
    };
    canvas.dataset.cursor = "grabbing";
  };

  const pointerMove = (event: PointerEvent) => {
    const screen = screenPoint(event);
    lastPointerScreen = screen;

    if (event.pointerType === "touch" && touches.has(event.pointerId)) {
      touches.set(event.pointerId, screen);
      const geometry = touchGeometry();
      if (touchGesture && geometry) {
        host.panBy({
          x: geometry.midpoint.x - touchGesture.midpoint.x,
          y: geometry.midpoint.y - touchGesture.midpoint.y,
        });
        host.zoomAt(
          geometry.distance / touchGesture.distance,
          geometry.midpoint,
        );
        touchGesture = geometry;
        return;
      }
    }

    if (!interaction || interaction.pointerId !== event.pointerId) {
      if (armedConnection) {
        const worldPoint = screenToWorld(screen, host.getViewport());
        const hitPort = editor.hitTestPort(
          worldPoint,
          (event.pointerType === "touch" ? 24 : 14) / host.getViewport().zoom,
        );
        const hovered = hitPort
          ? { nodeId: hitPort.nodeId, portId: hitPort.port.id }
          : undefined;
        editor.dispatch({
          type: "link.preview",
          current: worldPoint,
          from: armedConnection.from,
          ...(hovered ? { target: hovered } : {}),
        });
        canvas.dataset.cursor = "crosshair";
        return;
      }
      const selectionModifier = event.ctrlKey || event.metaKey;
      const worldPoint = screenToWorld(screen, host.getViewport());
      const hoverPort = editor.hitTestPort(
        worldPoint,
        (event.pointerType === "touch" ? 24 : 12) / host.getViewport().zoom,
      );
      const occupiedPort = hoverPort
        ? reconnectableLinkAtEndpoint(
            editor.getState().document,
            {
              nodeId: hoverPort.nodeId,
              portId: hoverPort.port.id,
            },
            editor.topology,
            editor.getState().selectedLinkIds,
          )
        : undefined;
      const routeHandle = !hoverPort
        ? hitRouteHandle(
            worldPoint,
            (event.pointerType === "touch" ? 24 : 12) / host.getViewport().zoom,
          )
        : undefined;
      canvas.dataset.cursor =
        routeHandle && !selectionModifier && !host.isPlacementActive()
          ? routeHandle.axis === "x"
            ? "ew-resize"
            : "ns-resize"
          : host.isPlacementActive()
            ? "crosshair"
            : selectionModifier
              ? "crosshair"
              : hoverPort
                ? occupiedPort
                  ? "pointer"
                  : "crosshair"
                : editor.hitTestLink(
                      worldPoint,
                      (event.pointerType === "touch" ? 24 : 12) /
                        host.getViewport().zoom,
                    )
                  ? "pointer"
                  : editor.hitTest(worldPoint)
                    ? "move"
                    : "grab";
      return;
    }

    if (interaction.kind === "route") {
      if (
        !interaction.moved &&
        !passedDragThreshold(interaction.startScreen, screen, event.pointerType)
      )
        return;
      interaction.moved = true;
      editor.dispatch({
        type: "link.route.update",
        at: screenToWorld(screen, host.getViewport()),
      });
      canvas.dataset.cursor =
        editor.getState().routeEdit?.valid === false
          ? "not-allowed"
          : interaction.axis === "x"
            ? "ew-resize"
            : "ns-resize";
      return;
    }

    if (interaction.kind === "connection") {
      if (
        !interaction.moved &&
        passedDragThreshold(interaction.startScreen, screen, event.pointerType)
      ) {
        interaction.moved = true;
      }
      if (interaction.moved) {
        const bounds = canvas.getBoundingClientRect();
        host.panBy(
          edgePanDelta(
            screen,
            {
              x: screen.x - interaction.startScreen.x,
              y: screen.y - interaction.startScreen.y,
            },
            bounds,
          ),
        );
      }
      const worldPoint = screenToWorld(screen, host.getViewport());
      const hitPort = editor.hitTestPort(
        worldPoint,
        (event.pointerType === "touch" ? 24 : 14) / host.getViewport().zoom,
      );
      const hovered = hitPort
        ? { nodeId: hitPort.nodeId, portId: hitPort.port.id }
        : undefined;
      const target = compatibleTarget(interaction, hovered);
      interaction.current = worldPoint;
      interaction.dropOnEmpty = Boolean(
        !hovered &&
        !editor.hitTest(worldPoint) &&
        !editor.hitTestLink(
          worldPoint,
          (event.pointerType === "touch" ? 24 : 14) / host.getViewport().zoom,
        ),
      );
      interaction.hovered = hovered;
      interaction.target = target;
      editor.dispatch({
        type: "link.preview",
        current: worldPoint,
        from: interaction.from,
        ...(interaction.reconnect
          ? { replacingLinkId: interaction.reconnect.linkId }
          : {}),
        ...(hovered ? { target: hovered } : {}),
      });
      return;
    }

    if (interaction.kind === "link") {
      if (
        !interaction.moved &&
        passedDragThreshold(interaction.startScreen, screen, event.pointerType)
      ) {
        interaction.moved = true;
      }
      return;
    }

    if (interaction.kind === "pan") {
      if (
        !interaction.moved &&
        !passedDragThreshold(interaction.startScreen, screen, event.pointerType)
      ) {
        return;
      }
      interaction.moved = true;
      const delta = {
        x: screen.x - interaction.lastScreen.x,
        y: screen.y - interaction.lastScreen.y,
      };
      interaction.lastScreen = screen;
      host.panBy(delta);
      return;
    }

    if (interaction.kind === "move") {
      if (
        !interaction.moved &&
        !passedDragThreshold(interaction.startScreen, screen, event.pointerType)
      ) {
        return;
      }
      interaction.moved = true;
      const bounds = canvas.getBoundingClientRect();
      host.panBy(
        edgePanDelta(
          screen,
          {
            x: screen.x - interaction.startScreen.x,
            y: screen.y - interaction.startScreen.y,
          },
          bounds,
        ),
      );
      if (!interaction.started) {
        if (!editor.getState().selectedIds.includes(interaction.nodeId)) {
          editor.dispatch({
            type: "selection.node",
            additive: false,
            id: interaction.nodeId,
          });
        }
        editor.dispatch({ type: "selection.move.begin" });
        interaction.started = true;
      }
      const worldPoint = screenToWorld(screen, host.getViewport());
      editor.dispatch({
        type: "selection.move.update",
        delta: {
          x: worldPoint.x - interaction.startWorld.x,
          y: worldPoint.y - interaction.startWorld.y,
        },
      });
      return;
    }

    if (
      !interaction.dragging &&
      !passedDragThreshold(interaction.startScreen, screen, event.pointerType)
    ) {
      return;
    }
    interaction.dragging = true;

    const screenRectangle = {
      height: screen.y - interaction.startScreen.y,
      width: screen.x - interaction.startScreen.x,
      x: interaction.startScreen.x,
      y: interaction.startScreen.y,
    };
    const viewport = host.getViewport();
    const startWorld = screenToWorld(interaction.startScreen, viewport);
    const currentWorld = screenToWorld(screen, viewport);
    host.setMarquee(screenRectangle);
    editor.dispatch({
      type: "selection.marquee",
      baseIds: interaction.baseIds,
      rectangle: {
        height: currentWorld.y - startWorld.y,
        width: currentWorld.x - startWorld.x,
        x: startWorld.x,
        y: startWorld.y,
      },
    });
  };

  const finishTouch = (event: PointerEvent, cancelled = false) => {
    if (!touches.has(event.pointerId)) {
      finishInteraction(event, cancelled);
      return;
    }

    touches.delete(event.pointerId);
    if (!touchSequenceWasMultitouch) {
      finishInteraction(event, cancelled);
      return;
    }

    releasePointer(event.pointerId);
    if (touches.size >= 2) {
      interaction = null;
      touchGesture = touchGeometry() ?? null;
    } else if (touches.size === 1 && !cancelled) {
      touchGesture = null;
      const remaining = touchPair()[0];
      if (!remaining) return;
      interaction = {
        clearSelectionOnClick: false,
        kind: "pan",
        lastScreen: remaining[1],
        moved: true,
        pointerId: remaining[0],
        startScreen: remaining[1],
      };
      canvas.dataset.cursor = "grabbing";
    } else {
      interaction = null;
      touchGesture = null;
      canvas.dataset.cursor = "grab";
    }
    if (touches.size === 0) touchSequenceWasMultitouch = false;
  };

  const pointerUp = (event: PointerEvent) => finishTouch(event);
  const pointerCancel = (event: PointerEvent) => finishTouch(event, true);

  const doubleClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const screen = screenPoint(event);
    const worldPoint = screenToWorld(screen, host.getViewport());
    const link = editor.hitTestLink(worldPoint, 12 / host.getViewport().zoom);
    if (
      link &&
      !editor.hitTestPort(worldPoint, 12 / host.getViewport().zoom) &&
      !editor.hitTest(worldPoint)
    ) {
      const path = materialLinkPath(editor.getState().document, link);
      const handle = path?.route
        ? routeHandles(path.route).toSorted((a, b) => {
            const distance = (handle: typeof a) => {
              const from = handle.route[handle.index]!;
              const to = handle.route[handle.index + 1]!;
              return Math.hypot(
                worldPoint.x -
                  Math.max(
                    Math.min(from.x, to.x),
                    Math.min(Math.max(from.x, to.x), worldPoint.x),
                  ),
                worldPoint.y -
                  Math.max(
                    Math.min(from.y, to.y),
                    Math.min(Math.max(from.y, to.y), worldPoint.y),
                  ),
              );
            };
            return distance(a) - distance(b);
          })[0]
        : undefined;
      if (handle)
        editor.dispatch({
          type: "link.route.bend",
          id: link.id,
          segment: handle.index,
        });
      return;
    }
    if (
      !editor.hitTest(worldPoint) &&
      !editor.hitTestPort(worldPoint, 12 / host.getViewport().zoom) &&
      !editor.hitTestLink(worldPoint, 12 / host.getViewport().zoom)
    ) {
      host.fit("all");
    }
  };

  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const anchor = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    const deltaY =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * 16
        : event.deltaY;
    host.zoomAt(Math.exp(-deltaY * 0.002), anchor);
  };

  const keyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return;

    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (modifier && key === "z") {
      event.preventDefault();
      editor.dispatch({
        type: event.shiftKey ? "history.redo" : "history.undo",
      });
    } else if (modifier && key === "y") {
      event.preventDefault();
      editor.dispatch({ type: "history.redo" });
    } else if (modifier && key === "c") {
      event.preventDefault();
      editor.dispatch({ type: "selection.copy" });
    } else if (modifier && key === "v") {
      event.preventDefault();
      editor.dispatch({ type: "selection.paste" });
    } else if (modifier && key === "d") {
      event.preventDefault();
      editor.dispatch({ type: "selection.duplicate" });
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      editor.dispatch({ type: "selection.delete" });
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (interaction?.kind === "route")
        editor.dispatch({ type: "link.route.cancel" });
      if (interaction?.kind === "move") {
        editor.dispatch({ type: "selection.move.cancel" });
      }
      if (interaction?.kind === "connection") {
        cancelConnection();
      }
      if (interaction?.kind === "select") host.setMarquee();
      if (interaction) {
        releasePointer(interaction.pointerId);
        interaction = null;
        canvas.dataset.cursor = "grab";
        return;
      }
      if (armedConnection) {
        cancelConnection();
        canvas.dataset.cursor = "grab";
        return;
      }
      if (host.isPlacementActive()) {
        host.cancelPlacement();
        canvas.dataset.cursor = "grab";
        return;
      }
      editor.dispatch({ type: "selection.clear" });
    } else if (event.key.startsWith("Arrow")) {
      const state = editor.getState();
      if (state.selectedIds.length === 0) return;
      event.preventDefault();
      const step = state.snapToGrid
        ? event.shiftKey
          ? GRID_INTERVAL
          : SNAP_INTERVAL
        : event.shiftKey
          ? 4
          : 1;
      editor.dispatch({
        type: "selection.nudge",
        delta: {
          x:
            event.key === "ArrowLeft"
              ? -step
              : event.key === "ArrowRight"
                ? step
                : 0,
          y:
            event.key === "ArrowUp"
              ? -step
              : event.key === "ArrowDown"
                ? step
                : 0,
        },
      });
    } else if (!modifier && key === "n" && !event.repeat) {
      event.preventDefault();
      host.requestNode(
        screenToWorld(
          lastPointerScreen ?? host.getViewportCenter(),
          host.getViewport(),
        ),
      );
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      host.zoomAt(ZOOM_STEP, host.getViewportCenter());
    } else if (event.key === "-") {
      event.preventDefault();
      host.zoomAt(1 / ZOOM_STEP, host.getViewportCenter());
    } else if (event.key === "0") {
      event.preventDefault();
      host.resetView();
    } else if (event.key === "1") {
      event.preventDefault();
      host.fit("all");
    } else if (event.key === "2") {
      event.preventDefault();
      host.fit("selection");
    } else if (
      event.code === "Space" &&
      (document.activeElement === canvas ||
        document.activeElement === document.body)
    ) {
      event.preventDefault();
      spacePressed = true;
      if (!interaction) canvas.dataset.cursor = "grab";
    }
  };

  const keyUp = (event: KeyboardEvent) => {
    if (event.code !== "Space") return;
    spacePressed = false;
    if (!interaction) canvas.dataset.cursor = "grab";
  };

  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerCancel);
  canvas.addEventListener("dblclick", doubleClick);
  canvas.addEventListener("wheel", wheel, { passive: false });
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);

  return () => {
    if (interaction?.kind === "route")
      editor.dispatch({ type: "link.route.cancel" });
    if (interaction?.kind === "move") {
      editor.dispatch({ type: "selection.move.cancel" });
    }
    if (interaction?.kind === "connection") {
      cancelConnection();
    }
    if (interaction?.kind === "select") host.setMarquee();
    if (interaction) releasePointer(interaction.pointerId);
    interaction = null;
    if (armedConnection) cancelConnection();
    spacePressed = false;
    touches.clear();
    touchSequenceWasMultitouch = false;
    touchGesture = null;

    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("pointerup", pointerUp);
    canvas.removeEventListener("pointercancel", pointerCancel);
    canvas.removeEventListener("dblclick", doubleClick);
    canvas.removeEventListener("wheel", wheel);
    window.removeEventListener("keydown", keyDown);
    window.removeEventListener("keyup", keyUp);
  };
}
