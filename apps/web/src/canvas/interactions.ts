import type { CanvasEditor, Rectangle } from "./editor";
import {
  screenToWorld,
  ZOOM_STEP,
  type Point,
  type Viewport,
} from "./viewport";

const DRAG_THRESHOLD = 4;

type Interaction =
  | {
      clearSelectionOnClick: boolean;
      kind: "pan";
      lastScreen: Point;
      moved: boolean;
      pointerId: number;
      startScreen: Point;
    }
  | {
      kind: "move";
      moved: boolean;
      nodeId: string;
      pointerId: number;
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
  getViewport: () => Viewport;
  getViewportCenter: () => Point;
  panBy: (delta: Point) => void;
  requestNode: (at: Point) => void;
  resetView: () => void;
  setMarquee: (rectangle?: Rectangle) => void;
  zoomAt: (factor: number, anchor: Point) => void;
}>;

function passedDragThreshold(start: Point, current: Point) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= DRAG_THRESHOLD;
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, [contenteditable='true'], [role='menu']"));
}

export function attachCanvasInteractions(
  canvas: HTMLCanvasElement,
  editor: CanvasEditor,
  host: CanvasInteractionHost,
) {
  let interaction: Interaction | null = null;
  let lastPointerScreen: Point | null = null;
  let spacePressed = false;

  const screenPoint = (event: PointerEvent): Point => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const restoreSelection = (ids: readonly string[]) => {
    editor.dispatch({ type: "selection.clear" });
    for (const id of ids) {
      editor.dispatch({ type: "selection.node", additive: true, id });
    }
  };

  const releasePointer = (pointerId: number) => {
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  };

  const finishInteraction = (event: PointerEvent, cancelled = false) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    if (interaction.kind === "move") {
      editor.dispatch({
        type: cancelled || !interaction.moved
          ? "selection.move.cancel"
          : "selection.move.commit",
      });
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

    if (
      interaction.kind === "pan" &&
      !cancelled &&
      !interaction.moved &&
      interaction.clearSelectionOnClick
    ) {
      editor.dispatch({ type: "selection.clear" });
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
        hitId: hit?.id,
        kind: "select",
        pointerId: event.pointerId,
        startScreen: screen,
      };
      canvas.dataset.cursor = "crosshair";
      return;
    }

    if (hit) {
      const hitIsSelected = editor.getState().selectedIds.includes(hit.id);
      if (!hitIsSelected) {
        editor.dispatch({
          type: "selection.node",
          additive: false,
          id: hit.id,
        });
      }

      editor.dispatch({ type: "selection.move.begin" });
      interaction = {
        kind: "move",
        moved: false,
        nodeId: hit.id,
        pointerId: event.pointerId,
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
      if (!interaction.moved && !passedDragThreshold(interaction.startScreen, screen)) {
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
      if (!interaction.moved && !passedDragThreshold(interaction.startScreen, screen)) {
        return;
      }
      interaction.moved = true;
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

    if (!interaction.dragging && !passedDragThreshold(interaction.startScreen, screen)) {
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
      baseIds: [],
      rectangle: {
        height: currentWorld.y - startWorld.y,
        width: currentWorld.x - startWorld.x,
        x: startWorld.x,
        y: startWorld.y,
      },
    });
  };

  const pointerUp = (event: PointerEvent) => finishInteraction(event);
  const pointerCancel = (event: PointerEvent) => finishInteraction(event, true);

  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const anchor = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    const deltaY = event.deltaMode === WheelEvent.DOM_DELTA_LINE
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
      editor.dispatch({ type: event.shiftKey ? "history.redo" : "history.undo" });
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
      }
      editor.dispatch({ type: "selection.clear" });
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
    } else if (
      event.code === "Space" &&
      (document.activeElement === canvas || document.activeElement === document.body)
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

    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("pointerup", pointerUp);
    canvas.removeEventListener("pointercancel", pointerCancel);
    canvas.removeEventListener("wheel", wheel);
    window.removeEventListener("keydown", keyDown);
    window.removeEventListener("keyup", keyUp);
  };
}
