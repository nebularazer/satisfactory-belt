import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  TilingSprite,
} from "pixi.js";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { CATALOG_BUILDABLE_IMAGE_URLS } from "@/game/catalog-images";

import {
  NODE_WIDTH,
  SNAP_INTERVAL,
  type CanvasEditor,
  type CanvasEditorChange,
  type CanvasEditorState,
} from "./editor";
import { canvasNodeId, type CanvasNode } from "./document";
import type { Point, Rectangle } from "./geometry";
import { attachCanvasInteractions } from "./interactions";
import {
  createNodeCardModel,
  type NodeCardMaterial,
  type NodeCardModel,
  type NodeCardPortStatus,
} from "./node-card-model";
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
  clock: Text;
  container: Container;
  efficiency: Text;
  footerIcons: Graphics;
  inputs: readonly MaterialDisplay[];
  machineImage: Sprite;
  machineImageVisualKey: string;
  model?: NodeCardModel;
  modelNode?: CanvasNode;
  node: CanvasNode;
  outputs: readonly MaterialDisplay[];
  power: Text;
  subtitle: Text;
  title: Text;
};

type MaterialDisplay = {
  image: Sprite;
  imageVisualKey: string;
  port: Graphics;
  rate: Text;
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

const NODE_CARD_SIZE = NODE_WIDTH;
const NODE_CARD_HEADER_HEIGHT = 48;
const NODE_CARD_FOOTER_HEIGHT = 48;
const INPUT_PORT_Y = [80, 112, 144, 176] as const;
const OUTPUT_PORT_Y = [112, 144] as const;
const BLUEPRINT_COLORS = {
  blocked: 0xb75b65,
  input: 0xb8794f,
  output: 0x5a9b8c,
  selected: 0x3d6f9f,
  warning: 0xc29b3c,
} as const;

function requestTexture(imageUrl: string, onReady: () => void) {
  if (Assets.cache.has(imageUrl)) return;
  void Assets.load(imageUrl)
    .then(onReady)
    .catch(() => undefined);
}

function cachedTexture(imageUrl: string) {
  return Assets.cache.has(imageUrl) ? Assets.get<Texture>(imageUrl) : undefined;
}

function statusColor(status: NodeCardPortStatus) {
  if (status === "warning") return BLUEPRINT_COLORS.warning;
  if (status === "blocked") return BLUEPRINT_COLORS.blocked;
  return undefined;
}

function updateTextResolution(text: Text, resolution: number) {
  if (text.resolution !== resolution) text.resolution = resolution;
}

function fitText(text: Text, value: string, maximumWidth: number) {
  text.text = value;
  if (text.width <= maximumWidth) return;

  let lower = 0;
  let upper = value.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    text.text = `${value.slice(0, middle).trimEnd()}…`;
    if (text.width <= maximumWidth) lower = middle;
    else upper = middle - 1;
  }
  text.text = `${value.slice(0, lower).trimEnd()}…`;
}

function updateMaterialVisual(
  display: MaterialDisplay,
  material: NodeCardMaterial | undefined,
  role: "input" | "output",
  index: number,
  dark: boolean,
  textResolution: number,
  onAssetReady: () => void,
) {
  const y = (role === "input" ? INPUT_PORT_Y : OUTPUT_PORT_Y)[index];
  const visible = material !== undefined && y !== undefined;
  display.image.visible = visible;
  display.port.visible = visible;
  display.rate.visible = visible;
  if (!visible || !material || y === undefined) return;

  const imageUrl = material.imageUrl ?? "";
  const texture = imageUrl ? cachedTexture(imageUrl) : undefined;
  const imageVisualKey = `${imageUrl}:${Boolean(texture)}`;
  if (display.imageVisualKey !== imageVisualKey) {
    display.image.texture = texture ?? Texture.EMPTY;
    display.image.visible = Boolean(texture);
    display.imageVisualKey = imageVisualKey;
  }
  if (imageUrl && !texture) requestTexture(imageUrl, onAssetReady);

  display.image.anchor.set(0.5);
  display.image.position.set(role === "input" ? 28 : 228, y);
  display.image.setSize(24, 24);
  display.rate.anchor.set(role === "input" ? 0 : 1, 0.5);
  display.rate.position.set(role === "input" ? 46 : 210, y);
  display.rate.text = material.rate;
  display.rate.style = {
    fill: material.connected
      ? dark
        ? 0xe4e4e7
        : 0x3f3f46
      : dark
        ? 0x52525b
        : 0xa1a1aa,
    fontFamily: "Inter Variable, Inter, sans-serif",
    fontSize: 12,
    fontWeight: "400",
  };
  updateTextResolution(display.rate, textResolution);

  const center = statusColor(material.status);
  display.port
    .clear()
    .circle(0, 0, 10)
    .fill({
      color:
        role === "input" ? BLUEPRINT_COLORS.input : BLUEPRINT_COLORS.output,
    })
    .circle(0, 0, 8)
    .fill({ color: dark ? 0x18181b : 0xffffff });
  if (center !== undefined) {
    display.port.circle(0, 0, 5).fill({ color: center });
  }
  display.port.position.set(role === "input" ? 0 : NODE_CARD_SIZE, y);
}

