import {
  Application,
  Container,
  Graphics,
  Text,
  Texture,
  TilingSprite,
} from "pixi.js";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import {
  SNAP_INTERVAL,
  type CanvasEditor,
  type CanvasEditorChange,
  type CanvasEditorState,
} from "./editor";
import type { CanvasNode } from "./document";
import type { Point, Rectangle } from "./geometry";
import { attachCanvasInteractions } from "./interactions";
import {
  createPerformanceSampler,
  type CanvasPerformanceMetrics,
} from "./performance";
import { createRenderScheduler } from "./render-scheduler";
import { visibleCanvasNodes } from "./visibility";
import {
  fitRectangleInViewport,
  panViewport,
  screenToWorld,
  ZOOM_STEP,
  zoomViewportAt,
  type Viewport,
} from "./viewport";

const MAX_POOLED_NODE_DISPLAYS = 256;
const GRID_DOT_RADIUS = 1;

export type InfiniteCanvasHandle = {
  fitContent: () => void;
  fitSelection: () => void;
  flushRender: () => void;
  getViewportCenter: () => Point;
  panBy: (delta: Point) => void;
  resetView: () => void;
  screenToWorld: (point: Point) => Point;
  zoomIn: () => void;
  zoomOut: () => void;
};

type InfiniteCanvasProps = {
  editor: CanvasEditor;
  onPerformanceMetricsChange: (metrics: CanvasPerformanceMetrics) => void;
  onRequestAddNode: (at: Point) => void;
  onViewportChange: (viewport: Viewport) => void;
  performanceMetricsEnabled: boolean;
  showGridDots: boolean;
};

type NodeDisplay = {
  baseX: number;
  baseY: number;
  card: Graphics;
  cardVisualKey: string;
  container: Container;
  label: Text;
  labelVisualKey: string;
  node: CanvasNode;
};

type GridDisplay = {
  spacing: number;
  sprite: TilingSprite;
  texture: Texture;
};

function gridSpacing(zoom: number) {
  let spacing = SNAP_INTERVAL * zoom;
  while (spacing < 20) spacing *= 2;
  return spacing;
}

