import { Application, Container, Graphics, Text, type Ticker } from "pixi.js";
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
import { attachCanvasInteractions } from "./interactions";
import {
  createPerformanceSampler,
  type CanvasPerformanceMetrics,
} from "./performance";
import {
  panViewport,
  screenToWorld,
  ZOOM_STEP,
  zoomViewportAt,
  type Point,
  type Viewport,
} from "./viewport";

const MAX_TEXT_RESOLUTION = 4;

export type InfiniteCanvasHandle = {
  getViewportCenter: () => Point;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type InfiniteCanvasProps = {
  editor: CanvasEditor;
  onPerformanceMetricsChange: (metrics: CanvasPerformanceMetrics) => void;
  onRequestAddNode: (at: Point) => void;
  onViewportChange: (viewport: Viewport) => void;
  performanceMetricsEnabled: boolean;
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
      graphics.circle(x, y, 1.25);
    }
  }

  const dark = document.documentElement.classList.contains("dark");
  graphics.fill({
    color: dark ? 0xd4d4d8 : 0x71717a,
    alpha: dark ? 0.34 : 0.4,
  });
}

function textResolutionForZoom(zoom: number, rendererResolution: number) {
  return Math.min(
    MAX_TEXT_RESOLUTION,
    Math.max(rendererResolution, Math.ceil(zoom * rendererResolution)),
  );
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
      .fill({ color: dark ? 0x202024 : 0xffffff })
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

export const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, InfiniteCanvasProps>(
  function InfiniteCanvas(
    {
      editor,
      onPerformanceMetricsChange,
      onRequestAddNode,
      onViewportChange,
      performanceMetricsEnabled,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const gridRef = useRef<Graphics | null>(null);
    const sceneRef = useRef<Container | null>(null);
    const nodeDisplaysRef = useRef(new Map<string, NodeDisplay>());
    const worldRef = useRef<Container | null>(null);
    const marqueeRef = useRef<Graphics | null>(null);
    const onPerformanceMetricsChangeRef = useRef(onPerformanceMetricsChange);
    const performanceMetricsEnabledRef = useRef(performanceMetricsEnabled);
    const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });

    onPerformanceMetricsChangeRef.current = onPerformanceMetricsChange;
    performanceMetricsEnabledRef.current = performanceMetricsEnabled;

    const updateTextResolution = () => {
      const app = appRef.current;
      if (!app) return;

      const resolution = textResolutionForZoom(
        viewportRef.current.zoom,
        app.renderer.resolution,
      );
      for (const { label } of nodeDisplaysRef.current.values()) {
        if (label.resolution !== resolution) label.resolution = resolution;
      }
    };

    const redraw = () => {
      const scene = sceneRef.current;
      if (scene) drawScene(scene, editor.getState(), nodeDisplaysRef.current);
      updateTextResolution();
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
        updateTextResolution();
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
      let removePerformanceListener: (() => void) | undefined;
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

          removeListeners = attachCanvasInteractions(canvas, editor, {
            getViewport: () => viewportRef.current,
            getViewportCenter: viewportCenter,
            panBy: (delta) => {
              renderViewport(panViewport(viewportRef.current, delta));
            },
            requestNode: onRequestAddNode,
            resetView,
            setMarquee: (rectangle) => drawMarquee(marquee, rectangle),
            zoomAt: (factor, anchor) => {
              const current = viewportRef.current;
              renderViewport(
                zoomViewportAt(current, current.zoom * factor, anchor),
              );
            },
          });

          const performanceSampler = createPerformanceSampler((metrics) => {
            onPerformanceMetricsChangeRef.current(metrics);
          });
          let wasSamplingPerformance = false;
          const samplePerformance = (ticker: Ticker) => {
            if (!performanceMetricsEnabledRef.current) {
              if (wasSamplingPerformance) performanceSampler.reset();
              wasSamplingPerformance = false;
              return;
            }

            wasSamplingPerformance = true;
            performanceSampler.addFrame(performance.now(), ticker.elapsedMS);
          };
          app.ticker.add(samplePerformance);
          removePerformanceListener = () => {
            app.ticker.remove(samplePerformance);
          };

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
        });

      return () => {
        active = false;
        removeListeners?.();
        removePerformanceListener?.();
        unsubscribeEditor?.();
        resizeObserver?.disconnect();
        themeObserver?.disconnect();
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