function drawFooterIcons(
  graphics: Graphics,
  powerTextWidth: number,
  efficiencyStatus: NodeCardPortStatus,
  dark: boolean,
) {
  const foreground = dark ? 0xd4d4d8 : 0x52525b;
  const efficiency = statusColor(efficiencyStatus) ?? foreground;
  const powerX = 240 - powerTextWidth - 10;
  graphics
    .clear()
    .arc(21, 233, 6, Math.PI, 0)
    .stroke({ color: foreground, width: 1.5 })
    .moveTo(21, 233)
    .lineTo(25, 229)
    .stroke({ color: foreground, width: 1.5 })
    .circle(78, 232, 6)
    .stroke({ color: efficiency, width: 1.5 })
    .moveTo(74, 233)
    .lineTo(76, 230)
    .lineTo(79, 234)
    .lineTo(82, 229)
    .stroke({ color: efficiency, width: 1.25 })
    .poly([
      powerX,
      225,
      powerX - 4,
      232,
      powerX,
      232,
      powerX - 2,
      239,
      powerX + 5,
      230,
      powerX + 1,
      230,
    ])
    .fill({ color: 0xeab308 });
}

function updateNodeVisual(
  display: NodeDisplay,
  node: CanvasNode,
  dark: boolean,
  selected: boolean,
  textResolution: number,
  zoom: number,
  onAssetReady: () => void,
) {
  const model =
    display.modelNode === node && display.model
      ? display.model
      : createNodeCardModel(node);
  display.model = model;
  display.modelNode = node;
  const cardVisualKey = `${dark}:${selected}:${selected ? zoom : ""}`;
  if (display.cardVisualKey !== cardVisualKey) {
    const body = dark ? 0x18181b : 0xffffff;
    const chrome = dark ? 0x242427 : 0xfafafa;
    const border = selected
      ? BLUEPRINT_COLORS.selected
      : dark
        ? 0x3f3f46
        : 0xd4d4d8;
    display.card
      .clear()
      .roundRect(0, 0, NODE_CARD_SIZE, NODE_CARD_SIZE, 12)
      .fill({ color: body })
      .roundRect(0, 0, NODE_CARD_SIZE, NODE_CARD_HEADER_HEIGHT, 12)
      .fill({ color: chrome })
      .rect(0, 12, NODE_CARD_SIZE, NODE_CARD_HEADER_HEIGHT - 12)
      .fill({ color: chrome })
      .roundRect(
        0,
        NODE_CARD_SIZE - NODE_CARD_FOOTER_HEIGHT,
        NODE_CARD_SIZE,
        NODE_CARD_FOOTER_HEIGHT,
        12,
      )
      .fill({ color: chrome })
      .rect(
        0,
        NODE_CARD_SIZE - NODE_CARD_FOOTER_HEIGHT,
        NODE_CARD_SIZE,
        NODE_CARD_FOOTER_HEIGHT - 12,
      )
      .fill({ color: chrome })
      .moveTo(0, NODE_CARD_HEADER_HEIGHT)
      .lineTo(NODE_CARD_SIZE, NODE_CARD_HEADER_HEIGHT)
      .moveTo(0, NODE_CARD_SIZE - NODE_CARD_FOOTER_HEIGHT)
      .lineTo(NODE_CARD_SIZE, NODE_CARD_SIZE - NODE_CARD_FOOTER_HEIGHT)
      .stroke({ color: dark ? 0x3f3f46 : 0xe4e4e7, width: 1 })
      .roundRect(0, 0, NODE_CARD_SIZE, NODE_CARD_SIZE, 12)
      .stroke({
        color: border,
        width: selected ? 2 / zoom : 1,
      });
    display.cardVisualKey = cardVisualKey;
  }

  display.title.style = {
    fill: dark ? 0xf4f4f5 : 0x27272a,
    fontFamily: "Inter Variable, Inter, sans-serif",
    fontSize: 16,
    fontWeight: "600",
  };
  display.subtitle.style = {
    fill: dark ? 0xa1a1aa : 0x71717a,
    fontFamily: "Inter Variable, Inter, sans-serif",
    fontSize: 12,
    fontWeight: "500",
  };
  fitText(display.title, model.title, 168);
  fitText(display.subtitle, model.subtitle, 168);

  const machineImageUrl = model.buildableImageUrl ?? "";
  const machineTexture = machineImageUrl
    ? cachedTexture(machineImageUrl)
    : undefined;
  const machineImageVisualKey = `${machineImageUrl}:${Boolean(machineTexture)}`;
  if (display.machineImageVisualKey !== machineImageVisualKey) {
    display.machineImage.texture = machineTexture ?? Texture.EMPTY;
    display.machineImage.setSize(40, 40);
    display.machineImage.visible = Boolean(machineTexture);
    display.machineImageVisualKey = machineImageVisualKey;
  }
  if (machineImageUrl && !machineTexture) {
    requestTexture(machineImageUrl, onAssetReady);
  }

  display.inputs.forEach((materialDisplay, index) =>
    updateMaterialVisual(
      materialDisplay,
      model.inputs[index],
      "input",
      index,
      dark,
      textResolution,
      onAssetReady,
    ),
  );
  display.outputs.forEach((materialDisplay, index) =>
    updateMaterialVisual(
      materialDisplay,
      model.outputs[index],
      "output",
      index,
      dark,
      textResolution,
      onAssetReady,
    ),
  );

  const metricStyle = {
    fill: dark ? 0xd4d4d8 : 0x52525b,
    fontFamily: "Inter Variable, Inter, sans-serif",
    fontSize: 12,
    fontWeight: "600" as const,
  };
  display.clock.text = model.clock;
  display.clock.style = metricStyle;
  display.efficiency.text = model.efficiency.percent;
  display.efficiency.style = {
    ...metricStyle,
    fill: statusColor(model.efficiency.status) ?? (dark ? 0xd4d4d8 : 0x52525b),
  };
  display.power.text = model.power;
  display.power.style = metricStyle;
  drawFooterIcons(
    display.footerIcons,
    display.power.width,
    model.efficiency.status,
    dark,
  );

  for (const text of [
    display.title,
    display.subtitle,
    display.clock,
    display.efficiency,
    display.power,
  ]) {
    updateTextResolution(text, textResolution);
  }
}

