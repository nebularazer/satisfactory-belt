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

export type InfiniteCanvasHandle = {
  addNode: () => void;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type InfiniteCanvasProps = {
  editor: CanvasEditor;
  onViewportChange: (viewport: Viewport) => void;
};

type Interaction =
  | { kind: "pan"; pointerId: number; lastScreen: Point }
  | { kind: "move"; pointerId: number; startWorld: Point }
  | {
      kind: "marquee";
      pointerId: number;
      startScreen: Point;
      baseIds: readonly string[];
    };

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
  function InfiniteCanvas({ editor, onViewportChange }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const gridRef = useRef<Graphics | null>(null);
    const sceneRef = useRef<Container | null>(null);
    const nodeDisplaysRef = useRef(new Map<string, NodeDisplay>());
    const worldRef = useRef<Container | null>(null);
    const marqueeRef = useRef<Graphics | null>(null);
    const interactionRef = useRef<Interaction | null>(null);
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

    const addNode = () => {
      editor.dispatch({
        type: "node.create",
        at: screenToWorld(viewportCenter(), viewportRef.current),
      });
    };

    useImperativeHandle(ref, () => ({
      addNode,
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

          const finishInteraction = (event: PointerEvent, cancelled = false) => {
            const interaction = interactionRef.current;
            if (!interaction || interaction.pointerId !== event.pointerId) return;

            if (interaction.kind === "move") {
              editor.dispatch({
                type: cancelled ? "selection.move.cancel" : "selection.move.commit",
              });
            }

            if (interaction.kind === "marquee") {
              drawMarquee(marquee);
              if (cancelled) {
                editor.dispatch({
                  type: "selection.marquee",
                  baseIds: interaction.baseIds,
                  rectangle: { height: 0, width: 0, x: 0, y: 0 },
                });
              }
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
            const worldPoint = screenToWorld(screen, viewportRef.current);
            const hit = editor.hitTest(worldPoint);
            const selectionModifier =
              event.ctrlKey || event.metaKey || event.shiftKey;
            const shouldPan =
              event.button === 1 ||
              spacePressedRef.current ||
              (event.button === 0 && !selectionModifier);

            canvas.setPointerCapture(event.pointerId);

            if (shouldPan) {
              interactionRef.current = {
                kind: "pan",
                lastScreen: screen,
                pointerId: event.pointerId,
              };
              canvas.dataset.cursor = "grabbing";
              return;
            }

            if (hit) {
              const hitIsSelected = editor.getState().selectedIds.includes(hit.id);
              if (!hitIsSelected || event.shiftKey) {
                editor.dispatch({
                  type: "selection.node",
                  additive: event.shiftKey,
                  id: hit.id,
                });
              }

              if (editor.getState().selectedIds.includes(hit.id)) {
                editor.dispatch({ type: "selection.move.begin" });
                interactionRef.current = {
                  kind: "move",
                  pointerId: event.pointerId,
                  startWorld: worldPoint,
                };
                canvas.dataset.cursor = "grabbing";
              }
              return;
            }

            const baseIds = event.shiftKey ? editor.getState().selectedIds : [];
            if (!event.shiftKey) editor.dispatch({ type: "selection.clear" });
            interactionRef.current = {
              baseIds,
              kind: "marquee",
              pointerId: event.pointerId,
              startScreen: screen,
            };
            drawMarquee(marquee, { height: 0, width: 0, x: screen.x, y: screen.y });
            canvas.dataset.cursor = "crosshair";
          };

          const pointerMove = (event: PointerEvent) => {
            const screen = screenPoint(event);
            const interaction = interactionRef.current;

            if (!interaction || interaction.pointerId !== event.pointerId) {
              const selectionModifier =
                event.ctrlKey || event.metaKey || event.shiftKey;
              canvas.dataset.cursor = selectionModifier
                ? editor.hitTest(screenToWorld(screen, viewportRef.current))
                  ? "move"
                  : "crosshair"
                : "grab";
              return;
            }

            if (interaction.kind === "pan") {
              const delta = {
                x: screen.x - interaction.lastScreen.x,
                y: screen.y - interaction.lastScreen.y,
              };
              interaction.lastScreen = screen;
              renderViewport(panViewport(viewportRef.current, delta));
              return;
            }

            if (interaction.kind === "move") {
              const worldPoint = screenToWorld(screen, viewportRef.current);
              editor.dispatch({
                type: "selection.move.update",
                bypassSnap: event.altKey,
                delta: {
                  x: worldPoint.x - interaction.startWorld.x,
                  y: worldPoint.y - interaction.startWorld.y,
                },
              });
              return;
            }

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
              baseIds: interaction.baseIds,
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
              if (interaction?.kind === "marquee") drawMarquee(marquee);
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
              addNode();
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
    }, [editor, onViewportChange]);

    return (
      <div
        className="infinite-canvas"
        onContextMenu={(event: ReactMouseEvent<HTMLDivElement>) => event.preventDefault()}
        ref={hostRef}
      />
    );
  },
);