function createGridTexture(spacing: number) {
  const size = Math.max(1, Math.ceil(spacing));
  const tileScale = spacing / size;
  const canvas = document.createElement("canvas");
  canvas.height = size;
  canvas.width = size;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = "white";
    context.beginPath();
    context.arc(
      size / 2,
      size / 2,
      GRID_DOT_RADIUS / tileScale,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  return { texture: Texture.from(canvas), tileScale };
}

function createGridDisplay(width: number, height: number, zoom: number) {
  const spacing = gridSpacing(zoom);
  const { texture, tileScale } = createGridTexture(spacing);
  const sprite = new TilingSprite({ height, texture, width });
  sprite.eventMode = "none";
  sprite.tileScale.set(tileScale);
  return { spacing, sprite, texture };
}

function updateGrid(
  display: GridDisplay,
  viewport: Viewport,
  width: number,
  height: number,
) {
  const spacing = gridSpacing(viewport.zoom);
  if (display.spacing !== spacing) {
    const previousTexture = display.texture;
    const { texture, tileScale } = createGridTexture(spacing);
    display.spacing = spacing;
    display.sprite.texture = texture;
    display.sprite.tileScale.set(tileScale);
    display.texture = texture;
    previousTexture.destroy(true);
  }

  display.sprite.setSize(width, height);
  display.sprite.tilePosition.set(
    viewport.x - spacing / 2,
    viewport.y - spacing / 2,
  );
  const dark = document.documentElement.classList.contains("dark");
  display.sprite.tint = dark ? 0xd4d4d8 : 0x71717a;
  display.sprite.alpha = dark ? 0.34 : 0.4;
}

function textResolutionForZoom(zoom: number, rendererResolution: number) {
  return Math.max(rendererResolution, Math.ceil(zoom * rendererResolution));
}

function updateNodeVisual(
  display: NodeDisplay,
  node: CanvasNode,
  dark: boolean,
  selected: boolean,
  textResolution: number,
  zoom: number,
) {
  const cardVisualKey = `${dark}:${selected}:${node.width}:${node.height}:${selected ? zoom : ""}`;
  if (display.cardVisualKey !== cardVisualKey) {
    display.card
      .clear()
      .roundRect(0, 0, node.width, node.height, 10)
      .fill({ color: dark ? 0x202024 : 0xffffff })
      .stroke({
        color: selected ? 0x6366f1 : dark ? 0x52525b : 0xd4d4d8,
        width: selected ? 2 / zoom : 1,
      });
    display.cardVisualKey = cardVisualKey;
  }

  const labelVisualKey = `${dark}:${node.width}:${node.height}:${node.label}`;
  if (display.labelVisualKey !== labelVisualKey) {
    display.label.text = node.label;
    display.label.position.set(node.width / 2, node.height / 2);
    display.label.style = {
      fill: dark ? 0xf4f4f5 : 0x27272a,
      fontFamily: "Inter Variable, Inter, sans-serif",
      fontSize: 14,
      fontWeight: "600",
    };
    display.labelVisualKey = labelVisualKey;
  }

  if (display.label.resolution !== textResolution) {
    display.label.resolution = textResolution;
  }
}

function createNodeDisplay(node: CanvasNode): NodeDisplay {
  const container = new Container();
  const card = new Graphics();
  const label = new Text({ text: node.label });
  container.eventMode = "none";
  label.anchor.set(0.5);
  container.addChild(card, label);

  return {
    baseX: node.x,
    baseY: node.y,
    card,
    cardVisualKey: "",
    container,
    label,
    labelVisualKey: "",
    node,
  };
}

function recycleNodeDisplay(
  scene: Container,
  display: NodeDisplay,
  pool: NodeDisplay[],
) {
  scene.removeChild(display.container);
  if (pool.length < MAX_POOLED_NODE_DISPLAYS) {
    pool.push(display);
  } else {
    display.container.destroy({ children: true });
  }
}

function syncDocument(
  scene: Container,
  state: CanvasEditorState,
  displays: Map<string, NodeDisplay>,
  pool: NodeDisplay[],
  visibleNodes: readonly CanvasNode[],
  textResolution: number,
  zoom: number,
) {
  const dark = document.documentElement.classList.contains("dark");
  const selectedIds = new Set(state.selectedIds);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));

  for (const [id, display] of displays) {
    if (visibleIds.has(id)) continue;
    recycleNodeDisplay(scene, display, pool);
    displays.delete(id);
  }

  for (const [index, node] of visibleNodes.entries()) {
    const selected = selectedIds.has(node.id);
    let display = displays.get(node.id);

    if (!display) {
      display = pool.pop() ?? createNodeDisplay(node);
      displays.set(node.id, display);
    }

    display.baseX = node.x;
    display.baseY = node.y;
    display.node = node;
    const moveDelta = selected ? state.moveDelta : null;
    display.container.position.set(
      node.x + (moveDelta?.x ?? 0),
      node.y + (moveDelta?.y ?? 0),
    );
    if (display.container.parent !== scene) scene.addChild(display.container);
    if (scene.children[index] !== display.container) {
      scene.setChildIndex(display.container, index);
    }

    updateNodeVisual(display, node, dark, selected, textResolution, zoom);
  }
}