function createMaterialDisplay(): MaterialDisplay {
  const image = new Sprite(Texture.EMPTY);
  const port = new Graphics();
  const rate = new Text({ text: "" });
  image.visible = false;
  port.visible = false;
  rate.visible = false;
  return { image, imageVisualKey: "", port, rate };
}

function createNodeDisplay(node: CanvasNode): NodeDisplay {
  const container = new Container();
  const card = new Graphics();
  const machineImage = new Sprite(Texture.EMPTY);
  const title = new Text({ text: "" });
  const subtitle = new Text({ text: "" });
  const inputs = Array.from({ length: 4 }, createMaterialDisplay);
  const outputs = Array.from({ length: 2 }, createMaterialDisplay);
  const footerIcons = new Graphics();
  const clock = new Text({ text: "" });
  const efficiency = new Text({ text: "" });
  const power = new Text({ text: "" });

  container.eventMode = "none";
  machineImage.anchor.set(0.5);
  machineImage.position.set(36, 24);
  machineImage.setSize(40, 40);
  machineImage.visible = false;
  title.position.set(72, 6);
  subtitle.position.set(72, 28);
  clock.anchor.set(0, 0.5);
  clock.position.set(30, 232);
  efficiency.anchor.set(0, 0.5);
  efficiency.position.set(87, 232);
  power.anchor.set(1, 0.5);
  power.position.set(240, 232);

  container.addChild(
    card,
    machineImage,
    title,
    subtitle,
    ...inputs.flatMap(({ image, port, rate }) => [image, rate, port]),
    ...outputs.flatMap(({ image, port, rate }) => [image, rate, port]),
    footerIcons,
    clock,
    efficiency,
    power,
  );

  return {
    baseX: node.x,
    baseY: node.y,
    card,
    cardVisualKey: "",
    clock,
    container,
    efficiency,
    footerIcons,
    inputs,
    machineImage,
    machineImageVisualKey: "",
    node,
    outputs,
    power,
    subtitle,
    title,
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
  onAssetReady: () => void,
) {
  const dark = document.documentElement.classList.contains("dark");
  const selectedIds = new Set(state.selectedIds);
  const visibleIds = new Set(visibleNodes.map(canvasNodeId));

  for (const [id, display] of displays) {
    if (visibleIds.has(id)) continue;
    recycleNodeDisplay(scene, display, pool);
    displays.delete(id);
  }

  for (const [index, node] of visibleNodes.entries()) {
    const id = canvasNodeId(node);
    const selected = selectedIds.has(id);
    let display = displays.get(id);

    if (!display) {
      display = pool.pop() ?? createNodeDisplay(node);
      displays.set(id, display);
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

    updateNodeVisual(
      display,
      node,
      dark,
      selected,
      textResolution,
      zoom,
      onAssetReady,
    );
  }
}

function syncEditorChange(
  state: CanvasEditorState,
  displays: Map<string, NodeDisplay>,
  change: CanvasEditorChange,
  textResolution: number,
  zoom: number,
  onAssetReady: () => void,
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
        onAssetReady,
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
      () => {
        syncVisibleScene();
        renderSchedulerRef.current?.request();
      },
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
      .then(async () => {
        await Promise.allSettled(
          CATALOG_BUILDABLE_IMAGE_URLS.map((imageUrl) => Assets.load(imageUrl)),
        );
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
              () => {
                syncVisibleScene();
                renderSchedulerRef.current?.request();
              },
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
