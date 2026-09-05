import { canvasNodeId } from "./document";
import type { CanvasEditor } from "./editor";
import type { Point, Rectangle } from "./geometry";
import { GRID_INTERVAL, SNAP_INTERVAL } from "./grid";
import { screenToWorld, ZOOM_STEP, type Viewport } from "./viewport";

const MOUSE_DRAG_THRESHOLD = 4;
const TOUCH_DRAG_THRESHOLD = 10;

type Interaction =
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

export type CanvasInteractionHost = Readonly<{
  fit: (scope: "all" | "selection") => void;
  getViewport: () => Viewport;
  getViewportCenter: () => Point;
  panBy: (delta: Point) => void;
  requestNode: (at: Point) => void;
  resetView: () => void;
  setMarquee: (rectangle?: Rectangle) => void;
  zoomAt: (factor: number, anchor: Point) => void;
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

  const finishInteraction = (event: PointerEvent, cancelled = false) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;

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
    const hit = editor.hitTest(worldPoint);
    const selectionModifier = event.ctrlKey || event.metaKey;

    canvas.setPointerCapture(event.pointerId);

    if (event.pointerType === "touch") {
      if (touches.size === 0) touchSequenceWasMultitouch = false;
      touches.set(event.pointerId, screen);
      if (touches.size >= 2) {
        if (interaction?.kind === "move") {
          if (interaction.started) {
            editor.dispatch({ type: "selection.move.cancel" });
          }
          restoreSelection(interaction.selectionBefore);
        }
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

    if (selectionModifier) {
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
      const touchCanMoveNode =
        event.pointerType === "touch" && selectionBefore.includes(hitId);
      if (event.pointerType === "touch" && !touchCanMoveNode) {
        interaction = {
          clearSelectionOnClick: false,
          kind: "pan",
          lastScreen: screen,
          moved: false,
          pointerId: event.pointerId,
          selectNodeOnTap: hitId,
          startScreen: screen,
        };
        canvas.dataset.cursor = "grabbing";
        return;
      }
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
      const selectionModifier = event.ctrlKey || event.metaKey;
      canvas.dataset.cursor = selectionModifier
        ? "crosshair"
        : editor.hitTest(screenToWorld(screen, host.getViewport()))
          ? "move"
          : "grab";
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
    if (!editor.hitTest(screenToWorld(screen, host.getViewport()))) {
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
      if (interaction?.kind === "move") {
        editor.dispatch({ type: "selection.move.cancel" });
      }
      if (interaction?.kind === "select") host.setMarquee();
      if (interaction) {
        releasePointer(interaction.pointerId);
        interaction = null;
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
    if (interaction?.kind === "move") {
      editor.dispatch({ type: "selection.move.cancel" });
    }
    if (interaction?.kind === "select") host.setMarquee();
    if (interaction) releasePointer(interaction.pointerId);
    interaction = null;
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