function syncEditorChange(
  state: CanvasEditorState,
  displays: Map<string, NodeDisplay>,
  change: CanvasEditorChange,
  textResolution: number,
  zoom: number,
) {
  if (change.kind === "document" || change.kind === "settings") return false;

  const dark = document.documentElement.classList.contains("dark");
  const selectedIds =
    change.kind === "selection" ? new Set(state.selectedIds) : undefined;

  for (const id of change.nodeIds) {
    const display = displays.get(id);
    if (!display) continue;

    if (change.kind === "move") {
      display.container.position.set(
        display.baseX + change.delta.x,
        display.baseY + change.delta.y,
      );
    } else {
      updateNodeVisual(
        display,
        display.node,
        dark,
        selectedIds?.has(id) ?? false,
        textResolution,
        zoom,
      );
    }
  }

  return true;
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

export const InfiniteCanvas = forwardRef<
  InfiniteCanvasHandle,
  InfiniteCanvasProps
>(function InfiniteCanvas(
  {
    editor,
    onPerformanceMetricsChange,
    onRequestAddNode,
    onViewportChange,
    performanceMetricsEnabled,
    showGridDots,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const gridRef = useRef<GridDisplay | null>(null);
  const sceneRef = useRef<Container | null>(null);
  const nodeDisplaysRef = useRef(new Map<string, NodeDisplay>());
  const nodeDisplayPoolRef = useRef<NodeDisplay[]>([]);
  const worldRef = useRef<Container | null>(null);
  const marqueeRef = useRef<Graphics | null>(null);
  const onPerformanceMetricsChangeRef = useRef(onPerformanceMetricsChange);
  const performanceSamplerRef = useRef<ReturnType<
    typeof createPerformanceSampler
  > | null>(null);
  const performanceMetricsEnabledRef = useRef(performanceMetricsEnabled);
  const renderSchedulerRef = useRef<ReturnType<
    typeof createRenderScheduler
  > | null>(null);
  const textResolutionRef = useRef(1);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const showGridDotsRef = useRef(showGridDots);

  onPerformanceMetricsChangeRef.current = onPerformanceMetricsChange;
  performanceMetricsEnabledRef.current = performanceMetricsEnabled;
  showGridDotsRef.current = showGridDots;

  const syncVisibleScene = () => {
    const app = appRef.current;
    const scene = sceneRef.current;
    if (!app || !scene) return;

    const state = editor.getState();
    syncDocument(
      scene,
      state,
      nodeDisplaysRef.current,
      nodeDisplayPoolRef.current,
      visibleCanvasNodes(state, viewportRef.current, app.screen, editor.query),
      textResolutionRef.current,
      viewportRef.current.zoom,
    );
  };

  const renderViewport = (viewport: Viewport) => {
    const previousZoom = viewportRef.current.zoom;
    viewportRef.current = viewport;

    const app = appRef.current;
    const grid = gridRef.current;
    const world = worldRef.current;

    if (app && grid && world) {
      const updateStartedAt = performance.now();
      world.position.set(viewport.x, viewport.y);
      world.scale.set(viewport.zoom);
      updateGrid(grid, viewport, app.screen.width, app.screen.height);
      if (previousZoom !== viewport.zoom) {
        textResolutionRef.current = textResolutionForZoom(
          viewport.zoom,
          app.renderer.resolution,
        );
      }
      syncVisibleScene();
      if (performanceMetricsEnabledRef.current) {
        performanceSamplerRef.current?.recordUpdate(
          performance.now() - updateStartedAt,
        );
      }
      renderSchedulerRef.current?.request();
    }

    if (previousZoom !== viewport.zoom) onViewportChange(viewport);
  };

  const viewportCenter = (): Point => {
    const app = appRef.current;
    return app
      ? { x: app.screen.width / 2, y: app.screen.height / 2 }
      : { x: 0, y: 0 };
  };

  const zoomBy = (factor: number) => {
    const current = viewportRef.current;
    renderViewport(
      zoomViewportAt(current, current.zoom * factor, viewportCenter()),
    );
  };

  const resetView = () => {
    const center = viewportCenter();
    renderViewport({ x: center.x, y: center.y, zoom: 1 });
  };

  const getViewportCenter = () =>
    screenToWorld(viewportCenter(), viewportRef.current);

  const fit = (scope: "all" | "selection") => {
    const app = appRef.current;
    const bounds = editor.getBounds(scope);
    if (!app || !bounds) return;
    renderViewport(
      fitRectangleInViewport(bounds, app.screen, scope === "selection" ? 2 : 1),
    );
  };

  useImperativeHandle(ref, () => ({
    fitContent: () => fit("all"),
    fitSelection: () => fit("selection"),
    flushRender: () => {
      renderSchedulerRef.current?.cancel();
      appRef.current?.render();
    },
    getViewportCenter,
    panBy: (delta) => {
      renderViewport(panViewport(viewportRef.current, delta));
    },
    resetView,
    screenToWorld: (point) => screenToWorld(point, viewportRef.current),
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
  }));

  useEffect(() => {
    performanceSamplerRef.current?.reset();
    if (performanceMetricsEnabled) renderSchedulerRef.current?.request();
  }, [performanceMetricsEnabled]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.sprite.visible = showGridDots;
    renderSchedulerRef.current?.request();
  }, [showGridDots]);

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
        autoStart: false,
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

        const performanceSampler = createPerformanceSampler((metrics) => {
          onPerformanceMetricsChangeRef.current(metrics);
        });
        const renderScheduler = createRenderScheduler((timestamp) => {
          if (!active) return;
          const renderStartedAt = performance.now();
          app.render();
          if (performanceMetricsEnabledRef.current) {
            performanceSampler.recordRender(
              timestamp,
              performance.now() - renderStartedAt,
              nodeDisplaysRef.current.size,
            );
          }
        });
        performanceSamplerRef.current = performanceSampler;
        renderSchedulerRef.current = renderScheduler;

        const initialViewport = {
          x: app.screen.width / 2,
          y: app.screen.height / 2,
          zoom: 1,
        };
        const grid = createGridDisplay(
          app.screen.width,
          app.screen.height,
          initialViewport.zoom,
        );
        grid.sprite.visible = showGridDotsRef.current;
        const world = new Container();
        const scene = new Container();
        const marquee = new Graphics();
        app.stage.eventMode = "none";
        scene.eventMode = "none";
        world.addChild(scene);
        app.stage.addChild(grid.sprite, world, marquee);
        gridRef.current = grid;
        worldRef.current = world;
        sceneRef.current = scene;
        marqueeRef.current = marquee;

        textResolutionRef.current = textResolutionForZoom(
          initialViewport.zoom,
          app.renderer.resolution,
        );
        renderViewport(initialViewport);
        let canvasSize = {
          height: app.screen.height,
          width: app.screen.width,
        };

        const canvas = app.canvas;

        removeListeners = attachCanvasInteractions(canvas, editor, {
          fit,
          getViewport: () => viewportRef.current,
          getViewportCenter: viewportCenter,
          panBy: (delta) => {
            renderViewport(panViewport(viewportRef.current, delta));
          },
          requestNode: onRequestAddNode,
          resetView,
          setMarquee: (rectangle) => {
            drawMarquee(marquee, rectangle);
            renderScheduler.request();
          },
          zoomAt: (factor, anchor) => {
            const current = viewportRef.current;
            renderViewport(
              zoomViewportAt(current, current.zoom * factor, anchor),
            );
          },
        });

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
          const updateStartedAt = performance.now();
          updateGrid(
            grid,
            viewportRef.current,
            app.screen.width,
            app.screen.height,
          );
          syncVisibleScene();
          if (performanceMetricsEnabledRef.current) {
            performanceSampler.recordUpdate(
              performance.now() - updateStartedAt,
            );
          }
          renderScheduler.request();
        });
        themeObserver.observe(document.documentElement, {
          attributeFilter: ["class"],
          attributes: true,
        });

        unsubscribeEditor = editor.subscribe((change) => {
          const updateStartedAt = performance.now();
          let needsRender: boolean;
          if (change.kind === "document") {
            syncVisibleScene();
            needsRender = true;
          } else {
            needsRender = syncEditorChange(
              editor.getState(),
              nodeDisplaysRef.current,
              change,
              textResolutionRef.current,
              viewportRef.current.zoom,
            );
          }
          if (!needsRender) return;

          if (performanceMetricsEnabledRef.current) {
            performanceSampler.recordUpdate(
              change.updateTimeMs + performance.now() - updateStartedAt,
            );
          }
          renderScheduler.request();
        });
      });

    return () => {
      active = false;
      removeListeners?.();
      unsubscribeEditor?.();
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
      renderSchedulerRef.current?.cancel();
      gridRef.current?.texture.destroy(true);
      gridRef.current = null;
      performanceSamplerRef.current = null;
      renderSchedulerRef.current = null;
      sceneRef.current = null;
      worldRef.current = null;
      marqueeRef.current = null;
      nodeDisplaysRef.current.clear();
      for (const display of nodeDisplayPoolRef.current) {
        display.container.destroy({ children: true });
      }
      nodeDisplayPoolRef.current = [];
      textResolutionRef.current = 1;

      if (appRef.current === app) {
        appRef.current = null;
        app.destroy(true, { children: true });
      }
    };
  }, [editor, onRequestAddNode, onViewportChange]);

  return <div className="infinite-canvas" ref={hostRef} />;
});
