import { Application, Container, Graphics, Text } from "pixi.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  SNAP_INTERVAL,
  type CanvasEditor,
  type CanvasEditorState,
  type Rectangle,
} from "./editor";
import {
  panViewport,
  screenToWorld,
  zoomViewportAt,
  type Point,
  type Viewport,
} from "./viewport";

const ZOOM_STEP = 1.2;
const DRAG_THRESHOLD = 4;

export type InfiniteCanvasHandle = {
  getViewportCenter: () => Point;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type InfiniteCanvasProps = {
  editor: CanvasEditor;
  onRequestAddNode: (at: Point) => void;
  onViewportChange: (viewport: Viewport) => void;
};

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

function passedDragThreshold(start: Point, current: Point) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= DRAG_THRESHOLD;
}

type NodeDisplay = {
  card: Graphics;
  container: Container;
  label: Text;
  visualKey: string;
};

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function drawGrid(
  graphics: Graphics,
  viewport: Viewport,
  width: number,
  height: number,
) {
  graphics.clear();

  let spacing = SNAP_INTERVAL * viewport.zoom;
  while (spacing < 20) spacing *= 2;

  const offsetX = positiveModulo(viewport.x, spacing);
  const offsetY = positiveModulo(viewport.y, spacing);

  for (let x = offsetX; x <= width; x += spacing) {
    for (let y = offsetY; y <= height; y += spacing) {
      graphics.circle(x, y, 1);
    }
  }

  const dark = document.documentElement.classList.contains("dark");
  graphics.fill({ color: dark ? 0xa1a1aa : 0x9ca3af, alpha: dark ? 0.4 : 0.34 });
}

function drawScene(
  scene: Container,
  state: CanvasEditorState,
  displays: Map<string, NodeDisplay>,
) {
  const dark = document.documentElement.classList.contains("dark");
  const selectedIds = new Set(state.selectedIds);
  const liveIds = new Set(state.document.nodes.map((node) => node.id));

  for (const [id, display] of displays) {
    if (liveIds.has(id)) continue;
    scene.removeChild(display.container);
    display.container.destroy({ children: true });
    displays.delete(id);
  }

  for (const [index, node] of state.document.nodes.entries()) {
    const selected = selectedIds.has(node.id);
    const visualKey = `${dark}:${selected}:${node.width}:${node.height}:${node.label}`;
    let display = displays.get(node.id);

    if (!display) {
      const container = new Container();
      const card = new Graphics();
      const label = new Text({ text: node.label });
      label.anchor.set(0.5);
      container.addChild(card, label);
      display = { card, container, label, visualKey: "" };
      displays.set(node.id, display);
    }

    display.container.position.set(node.x, node.y);
    if (display.container.parent !== scene) scene.addChild(display.container);
    if (scene.children[index] !== display.container) {
      scene.setChildIndex(display.container, index);
    }

    if (display.visualKey === visualKey) continue;

    display.card
      .clear()
      .roundRect(0, 0, node.width, node.height, 10)
      .fill({ color: dark ? 0x202024 : 0xffffff, alpha: 0.98 })
      .stroke({
        color: selected ? 0x6366f1 : dark ? 0x52525b : 0xd4d4d8,
        width: selected ? 2 : 1,
      });

    display.label.text = node.label;
    display.label.position.set(node.width / 2, node.height / 2);
    display.label.style = {
      fill: dark ? 0xf4f4f5 : 0x27272a,
      fontFamily: "Inter Variable, Inter, sans-serif",
      fontSize: 14,
      fontWeight: "600",
    };
    display.visualKey = visualKey;
  }
}

function drawMarquee(graphics: Graphics, rectangle?: Rectangle) {
  graphics.clear();
  if (!rectangle) return;

  const x = rectangle.width < 0 ? rectangle.x + rectangle.width : rectangle.x;
  const y = rectangle.height < 0 ? rectangle.y + rectangle.height : rectangle.y;
  const width = Math.abs(rectangle.width);
  const height = Math.abs(rectangle.height);

  graphics
    .rect(x, y, width, height)
    .fill({ color: 0x6366f1, alpha: 0.1 })
    .stroke({ color: 0x6366f1, alpha: 0.8, pixelLine: true, width: 1 });
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, [contenteditable='true'], [role='menu']"));
}

export const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, InfiniteCanvasProps>(
  function InfiniteCanvas({ editor, onRequestAddNode, onViewportChange }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const gridRef = useRef<Graphics | null>(null);
    const sceneRef = useRef<Container | null>(null);
    const nodeDisplaysRef = useRef(new Map<string, NodeDisplay>());
    const worldRef = useRef<Container | null>(null);
    const marqueeRef = useRef<Graphics | null>(null);
    const interactionRef = useRef<Interaction | null>(null);
    const lastPointerScreenRef = useRef<Point | null>(null);
    const spacePressedRef = useRef(false);
    const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });

    const redraw = () => {
      const scene = sceneRef.current;
      if (scene) drawScene(scene, editor.getState(), nodeDisplaysRef.current);
    };

    const renderViewport = (viewport: Viewport) => {
      viewportRef.current = viewport;

      const app = appRef.current;
      const grid = gridRef.current;
      const world = worldRef.current;

      if (app && grid && world) {
        world.position.set(viewport.x, viewport.y);
        world.scale.set(viewport.zoom);
        drawGrid(grid, viewport, app.screen.width, app.screen.height);
      }

      onViewportChange(viewport);
    };

    const viewportCenter = (): Point => {
      const app = appRef.current;
      return app
        ? { x: app.screen.width / 2, y: app.screen.height / 2 }
        : { x: 0, y: 0 };
    };

    const zoomBy = (factor: number) => {
      const current = viewportRef.current;
      renderViewport(zoomViewportAt(current, current.zoom * factor, viewportCenter()));
    };

    const resetView = () => {
      const center = viewportCenter();
      renderViewport({ x: center.x, y: center.y, zoom: 1 });
    };

    const getViewportCenter = () =>
      screenToWorld(viewportCenter(), viewportRef.current);

    useImperativeHandle(ref, () => ({
      getViewportCenter,
      resetView,
      zoomIn: () => zoomBy(ZOOM_STEP),
      zoomOut: () => zoomBy(1 / ZOOM_STEP),
    }));

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const app = new Application();
      let active = true;
      let resizeObserver: ResizeObserver | undefined;
      let themeObserver: MutationObserver | undefined;
      let unsubscribeEditor: (() => void) | undefined;
      let removeListeners: (() => void) | undefined;

      void app
        .init({
          antialias: true,
          autoDensity: true,
          backgroundAlpha: 0,
          height: Math.max(host.clientHeight, 1),
          preference: "webgl",
          resolution: Math.min(window.devicePixelRatio, 2),
          width: Math.max(host.clientWidth, 1),
        })
        .then(() => {
          if (!active) {
            app.destroy(true);
            return;
          }

          appRef.current = app;
          app.canvas.className = "infinite-canvas__surface";
          app.canvas.setAttribute("aria-label", "Infinite canvas");
          app.canvas.setAttribute("role", "application");
          app.canvas.dataset.cursor = "grab";
          app.canvas.tabIndex = 0;
          host.appendChild(app.canvas);

          const grid = new Graphics();
          const world = new Container();
          const scene = new Container();
          const marquee = new Graphics();
          world.addChild(scene);
          app.stage.addChild(grid, world, marquee);
          gridRef.current = grid;
          worldRef.current = world;
          sceneRef.current = scene;
          marqueeRef.current = marquee;

          const initialViewport = {
            x: app.screen.width / 2,
            y: app.screen.height / 2,
            zoom: 1,
          };
          renderViewport(initialViewport);
          redraw();
          let canvasSize = {
            height: app.screen.height,
            width: app.screen.width,
          };

          const canvas = app.canvas;
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

          const finishInteraction = (event: PointerEvent, cancelled = false) => {
            const interaction = interactionRef.current;
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
              drawMarquee(marquee);
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

            interactionRef.current = null;
            canvas.dataset.cursor = "grab";
            if (canvas.hasPointerCapture(event.pointerId)) {
              canvas.releasePointerCapture(event.pointerId);
            }
          };

          const pointerUp = (event: PointerEvent) => finishInteraction(event);
          const pointerCancel = (event: PointerEvent) =>
            finishInteraction(event, true);

          const pointerDown = (event: PointerEvent) => {
            if (event.button !== 0 && event.button !== 1) return;
            event.preventDefault();
            canvas.focus();

            const screen = screenPoint(event);
            lastPointerScreenRef.current = screen;
            const worldPoint = screenToWorld(screen, viewportRef.current);
            const hit = editor.hitTest(worldPoint);
            const selectionModifier = event.ctrlKey || event.metaKey;

            canvas.setPointerCapture(event.pointerId);

            if (event.button === 1 || spacePressedRef.current) {
              interactionRef.current = {
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
              interactionRef.current = {
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
              interactionRef.current = {
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

            interactionRef.current = {
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
            lastPointerScreenRef.current = screen;
            const interaction = interactionRef.current;

            if (!interaction || interaction.pointerId !== event.pointerId) {
              const selectionModifier = event.ctrlKey || event.metaKey;
              canvas.dataset.cursor = selectionModifier
                ? "crosshair"
                : editor.hitTest(screenToWorld(screen, viewportRef.current))
                  ? "move"
                  : "grab";
              return;
            }

            if (interaction.kind === "pan") {
              if (
                !interaction.moved &&
                !passedDragThreshold(interaction.startScreen, screen)
              ) {
                return;
              }
              interaction.moved = true;
              const delta = {
                x: screen.x - interaction.lastScreen.x,
                y: screen.y - interaction.lastScreen.y,
              };
              interaction.lastScreen = screen;
              renderViewport(panViewport(viewportRef.current, delta));
              return;
            }

            if (interaction.kind === "move") {
              if (
                !interaction.moved &&
                !passedDragThreshold(interaction.startScreen, screen)
              ) {
                return;
              }
              interaction.moved = true;
              const worldPoint = screenToWorld(screen, viewportRef.current);
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
              !passedDragThreshold(interaction.startScreen, screen)
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
            const startWorld = screenToWorld(interaction.startScreen, viewportRef.current);
            const currentWorld = screenToWorld(screen, viewportRef.current);
            drawMarquee(marquee, screenRectangle);
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
            const factor = Math.exp(-deltaY * 0.002);
            renderViewport(
              zoomViewportAt(
                viewportRef.current,
                viewportRef.current.zoom * factor,
                anchor,
              ),
            );
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
              const interaction = interactionRef.current;
              if (interaction?.kind === "move") {
                editor.dispatch({ type: "selection.move.cancel" });
              }
              if (interaction?.kind === "select") drawMarquee(marquee);
              if (interaction) {
                if (canvas.hasPointerCapture(interaction.pointerId)) {
                  canvas.releasePointerCapture(interaction.pointerId);
                }
                interactionRef.current = null;
                canvas.dataset.cursor = "grab";
              }
              editor.dispatch({ type: "selection.clear" });
            } else if (!modifier && key === "n" && !event.repeat) {
              event.preventDefault();
              onRequestAddNode(
                screenToWorld(
                  lastPointerScreenRef.current ?? viewportCenter(),
                  viewportRef.current,
                ),
              );
            } else if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              zoomBy(ZOOM_STEP);
            } else if (event.key === "-") {
              event.preventDefault();
              zoomBy(1 / ZOOM_STEP);
            } else if (event.key === "0") {
              event.preventDefault();
              resetView();
            } else if (
              event.code === "Space" &&
              (document.activeElement === canvas || document.activeElement === document.body)
            ) {
              event.preventDefault();
              spacePressedRef.current = true;
              if (!interactionRef.current) canvas.dataset.cursor = "grab";
            }
          };

          const keyUp = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            spacePressedRef.current = false;
            if (!interactionRef.current) canvas.dataset.cursor = "grab";
          };

          canvas.addEventListener("pointerdown", pointerDown);
          canvas.addEventListener("pointermove", pointerMove);
          canvas.addEventListener("pointerup", pointerUp);
          canvas.addEventListener("pointercancel", pointerCancel);
          canvas.addEventListener("wheel", wheel, { passive: false });
          window.addEventListener("keydown", keyDown);
          window.addEventListener("keyup", keyUp);

          resizeObserver = new ResizeObserver(([entry]) => {
            if (!entry) return;

            const nextSize = {
              height: Math.max(entry.contentRect.height, 1),
              width: Math.max(entry.contentRect.width, 1),
            };

            app.renderer.resize(nextSize.width, nextSize.height);
            renderViewport(
              panViewport(viewportRef.current, {
                x: (nextSize.width - canvasSize.width) / 2,
                y: (nextSize.height - canvasSize.height) / 2,
              }),
            );
            canvasSize = nextSize;
          });
          resizeObserver.observe(host);

          themeObserver = new MutationObserver(() => {
            drawGrid(grid, viewportRef.current, app.screen.width, app.screen.height);
            redraw();
          });
          themeObserver.observe(document.documentElement, {
            attributeFilter: ["class"],
            attributes: true,
          });

          unsubscribeEditor = editor.subscribe(redraw);

          removeListeners = () => {
            canvas.removeEventListener("pointerdown", pointerDown);
            canvas.removeEventListener("pointermove", pointerMove);
            canvas.removeEventListener("pointerup", pointerUp);
            canvas.removeEventListener("pointercancel", pointerCancel);
            canvas.removeEventListener("wheel", wheel);
            window.removeEventListener("keydown", keyDown);
            window.removeEventListener("keyup", keyUp);
          };
        });

      return () => {
        active = false;
        removeListeners?.();
        unsubscribeEditor?.();
        resizeObserver?.disconnect();
        themeObserver?.disconnect();
        interactionRef.current = null;
        gridRef.current = null;
        sceneRef.current = null;
        worldRef.current = null;
        marqueeRef.current = null;
        nodeDisplaysRef.current.clear();

        if (appRef.current === app) {
          appRef.current = null;
          app.destroy(true, { children: true });
        }
      };
    }, [editor, onRequestAddNode, onViewportChange]);

    return (
      <div
        className="infinite-canvas"
        onContextMenu={(event: ReactMouseEvent<HTMLDivElement>) => event.preventDefault()}
        ref={hostRef}
      />
    );
  },
);
